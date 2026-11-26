import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, type TestUser } from "./helpers";

// Shopping lists (migration 20261126150000_shopping.sql): one per meal,
// read by the book's members, kept by its owners and contributors.

let owner: TestUser;
let viewer: TestUser;
let stranger: TestUser;
let listId: string;
let itemId: string;

beforeAll(async () => {
  [owner, viewer, stranger] = await Promise.all([
    createUser("shop-owner"),
    createUser("shop-viewer"),
    createUser("shop-stranger"),
  ]);
  await admin()
    .from("book_members")
    .insert({ book_id: owner.bookId, user_id: viewer.id, role: "viewer" });
  const { data: meal } = await owner.client.rpc("open_meal", {
    p_book: owner.bookId,
    p_title: "שישי",
    p_date: "2026-12-04",
  });
  const { data: list, error } = await owner.client
    .from("shopping_lists")
    .insert({ meal_id: meal!, book_id: owner.bookId })
    .select("id")
    .single();
  expect(error).toBeNull();
  listId = list!.id;
  const { data: item } = await owner.client
    .from("shopping_items")
    .insert({
      list_id: listId,
      book_id: owner.bookId,
      key: "גזר|unit",
      name: "גזר",
      quantity: 5,
      buy: 5,
      unit: "unit",
      section: "produce",
      sources: ["מרק", "סלט"],
    })
    .select("id")
    .single();
  itemId = item!.id;
});

afterAll(cleanupUsers);

describe("shopping lists", () => {
  it("come with the book's pantry", async () => {
    const { data } = await owner.client
      .from("books")
      .select("pantry")
      .eq("id", owner.bookId)
      .single();
    expect(data!.pantry).toContain("מלח");
    expect(data!.pantry).toContain("מים");
  });

  it("are one per meal, with each ingredient once", async () => {
    const { data: meal } = await owner.client
      .from("shopping_lists")
      .select("meal_id")
      .eq("id", listId)
      .single();
    expect(
      (
        await owner.client
          .from("shopping_lists")
          .insert({ meal_id: meal!.meal_id, book_id: owner.bookId })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await owner.client
          .from("shopping_items")
          .insert({ list_id: listId, book_id: owner.bookId, key: "גזר|unit", name: "גזר" })
      ).error,
    ).not.toBeNull();
  });

  it("are read by members, kept by planners, hidden from everyone else", async () => {
    expect(
      (await viewer.client.from("shopping_items").select("name").eq("id", itemId)).data,
    ).toEqual([{ name: "גזר" }]);
    await viewer.client.from("shopping_items").update({ checked: true }).eq("id", itemId);
    expect(
      (await admin().from("shopping_items").select("checked").eq("id", itemId).single()).data!
        .checked,
    ).toBe(false);
    expect(
      (await stranger.client.from("shopping_items").select("id").eq("id", itemId)).data,
    ).toEqual([]);
    expect(
      (await stranger.client.from("shopping_lists").select("id").eq("id", listId)).data,
    ).toEqual([]);

    const { error } = await owner.client
      .from("shopping_items")
      .update({ checked: true, in_pantry: true })
      .eq("id", itemId);
    expect(error).toBeNull();
    expect(
      (await admin().from("shopping_items").select("checked, in_pantry").eq("id", itemId).single())
        .data,
    ).toEqual({
      checked: true,
      in_pantry: true,
    });
  });

  it("go with their meal", async () => {
    const { data: list } = await owner.client
      .from("shopping_lists")
      .select("meal_id")
      .eq("id", listId)
      .single();
    await owner.client.from("meals").delete().eq("id", list!.meal_id);
    expect((await admin().from("shopping_items").select("id").eq("id", itemId)).data).toEqual([]);
  });
});
