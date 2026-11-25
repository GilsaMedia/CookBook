import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, type TestUser } from "./helpers";

// Meals (migration 20261126090000_meals.sql): one tray per book, kept on
// the server; members read, owners and contributors plan, viewers only look.

let owner: TestUser;
let contributor: TestUser;
let viewer: TestUser;
let stranger: TestUser;
let soup: string;
let salad: string;
let theirs: string;

beforeAll(async () => {
  [owner, contributor, viewer, stranger] = await Promise.all([
    createUser("meal-owner"),
    createUser("meal-contrib"),
    createUser("meal-viewer"),
    createUser("meal-stranger"),
  ]);
  await admin()
    .from("book_members")
    .insert([
      { book_id: owner.bookId, user_id: contributor.id, role: "contributor" },
      { book_id: owner.bookId, user_id: viewer.id, role: "viewer" },
    ]);
  const { data } = await admin()
    .from("recipes")
    .insert([
      {
        book_id: owner.bookId,
        title: "מרק",
        status: "approved",
        servings: 6,
        category_id: null,
        tags: [],
      },
      {
        book_id: owner.bookId,
        title: "סלט",
        status: "approved",
        servings: null,
        category_id: null,
        tags: [],
      },
      {
        book_id: stranger.bookId,
        title: "שלו",
        status: "approved",
        servings: 2,
        category_id: null,
        tags: [],
      },
    ])
    .select("id, title");
  soup = data!.find((r) => r.title === "מרק")!.id;
  salad = data!.find((r) => r.title === "סלט")!.id;
  theirs = data!.find((r) => r.title === "שלו")!.id;
});

afterAll(cleanupUsers);

describe("the tray", () => {
  it("is started by the first dish, keeps each dish once, in order, with its servings", async () => {
    const { data: tray, error } = await owner.client.rpc("add_to_tray", { p_recipe: soup });
    expect(error).toBeNull();
    // A contributor adds to the same tray.
    expect((await contributor.client.rpc("add_to_tray", { p_recipe: salad })).data).toBe(tray);
    expect((await owner.client.rpc("add_to_tray", { p_recipe: soup })).data).toBe(tray);
    const { data: items } = await owner.client
      .from("meal_items")
      .select("recipe_id, servings, position")
      .eq("meal_id", tray!)
      .order("position");
    expect(items).toEqual([
      { recipe_id: soup, servings: 6, position: 0 },
      { recipe_id: salad, servings: null, position: 1 },
    ]);
  });

  it("is one per book", async () => {
    const { error } = await owner.client.from("meals").insert({ book_id: owner.bookId });
    expect(error).not.toBeNull();
  });

  it("is seen by the book's members, planned only by owners and contributors", async () => {
    const { data: tray } = await owner.client
      .from("meals")
      .select("id")
      .eq("book_id", owner.bookId)
      .eq("status", "draft")
      .single();
    expect(
      (await viewer.client.from("meal_items").select("id").eq("meal_id", tray!.id)).data,
    ).toHaveLength(2);
    expect((await stranger.client.from("meals").select("id").eq("id", tray!.id)).data).toEqual([]);
    expect((await viewer.client.rpc("add_to_tray", { p_recipe: soup })).error).not.toBeNull();
    await viewer.client.from("meals").update({ title: "לא" }).eq("id", tray!.id);
    expect(
      (await admin().from("meals").select("title").eq("id", tray!.id).single()).data!.title,
    ).toBe("");
    // Nobody else's recipes, and not into someone else's book.
    expect((await owner.client.rpc("add_to_tray", { p_recipe: theirs })).error?.message).toContain(
      "not_found",
    );
    const cross = await owner.client
      .from("meal_items")
      .insert({ meal_id: tray!.id, book_id: owner.bookId, recipe_id: theirs, position: 9 });
    expect(cross.error).not.toBeNull();
  });

  it("becomes a saved meal; the next dish starts a new tray", async () => {
    const { data: tray } = await owner.client.rpc("add_to_tray", { p_recipe: soup });
    const { error } = await owner.client
      .from("meals")
      .update({ title: "ארוחת שישי", date: "2026-11-27", status: "done" })
      .eq("id", tray!);
    expect(error).toBeNull();
    const { data: next } = await owner.client.rpc("add_to_tray", { p_recipe: salad });
    expect(next).not.toBe(tray);
    const { data: meals } = await owner.client
      .from("meals")
      .select("status")
      .eq("book_id", owner.bookId)
      .order("created_at");
    expect(meals!.map((m) => m.status)).toEqual(["done", "draft"]);
  });
});
