import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, type TestUser } from "./helpers";

// More than one book, whole-book shares that follow the book, and
// invitations into the book itself (migration 20261125230000).

let gil: TestUser; // an app admin with a book to share
let dana: TestUser;
let noa: TestUser;
let waiting: TestUser; // not approved

const addRecipe = async (title: string) => {
  const { data } = await admin()
    .from("recipes")
    .insert({ book_id: gil.bookId, title, status: "approved", category_id: null, tags: [] })
    .select("id")
    .single();
  return data!.id;
};

const shareBook = (to: TestUser, canAdd = false) =>
  gil.client
    .from("shares")
    .insert({
      from_book_id: gil.bookId,
      from_user: gil.id,
      sender_name: "גיל",
      to_email: to.email,
      recipe_ids: null,
      can_add: canAdd,
    })
    .select("id")
    .single();

const titlesIn = async (u: TestUser, bookId: string) =>
  ((await u.client.from("recipes").select("title").eq("book_id", bookId)).data ?? [])
    .map((r) => r.title)
    .sort();

beforeAll(async () => {
  [gil, dana, noa, waiting] = await Promise.all([
    createUser("books-gil"),
    createUser("books-dana"),
    createUser("books-noa"),
    createUser("books-waiting", { approved: false }),
  ]);
  await admin().from("app_admins").insert({ user_id: gil.id });
  await addRecipe("מרק עדשים");
});

afterAll(cleanupUsers);

describe("new books", () => {
  it("open with the default categories; an admin's get the AI", async () => {
    const { data: id, error } = await gil.client.rpc("create_book", { p_name: "ספר הקינוחים" });
    expect(error).toBeNull();
    const { data: book } = await gil.client.from("books").select("name").eq("id", id!).single();
    expect(book!.name).toBe("ספר הקינוחים");
    const { count } = await gil.client
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("book_id", id!);
    expect(count).toBeGreaterThan(5);
    expect(
      (await admin().from("ai_access").select("book_id").eq("book_id", id!)).data,
    ).toHaveLength(1);

    const { data: hers } = await dana.client.rpc("create_book", { p_name: "שלי" });
    expect((await admin().from("ai_access").select("book_id").eq("book_id", hers!)).data).toEqual(
      [],
    );
  });

  it("need an approved account and a name", async () => {
    expect((await waiting.client.rpc("create_book", { p_name: "לא" })).error?.message).toContain(
      "not_approved",
    );
    expect((await dana.client.rpc("create_book", { p_name: "  " })).error?.message).toContain(
      "bad_name",
    );
  });
});

describe("a whole book, taken whole", () => {
  let shareId: string;

  it("follows the book: recipes added later are copied in, once", async () => {
    const { data } = await shareBook(dana);
    shareId = data!.id;
    expect((await dana.client.rpc("accept_share", { p_share: shareId })).data).toBe(1);
    expect(await titlesIn(dana, dana.bookId)).toEqual(["מרק עדשים"]);

    await addRecipe("עוגת תפוזים");
    const { data: news } = await dana.client.rpc("sync_shared_books");
    expect(news).toEqual([{ share_id: shareId, sender_name: "גיל", added: 1 }]);
    expect(await titlesIn(dana, dana.bookId)).toEqual(["מרק עדשים", "עוגת תפוזים"]);
    expect((await dana.client.rpc("sync_shared_books")).data).toEqual([]);
  });

  it("doesn't bring back a copy the recipient deleted", async () => {
    await dana.client
      .from("recipes")
      .delete()
      .eq("book_id", dana.bookId)
      .eq("title", "עוגת תפוזים");
    expect((await dana.client.rpc("sync_shared_books")).data).toEqual([]);
    expect(await titlesIn(dana, dana.bookId)).toEqual(["מרק עדשים"]);
  });

  it("stops when either side says so", async () => {
    await gil.client.rpc("stop_share_updates", { p_share: shareId });
    await addRecipe("פשטידה");
    expect((await dana.client.rpc("sync_shared_books")).data).toEqual([]);
    expect((await noa.client.rpc("stop_share_updates", { p_share: shareId })).error).toBeNull();
  });

  it("doesn't follow when only some recipes were taken, and goes into the chosen book", async () => {
    const { data: second } = await noa.client.rpc("create_book", { p_name: "הספר השני של נועה" });
    const { data } = await shareBook(noa);
    const { data: recipes } = await noa.client.rpc("share_preview", { p_share: data!.id });
    const soup = recipes!.find((r) => r.title === "מרק עדשים")!.recipe_id;
    // Someone else's book can't be the target.
    expect(
      (await noa.client.rpc("accept_share", { p_share: data!.id, p_book: gil.bookId })).error
        ?.message,
    ).toContain("no_book");
    await noa.client.rpc("accept_share", {
      p_share: data!.id,
      p_recipe_ids: [soup],
      p_book: second!,
    });
    expect(await titlesIn(noa, second!)).toEqual(["מרק עדשים"]);
    const { data: share } = await admin()
      .from("shares")
      .select("follow")
      .eq("id", data!.id)
      .single();
    expect(share!.follow).toBe(false);
  });
});

describe("an invitation into the book", () => {
  it("is for the whole book only", async () => {
    const { error } = await gil.client.from("shares").insert({
      from_book_id: gil.bookId,
      from_user: gil.id,
      sender_name: "גיל",
      to_email: noa.email,
      recipe_ids: [await addRecipe("ריבה")],
      can_add: true,
    });
    expect(error?.message).toContain("share_bad_recipe");
  });

  it("lets them see the book live and add to it, until the owner takes them out", async () => {
    const { data } = await shareBook(noa, true);
    expect((await noa.client.rpc("accept_share", { p_share: data!.id })).data).toBe(0);
    expect(await titlesIn(noa, gil.bookId)).toContain("מרק עדשים");

    const { data: added, error } = await noa.client
      .from("recipes")
      .insert({
        book_id: gil.bookId,
        title: "הסלט של נועה",
        status: "approved",
        created_by: noa.id,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    const ing = await noa.client.from("ingredients").insert({
      recipe_id: added!.id,
      book_id: gil.bookId,
      display_text: "חסה",
      position: 0,
    });
    expect(ing.error).toBeNull();
    expect(await titlesIn(gil, gil.bookId)).toContain("הסלט של נועה");
    // Their own recipes only.
    const soup = (
      await gil.client
        .from("recipes")
        .select("id")
        .eq("title", "מרק עדשים")
        .eq("book_id", gil.bookId)
        .single()
    ).data!.id;
    await noa.client.from("recipes").update({ title: "שלי עכשיו" }).eq("id", soup);
    expect(await titlesIn(gil, gil.bookId)).toContain("מרק עדשים");

    await gil.client
      .from("book_members")
      .update({ revoked_at: new Date().toISOString() })
      .eq("book_id", gil.bookId)
      .eq("user_id", noa.id);
    expect(await titlesIn(noa, gil.bookId)).toEqual([]);
    expect(await titlesIn(gil, gil.bookId)).toContain("הסלט של נועה");
  });
});
