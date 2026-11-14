import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anon,
  cleanupUsers,
  createUser,
  png,
  seedRecipe,
  type Client,
  type TestUser,
} from "./helpers";

/** Untyped view of a client, for calls where the table name is a variable. */
const loose = (client: Client) => client as unknown as SupabaseClient;

type Table =
  | "books"
  | "book_members"
  | "categories"
  | "recipes"
  | "ingredients"
  | "steps"
  | "recipe_images"
  | "invites"
  | "preferences";

/** Every book-scoped table, with a hostile insert and update aimed at another book. */
type Spec = {
  table: Table;
  bookColumn: "id" | "book_id";
  insert: (victim: Victim, attacker: TestUser) => Record<string, unknown>;
  update: Record<string, unknown>;
};
type Victim = TestUser & { recipeId: string; categoryId: string };

const specs: Spec[] = [
  {
    table: "books",
    bookColumn: "id",
    insert: () => ({ name: "ספר מזויף" }),
    update: { name: "נפרץ" },
  },
  {
    table: "book_members",
    bookColumn: "book_id",
    insert: (v, a) => ({ book_id: v.bookId, user_id: a.id, role: "viewer" }),
    update: { revoked_at: new Date().toISOString() },
  },
  {
    table: "categories",
    bookColumn: "book_id",
    insert: (v) => ({ book_id: v.bookId, name: "קטגוריה זרה" }),
    update: { name: "נפרץ" },
  },
  {
    table: "recipes",
    bookColumn: "book_id",
    insert: (v) => ({ book_id: v.bookId, title: "מתכון זר", status: "approved" }),
    update: { title: "נפרץ" },
  },
  {
    table: "ingredients",
    bookColumn: "book_id",
    insert: (v) => ({ book_id: v.bookId, recipe_id: v.recipeId, display_text: "רעל" }),
    update: { display_text: "נפרץ" },
  },
  {
    table: "steps",
    bookColumn: "book_id",
    insert: (v) => ({ book_id: v.bookId, recipe_id: v.recipeId, text: "נפרץ" }),
    update: { text: "נפרץ" },
  },
  {
    table: "recipe_images",
    bookColumn: "book_id",
    insert: (v) => ({
      book_id: v.bookId,
      recipe_id: v.recipeId,
      storage_path: `${v.bookId}/${v.recipeId}/evil.png`,
    }),
    update: { position: 99 },
  },
  {
    table: "invites",
    bookColumn: "book_id",
    insert: (v, a) => ({
      book_id: v.bookId,
      email: "evil@test.local",
      token_hash: randomUUID(),
      invited_by: a.id,
    }),
    update: { email: "evil@test.local" },
  },
  {
    table: "preferences",
    bookColumn: "book_id",
    insert: (v) => ({ book_id: v.bookId, scope: "global", excluded_ingredients: ["הכול"] }),
    update: { excluded_ingredients: ["נפרץ"] },
  },
];

/** Everything in a book, read with the service role, to prove nothing changed. */
async function snapshot(bookId: string) {
  const db = admin();
  const out: Record<string, unknown> = {};
  for (const s of specs) {
    const { data, error } = await loose(db).from(s.table).select("*").eq(s.bookColumn, bookId);
    if (error) throw error;
    out[s.table] = (data as Record<string, unknown>[]).sort((x, y) =>
      JSON.stringify(x).localeCompare(JSON.stringify(y)),
    );
  }
  const { data: folders } = await db.storage.from("recipe-images").list(bookId);
  out.storage = folders?.map((f) => f.name).sort();
  return out;
}

/** True when a write was refused: an error, or zero affected rows. */
function refused(res: { error: unknown; data: unknown }) {
  return res.error !== null || (Array.isArray(res.data) && res.data.length === 0);
}

/**
 * Stricter: refused by RLS or privileges specifically (permission denied, or
 * zero rows affected), so a constraint violation can't pass for a refusal.
 */
function refusedByRls(res: { error: { code?: string } | null; data: unknown }) {
  return res.error ? res.error.code === "42501" : Array.isArray(res.data) && res.data.length === 0;
}

let alice: TestUser; // attacker
let bob: Victim; // victim
let bobImage: string;
let bobBefore: Record<string, unknown>;

beforeAll(async () => {
  alice = await createUser("alice");
  const b = await createUser("bob");

  // Bob fills his own book through his own client (owners can write).
  const { recipe, imagePath } = await seedRecipe(b);
  const { data: category } = await b.client
    .from("categories")
    .select("id")
    .eq("book_id", b.bookId)
    .limit(1)
    .single();
  const pref = await b.client
    .from("preferences")
    .insert({ book_id: b.bookId, scope: "global", excluded_ingredients: ["הל"] });
  const inv = await b.client.from("invites").insert({
    book_id: b.bookId,
    email: "friend@test.local",
    token_hash: randomUUID(),
    invited_by: b.id,
  });
  expect(pref.error).toBeNull();
  expect(inv.error).toBeNull();

  bob = { ...b, recipeId: recipe.id, categoryId: category!.id };
  bobImage = imagePath;
  bobBefore = await snapshot(bob.bookId);
});

afterAll(cleanupUsers);

describe("another user's book is invisible and untouchable", () => {
  describe.each(specs)("$table", (spec) => {
    it("the victim can see their own rows (so the checks below aren't vacuous)", async () => {
      const { data, error } = await loose(bob.client)
        .from(spec.table)
        .select("*")
        .eq(spec.bookColumn, bob.bookId);
      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    });

    it("select returns nothing", async () => {
      const { data, error } = await loose(alice.client)
        .from(spec.table)
        .select("*")
        .eq(spec.bookColumn, bob.bookId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("insert is refused", async () => {
      const res = await loose(alice.client)
        .from(spec.table)
        .insert(spec.insert(bob, alice) as never)
        .select();
      expect(res.error).not.toBeNull();
    });

    it("update changes nothing", async () => {
      const res = await loose(alice.client)
        .from(spec.table)
        .update(spec.update as never)
        .eq(spec.bookColumn, bob.bookId)
        .select();
      expect(refused(res)).toBe(true);
    });

    it("delete removes nothing", async () => {
      const res = await loose(alice.client)
        .from(spec.table)
        .delete()
        .eq(spec.bookColumn, bob.bookId)
        .select();
      expect(refused(res)).toBe(true);
    });
  });

  it("can't attach rows in one's own book to another book's recipe", async () => {
    const res = await alice.client
      .from("ingredients")
      .insert({ book_id: alice.bookId, recipe_id: bob.recipeId, display_text: "גניבה" });
    expect(res.error).not.toBeNull();
  });

  it("can't file one's own recipe under another book's category", async () => {
    const res = await alice.client.from("recipes").insert({
      book_id: alice.bookId,
      title: "x",
      category_id: bob.categoryId,
      status: "approved",
    });
    expect(res.error).not.toBeNull();
  });

  describe("profiles", () => {
    it("can't read, change or delete another user's profile", async () => {
      const read = await alice.client.from("profiles").select("*").eq("id", bob.id);
      expect(read.data).toEqual([]);
      const upd = await alice.client
        .from("profiles")
        .update({ display_name: "נפרץ" })
        .eq("id", bob.id)
        .select();
      expect(refused(upd)).toBe(true);
      const del = await alice.client.from("profiles").delete().eq("id", bob.id).select();
      expect(refused(del)).toBe(true);
    });

    it("can rename oneself but not change one's email", async () => {
      const ok = await alice.client
        .from("profiles")
        .update({ display_name: "אליס" })
        .eq("id", alice.id);
      expect(ok.error).toBeNull();
      const bad = await alice.client
        .from("profiles")
        .update({ email: "x@test.local" })
        .eq("id", alice.id);
      expect(bad.error).not.toBeNull();
    });
  });

  describe("storage bucket", () => {
    const bucket = () => alice.client.storage.from("recipe-images");

    it("download is refused", async () => {
      const { data, error } = await bucket().download(bobImage);
      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    it("listing the book's folder shows nothing", async () => {
      const { data } = await bucket().list(`${bob.bookId}/${bob.recipeId}`);
      expect(data ?? []).toEqual([]);
    });

    it("a signed URL can't be created", async () => {
      const { data } = await bucket().createSignedUrl(bobImage, 60);
      expect(data).toBeNull();
    });

    it("upload into the book is refused", async () => {
      const { error } = await bucket().upload(`${bob.bookId}/${bob.recipeId}/evil.png`, png());
      expect(error).not.toBeNull();
    });

    it("overwriting an existing object is refused", async () => {
      const { error } = await bucket().update(bobImage, png());
      expect(error).not.toBeNull();
    });

    it("delete removes nothing", async () => {
      const { data } = await bucket().remove([bobImage]);
      expect(data ?? []).toEqual([]);
    });

    it("malformed paths are refused", async () => {
      for (const path of [
        "evil.png",
        "not-a-uuid/x/evil.png",
        `${alice.bookId}/${bob.recipeId}/evil.png`,
      ]) {
        const { error } = await bucket().upload(path, png());
        expect(error, path).not.toBeNull();
      }
    });
  });

  it("after all of the above, the victim's book is exactly as it was", async () => {
    expect(await snapshot(bob.bookId)).toEqual(bobBefore);
    const { data } = await admin().storage.from("recipe-images").download(bobImage);
    expect(data).not.toBeNull();
  });
});

describe("signed-out visitors", () => {
  it.each(specs.map((s) => s.table))("see nothing in %s", async (table) => {
    const { data } = await anon().from(table).select("*");
    expect(data ?? []).toEqual([]);
  });

  it("can't download images", async () => {
    const { data } = await anon().storage.from("recipe-images").download(bobImage);
    expect(data).toBeNull();
  });
});

describe("roles inside a shared book", () => {
  let owner: TestUser;
  let viewer: TestUser;
  let contributor: TestUser;
  let approved: { id: string; image: string };
  let pending: { id: string; image: string };

  const join = (user: TestUser, role: "viewer" | "contributor") =>
    owner.client
      .from("book_members")
      .insert({ book_id: owner.bookId, user_id: user.id, role, invited_by: owner.id });

  beforeAll(async () => {
    owner = await createUser("owner");
    viewer = await createUser("viewer");
    contributor = await createUser("contributor");

    const a = await seedRecipe(owner, { title: "עוף בלימון" });
    const p = await seedRecipe(owner, { title: "טיוטה סודית", status: "pending" });
    approved = { id: a.recipe.id, image: a.imagePath };
    pending = { id: p.recipe.id, image: p.imagePath };

    expect((await join(viewer, "viewer")).error).toBeNull();
    expect((await join(contributor, "contributor")).error).toBeNull();
  });

  const recipeIds = async (client: Client, bookId: string) =>
    ((await client.from("recipes").select("id").eq("book_id", bookId)).data ?? []).map((r) => r.id);

  describe("viewer", () => {
    it("sees approved recipes but not pending ones", async () => {
      expect(await recipeIds(viewer.client, owner.bookId)).toEqual([approved.id]);
    });

    it("doesn't see a pending recipe's ingredients, steps or images", async () => {
      for (const table of ["ingredients", "steps", "recipe_images"] as const) {
        const { data } = await loose(viewer.client)
          .from(table)
          .select("recipe_id")
          .eq("book_id", owner.bookId);
        expect(
          data!.map((r) => r.recipe_id),
          table,
        ).toEqual([approved.id]);
      }
      expect(
        (await viewer.client.storage.from("recipe-images").download(pending.image)).data,
      ).toBeNull();
      expect(
        (await viewer.client.storage.from("recipe-images").download(approved.image)).data,
      ).not.toBeNull();
    });

    it("can't add, change or delete anything", async () => {
      const ins = await viewer.client
        .from("recipes")
        .insert({ book_id: owner.bookId, title: "x", status: "pending" });
      expect(ins.error).not.toBeNull();
      const upd = await viewer.client
        .from("recipes")
        .update({ title: "נפרץ" })
        .eq("id", approved.id)
        .select();
      expect(refused(upd)).toBe(true);
      const del = await viewer.client
        .from("categories")
        .delete()
        .eq("book_id", owner.bookId)
        .select();
      expect(refused(del)).toBe(true);
    });

    it("can't change or delete rows they can see (ingredients, steps, images, categories, preferences)", async () => {
      const visible = [
        ["ingredients", { display_text: "נפרץ" }],
        ["steps", { text: "נפרץ" }],
        ["recipe_images", { position: 99 }],
        ["categories", { name: "נפרץ" }],
        ["preferences", { excluded_ingredients: ["נפרץ"] }],
        ["books", { name: "נפרץ" }],
      ] as const;
      await owner.client
        .from("preferences")
        .insert({ book_id: owner.bookId, scope: "global", excluded_ingredients: ["הל"] });
      for (const [table, change] of visible) {
        const col = table === "books" ? "id" : "book_id";
        const seen = await loose(viewer.client).from(table).select("id").eq(col, owner.bookId);
        expect(seen.data!.length, `${table} visible`).toBeGreaterThan(0);
        // Target one row, so a constraint error can't masquerade as a refusal.
        const id = seen.data![0].id;
        const upd = await loose(viewer.client)
          .from(table)
          .update(change as never)
          .eq("id", id)
          .select();
        expect(refusedByRls(upd), `${table} update`).toBe(true);
        const del = await loose(viewer.client).from(table).delete().eq("id", id).select();
        expect(refusedByRls(del), `${table} delete`).toBe(true);
      }
      const img = await viewer.client.storage.from("recipe-images").remove([approved.image]);
      expect(img.data ?? []).toEqual([]);
    });

    it("can't see the book's invites or other members", async () => {
      expect(
        (await viewer.client.from("invites").select("*").eq("book_id", owner.bookId)).data,
      ).toEqual([]);
      const members = (
        await viewer.client.from("book_members").select("user_id").eq("book_id", owner.bookId)
      ).data;
      expect(members!.map((m) => m.user_id)).toEqual([viewer.id]);
    });
  });

  describe("contributor", () => {
    let mine: string;

    it("can't insert an approved recipe", async () => {
      const res = await contributor.client
        .from("recipes")
        .insert({ book_id: owner.bookId, title: "x", status: "approved" });
      expect(res.error).not.toBeNull();
    });

    it("inserts own pending recipe and edits it", async () => {
      const { data, error } = await contributor.client
        .from("recipes")
        .insert({ book_id: owner.bookId, title: "הצעה שלי", status: "pending" })
        .select()
        .single();
      expect(error).toBeNull();
      mine = data!.id;
      const ing = await contributor.client
        .from("ingredients")
        .insert({ book_id: owner.bookId, recipe_id: mine, display_text: "בצל" });
      expect(ing.error).toBeNull();
      const upd = await contributor.client
        .from("recipes")
        .update({ title: "הצעה מתוקנת" })
        .eq("id", mine)
        .select();
      expect(upd.data).toHaveLength(1);
    });

    it("sees approved recipes and own submissions, not the owner's pending ones", async () => {
      expect((await recipeIds(contributor.client, owner.bookId)).sort()).toEqual(
        [approved.id, mine].sort(),
      );
    });

    it("can't approve own recipe", async () => {
      const res = await contributor.client
        .from("recipes")
        .update({ status: "approved" })
        .eq("id", mine)
        .select();
      expect(res.error).not.toBeNull();
    });

    it("can't edit the owner's recipes or their ingredients", async () => {
      const upd = await contributor.client
        .from("recipes")
        .update({ title: "נפרץ" })
        .eq("id", approved.id)
        .select();
      expect(refused(upd)).toBe(true);
      const ing = await contributor.client
        .from("ingredients")
        .insert({ book_id: owner.bookId, recipe_id: approved.id, display_text: "x" });
      expect(ing.error).not.toBeNull();
    });

    it("can't edit own recipe once the owner approved it", async () => {
      expect(
        (await owner.client.from("recipes").update({ status: "approved" }).eq("id", mine)).error,
      ).toBeNull();
      const upd = await contributor.client
        .from("recipes")
        .update({ title: "שוב" })
        .eq("id", mine)
        .select();
      expect(refused(upd)).toBe(true);
    });
  });

  describe("revoked member", () => {
    it("sees nothing at all after the owner revokes access", async () => {
      const rev = await owner.client
        .from("book_members")
        .update({ revoked_at: new Date().toISOString() })
        .eq("book_id", owner.bookId)
        .eq("user_id", viewer.id)
        .select();
      expect(rev.data).toHaveLength(1);

      for (const s of specs) {
        const { data } = await loose(viewer.client)
          .from(s.table)
          .select("*")
          .eq(s.bookColumn, owner.bookId);
        expect(data, s.table).toEqual([]);
      }
      expect(
        (await viewer.client.storage.from("recipe-images").download(approved.image)).data,
      ).toBeNull();
    });
  });

  it("the owner can't be removed or demoted by anyone", async () => {
    const demote = await owner.client
      .from("book_members")
      .update({ role: "viewer" })
      .eq("book_id", owner.bookId)
      .eq("user_id", owner.id)
      .select();
    expect(refused(demote)).toBe(true);
    const second = await owner.client
      .from("book_members")
      .update({ role: "owner" })
      .eq("book_id", owner.bookId)
      .eq("user_id", contributor.id)
      .select();
    expect(refused(second)).toBe(true);
  });
});

describe("signup", () => {
  it("creates exactly one owned book with the 11 default categories", async () => {
    const user = await createUser("newcomer");
    const books = await user.client.from("books").select("id, name");
    expect(books.data).toHaveLength(1);
    expect(books.data![0].id).toBe(user.bookId);

    const membership = await user.client
      .from("book_members")
      .select("role")
      .eq("book_id", user.bookId);
    expect(membership.data).toEqual([{ role: "owner" }]);

    const { data: categories } = await user.client
      .from("categories")
      .select("name, position")
      .eq("book_id", user.bookId)
      .order("position");
    expect(categories).toHaveLength(11);
    expect(categories![0].name).toBe("מרקים");
    expect(new Set(categories!.map((c) => c.name)).size).toBe(11);

    const profile = await user.client.from("profiles").select("email").eq("id", user.id).single();
    expect(profile.data!.email).toBe(user.email);
  });
});

describe("search_text", () => {
  it("normalizes the title and ingredient names and follows ingredient edits", async () => {
    const user = await createUser("searcher");
    const { recipe } = await seedRecipe(user, { title: "מרק כתום" });
    const read = async () =>
      (await admin().from("recipes").select("search_text").eq("id", recipe.id).single()).data!
        .search_text;
    expect(await read()).toBe("מרק כתומ גזר");

    await user.client.from("ingredients").insert({
      book_id: user.bookId,
      recipe_id: recipe.id,
      display_text: "בצל",
      canonical_name: "בָּצָל",
      position: 2,
    });
    expect(await read()).toBe("מרק כתומ גזר בצל");

    await user.client
      .from("ingredients")
      .delete()
      .eq("recipe_id", recipe.id)
      .eq("canonical_name", "גזר");
    expect(await read()).toBe("מרק כתומ בצל");
  });
});
