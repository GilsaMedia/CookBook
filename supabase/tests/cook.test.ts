import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, type TestUser } from "./helpers";

// Cook sessions (migration 20261128120000_cook_sessions.sql): one per recipe
// per person, seen and changed only by that person, by any member of the
// book (viewers too), and gone with the recipe.

let owner: TestUser;
let viewer: TestUser;
let stranger: TestUser;
let recipe: string;
let carrot: string;
let onion: string;

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([
    createUser("cook-owner"),
    createUser("cook-viewer"),
    createUser("cook-stranger"),
  ]);
  await admin()
    .from("book_members")
    .insert({ book_id: owner.bookId, user_id: viewer.id, role: "viewer" });
  const { data: r } = await admin()
    .from("recipes")
    .insert({ book_id: owner.bookId, title: "מרק גזר", status: "approved", tags: [] })
    .select("id")
    .single();
  recipe = r!.id;
  const { data: ings } = await admin()
    .from("ingredients")
    .insert([
      { recipe_id: recipe, book_id: owner.bookId, display_text: "3 גזרים", position: 0 },
      { recipe_id: recipe, book_id: owner.bookId, display_text: "בצל", position: 1 },
    ])
    .select("id, position")
    .order("position");
  [carrot, onion] = ings!.map((i) => i.id);
});

afterAll(cleanupUsers);

const start = (user: TestUser) =>
  user.client
    .from("cook_sessions")
    .insert({ recipe_id: recipe, book_id: owner.bookId })
    .select()
    .single();

describe("cook sessions", () => {
  it("are one per recipe per person, for members of the book only", async () => {
    const mine = await start(owner);
    expect(mine.error).toBeNull();
    expect(mine.data).toMatchObject({ user_id: owner.id, current_step: 0, rev: 0 });
    expect((await start(owner)).error).not.toBeNull();

    // A viewer cooks too, in a session of their own.
    const theirs = await start(viewer);
    expect(theirs.error).toBeNull();
    expect(theirs.data!.user_id).toBe(viewer.id);

    // Someone outside the book can't start one, nor in someone else's name.
    expect((await start(stranger)).error).not.toBeNull();
    const forged = await viewer.client
      .from("cook_sessions")
      .insert({ recipe_id: recipe, book_id: owner.bookId, user_id: owner.id });
    expect(forged.error).not.toBeNull();
  });

  it("are seen and changed only by their cook", async () => {
    const { data: mine } = await owner.client
      .from("cook_sessions")
      .select("id")
      .eq("recipe_id", recipe)
      .single();
    // The viewer sees only their own; the stranger sees none.
    expect(
      (await viewer.client.from("cook_sessions").select("user_id").eq("recipe_id", recipe)).data,
    ).toEqual([{ user_id: viewer.id }]);
    expect((await stranger.client.from("cook_sessions").select("id")).data).toEqual([]);

    await viewer.client.from("cook_sessions").update({ current_step: 4 }).eq("id", mine!.id);
    expect(
      (
        await viewer.client.rpc("cook_check", {
          p_session: mine!.id,
          p_ingredient: carrot,
          p_checked: true,
        })
      ).data,
    ).toEqual([]);
    await viewer.client.from("cook_sessions").delete().eq("id", mine!.id);
    const { data: after } = await admin()
      .from("cook_sessions")
      .select("current_step, checked_ingredient_ids")
      .eq("id", mine!.id)
      .single();
    expect(after).toEqual({ current_step: 0, checked_ingredient_ids: [] });
  });

  it("keep both checks when two screens check at once, and count every change", async () => {
    const { data: s } = await owner.client
      .from("cook_sessions")
      .select("id, rev")
      .eq("recipe_id", recipe)
      .single();
    const check = (ingredient: string, checked: boolean) =>
      owner.client.rpc("cook_check", {
        p_session: s!.id,
        p_ingredient: ingredient,
        p_checked: checked,
      });
    await Promise.all([check(carrot, true), check(onion, true)]);
    // Checking twice doesn't add it twice.
    const { data: again } = await check(carrot, true);
    expect([...again![0].checked_ingredient_ids].sort()).toEqual([carrot, onion].sort());
    const { data: unchecked } = await check(onion, false);
    expect(unchecked![0].checked_ingredient_ids).toEqual([carrot]);

    const { data: step } = await owner.client
      .from("cook_sessions")
      .update({ current_step: 2 })
      .eq("id", s!.id)
      .select("current_step, rev")
      .single();
    expect(step).toEqual({ current_step: 2, rev: s!.rev + 5 });
  });

  it("end with the cook, and go with the recipe", async () => {
    const { data: theirs } = await viewer.client
      .from("cook_sessions")
      .delete()
      .eq("recipe_id", recipe)
      .select("id");
    expect(theirs).toHaveLength(1);

    await admin().from("recipes").delete().eq("id", recipe);
    expect((await admin().from("cook_sessions").select("id").eq("recipe_id", recipe)).data).toEqual(
      [],
    );
  });

  it("stop at once for a member who is taken out of the book", async () => {
    const { data: r } = await admin()
      .from("recipes")
      .insert({ book_id: owner.bookId, title: "שקשוקה", status: "approved", tags: [] })
      .select("id")
      .single();
    const { data: s } = await viewer.client
      .from("cook_sessions")
      .insert({ recipe_id: r!.id, book_id: owner.bookId })
      .select("id")
      .single();
    await owner.client
      .from("book_members")
      .update({ revoked_at: new Date().toISOString() })
      .eq("book_id", owner.bookId)
      .eq("user_id", viewer.id);
    expect((await viewer.client.from("cook_sessions").select("id").eq("id", s!.id)).data).toEqual(
      [],
    );
  });
});
