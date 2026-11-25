import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, type TestUser } from "./helpers";

// Sharing (migration 20261125190000_sharing.sql): an owner shares the whole
// book or some recipes with an email; only that person sees the share, and
// accepting copies the chosen recipes into their own book, tagged. The
// sharer's book itself is never opened to them.

let gil: TestUser; // shares
let dana: TestUser; // receives
let stranger: TestUser;
let contributor: TestUser; // in Gil's book, not its owner
let soup: string;
let cake: string;
let draft: string;

const share = (user: TestUser, to: string, recipeIds: string[] | null = null) =>
  user.client
    .from("shares")
    .insert({
      from_book_id: gil.bookId,
      from_user: user.id,
      sender_name: "גיל",
      to_email: to.toLowerCase(),
      recipe_ids: recipeIds,
    })
    .select("id")
    .single();

beforeAll(async () => {
  [gil, dana, stranger, contributor] = await Promise.all([
    createUser("share-gil"),
    createUser("share-dana"),
    createUser("share-stranger"),
    createUser("share-contrib"),
  ]);
  await admin()
    .from("book_members")
    .insert({ book_id: gil.bookId, user_id: contributor.id, role: "contributor" });
  const { data: cats } = await admin()
    .from("categories")
    .select("id, name")
    .eq("book_id", gil.bookId)
    .eq("name", "מרקים")
    .single();
  const { data: recipes } = await admin()
    .from("recipes")
    .insert([
      {
        book_id: gil.bookId,
        title: "מרק עדשים",
        status: "approved",
        category_id: cats!.id,
        tags: ["משפחתי"],
      },
      { book_id: gil.bookId, title: "עוגת שמרים", status: "approved" },
      { book_id: gil.bookId, title: "טיוטה", status: "pending" },
    ])
    .select("id, title");
  soup = recipes!.find((r) => r.title === "מרק עדשים")!.id;
  cake = recipes!.find((r) => r.title === "עוגת שמרים")!.id;
  draft = recipes!.find((r) => r.title === "טיוטה")!.id;
  await admin()
    .from("ingredients")
    .insert([
      {
        recipe_id: soup,
        book_id: gil.bookId,
        display_text: "2 כוסות עדשים",
        canonical_name: "עדשים",
        position: 0,
      },
      {
        recipe_id: soup,
        book_id: gil.bookId,
        display_text: "בצל",
        canonical_name: "בצל",
        position: 1,
      },
    ]);
  await admin()
    .from("steps")
    .insert({ recipe_id: soup, book_id: gil.bookId, position: 0, text: "מבשלים." });
});

afterAll(cleanupUsers);

describe("sharing", () => {
  it("is for the book's owner, with recipes from that book only", async () => {
    expect((await share(contributor, dana.email)).error).not.toBeNull();
    expect((await share(gil, dana.email, [draft])).error?.message).toContain("share_bad_recipe");
    const { data: other } = await admin()
      .from("recipes")
      .insert({ book_id: stranger.bookId, title: "של מישהו אחר", status: "approved" })
      .select("id")
      .single();
    expect((await share(gil, dana.email, [other!.id])).error?.message).toContain(
      "share_bad_recipe",
    );
    expect((await share(gil, gil.email)).error?.message).toContain("share_self");
  });

  it("is seen by the sender and its recipient only", async () => {
    const { data, error } = await share(gil, dana.email, [soup]);
    expect(error).toBeNull();
    const seen = async (u: TestUser) =>
      (await u.client.from("shares").select("id").eq("id", data!.id)).data?.length ?? 0;
    expect(await seen(gil)).toBe(1);
    expect(await seen(dana)).toBe(1);
    expect(await seen(stranger)).toBe(0);
    expect(await seen(contributor)).toBe(0);

    // Only the recipient previews it, and sees titles, not the book.
    expect(
      (await stranger.client.rpc("share_preview", { p_share: data!.id })).error,
    ).not.toBeNull();
    const { data: preview } = await dana.client.rpc("share_preview", { p_share: data!.id });
    expect(preview).toEqual([{ recipe_id: soup, title: "מרק עדשים", category: "מרקים" }]);
    expect((await dana.client.from("recipes").select("id").eq("id", soup)).data).toEqual([]);

    // The recipient can't rewrite it, only decline; the sender can withdraw it.
    await dana.client.from("shares").update({ status: "accepted" }).eq("id", data!.id);
    const { data: still } = await admin()
      .from("shares")
      .select("status")
      .eq("id", data!.id)
      .single();
    expect(still!.status).toBe("pending");
    expect((await stranger.client.rpc("accept_share", { p_share: data!.id })).error).not.toBeNull();
    await gil.client.from("shares").delete().eq("id", data!.id);
    expect((await admin().from("shares").select("id").eq("id", data!.id)).data).toEqual([]);
  });

  it("copies the chosen recipes into the recipient's book, tagged", async () => {
    const { data } = await share(gil, dana.email); // the whole book
    const { data: preview } = await dana.client.rpc("share_preview", { p_share: data!.id });
    expect(preview!.map((r) => r.title).sort()).toEqual(["מרק עדשים", "עוגת שמרים"]); // no drafts

    const { data: count, error } = await dana.client.rpc("accept_share", {
      p_share: data!.id,
      p_recipe_ids: [soup],
    });
    expect(error).toBeNull();
    expect(count).toBe(1);

    const { data: copies } = await dana.client
      .from("recipes")
      .select(
        "id, title, status, tags, book_id, categories(name), ingredients(display_text), steps(text)",
      )
      .eq("book_id", dana.bookId);
    expect(copies).toHaveLength(1);
    const copy = copies![0];
    expect(copy).toMatchObject({ title: "מרק עדשים", status: "approved", book_id: dana.bookId });
    expect(copy.tags.sort()).toEqual(["משפחתי", "שותף מגיל"].sort());
    expect(copy.categories?.name).toBe("מרקים");
    expect(copy.ingredients.map((i) => i.display_text).sort()).toEqual(["2 כוסות עדשים", "בצל"]);
    expect(copy.steps.map((s) => s.text)).toEqual(["מבשלים."]);

    // The copy is Dana's: she can change it, and Gil's recipe stays as it was.
    await dana.client.from("recipes").update({ title: "המרק שלי" }).eq("id", copy.id);
    const { data: original } = await admin()
      .from("recipes")
      .select("title")
      .eq("id", soup)
      .single();
    expect(original!.title).toBe("מרק עדשים");

    // Answered once.
    const again = await dana.client.rpc("accept_share", { p_share: data!.id });
    expect(again.error?.message).toContain("already_answered");
    const { data: sent } = await gil.client
      .from("shares")
      .select("status, added_count")
      .eq("id", data!.id)
      .single();
    expect(sent).toEqual({ status: "accepted", added_count: 1 });
  });

  it("opens a shared photo to its recipient only until it's copied", async () => {
    const path = `${gil.bookId}/${cake}/photo.jpg`;
    await admin()
      .storage.from("recipe-images")
      .upload(path, new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }));
    await admin().from("recipe_images").insert({
      recipe_id: cake,
      book_id: gil.bookId,
      storage_path: path,
      credit_name: "אתר",
      credit_url: "https://example.com/cake",
    });
    const read = (u: TestUser) => u.client.storage.from("recipe-images").createSignedUrl(path, 60);
    expect((await read(dana)).error).not.toBeNull(); // nothing shared yet

    const { data } = await share(gil, dana.email, [cake]);
    await dana.client.rpc("accept_share", { p_share: data!.id });
    expect((await stranger.client.rpc("share_photos", { p_share: data!.id })).data).toEqual([]);
    const { data: photos } = await dana.client.rpc("share_photos", { p_share: data!.id });
    expect(photos).toHaveLength(1);
    expect(photos![0]).toMatchObject({
      from_recipe_id: cake,
      storage_path: path,
      to_book_id: dana.bookId,
    });
    expect((await read(dana)).error).toBeNull();
    expect((await read(stranger)).error).not.toBeNull();

    // Copied in Storage, into Dana's folder, with the credit.
    const to = `${dana.bookId}/${photos![0].to_recipe_id}/shared.jpg`;
    expect((await dana.client.storage.from("recipe-images").copy(path, to)).error).toBeNull();
    const { error } = await dana.client.from("recipe_images").insert({
      recipe_id: photos![0].to_recipe_id,
      book_id: dana.bookId,
      storage_path: to,
      credit_name: photos![0].credit_name,
      credit_url: photos![0].credit_url,
    });
    expect(error).toBeNull();
    await dana.client.rpc("share_photos_done", { p_share: data!.id, p_from_recipe_ids: [cake] });
    expect((await read(dana)).error).not.toBeNull(); // closed again
  });

  it("can be declined, and a declined share can't be accepted", async () => {
    const { data } = await share(gil, stranger.email, [cake]);
    const { error } = await stranger.client
      .from("shares")
      .update({ status: "declined" })
      .eq("id", data!.id);
    expect(error).toBeNull();
    expect(
      (await stranger.client.rpc("accept_share", { p_share: data!.id })).error?.message,
    ).toContain("not_found");
  });
});
