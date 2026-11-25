import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, type TestUser } from "./helpers";

// New accounts wait for an admin (migration 20261125210000_access_requests.sql):
// until approved they get nothing, and only admins decide.

let boss: TestUser; // an app admin
let member: TestUser; // approved, not an admin
let newcomer: TestUser; // waiting

beforeAll(async () => {
  [boss, member, newcomer] = await Promise.all([
    createUser("acc-boss"),
    createUser("acc-member"),
    createUser("acc-new", { approved: false }),
  ]);
  await admin().from("app_admins").insert({ user_id: boss.id });
  await admin().from("ai_access").insert({ book_id: newcomer.bookId });
});

afterAll(cleanupUsers);

describe("a new account", () => {
  it("waits, and gets nothing until it's approved", async () => {
    const { data: me } = await newcomer.client.rpc("my_access");
    expect(me).toEqual([{ status: "pending", is_admin: false }]);
    expect((await newcomer.client.from("books").select("id")).data).toEqual([]);
    expect((await newcomer.client.from("categories").select("id")).data).toEqual([]);
    const add = await newcomer.client
      .from("recipes")
      .insert({ book_id: newcomer.bookId, title: "לא עכשיו", status: "approved" });
    expect(add.error).not.toBeNull();
    // Not even the AI, though its book is turned on.
    const { data: quota } = await admin().rpc("ai_take_quota", {
      p_book: newcomer.bookId,
      p_user: newcomer.id,
    });
    expect(quota).toBe("not_member");
  });

  it("can write its name, but can't approve itself", async () => {
    await newcomer.client.from("profiles").update({ display_name: "דנה" }).eq("id", newcomer.id);
    const self = await newcomer.client
      .from("profiles")
      .update({ approved_at: new Date().toISOString() })
      .eq("id", newcomer.id);
    expect(self.error).not.toBeNull();
    expect(
      (await newcomer.client.rpc("decide_access", { p_user: newcomer.id, p_approve: true })).error,
    ).not.toBeNull();
    const { data } = await admin()
      .from("profiles")
      .select("display_name, approved_at")
      .eq("id", newcomer.id)
      .single();
    expect(data).toEqual({ display_name: "דנה", approved_at: null });
  });
});

describe("requests", () => {
  it("are for admins only", async () => {
    expect((await member.client.rpc("access_requests")).error?.message).toContain("not_admin");
    expect(
      (await member.client.rpc("decide_access", { p_user: newcomer.id, p_approve: true })).error,
    ).not.toBeNull();
    expect((await member.client.from("app_admins").select("user_id")).data ?? []).toEqual([]);
    expect(
      (await member.client.from("app_admins").insert({ user_id: member.id })).error,
    ).not.toBeNull();
    const { data: me } = await boss.client.rpc("my_access");
    expect(me).toEqual([{ status: "approved", is_admin: true }]);
  });

  it("show who's waiting; approving opens the app, turning down keeps it closed", async () => {
    const { data: list } = await boss.client.rpc("access_requests");
    expect(list!.find((r) => r.user_id === newcomer.id)).toMatchObject({
      email: newcomer.email,
      display_name: "דנה",
      status: "pending",
    });

    await boss.client.rpc("decide_access", { p_user: newcomer.id, p_approve: false });
    expect((await newcomer.client.rpc("my_access")).data).toEqual([
      { status: "rejected", is_admin: false },
    ]);
    expect((await newcomer.client.from("books").select("id")).data).toEqual([]);

    await boss.client.rpc("decide_access", { p_user: newcomer.id, p_approve: true });
    expect((await newcomer.client.rpc("my_access")).data).toEqual([
      { status: "approved", is_admin: false },
    ]);
    expect((await newcomer.client.from("books").select("id")).data).toEqual([
      { id: newcomer.bookId },
    ]);
    const { data: row } = await admin()
      .from("profiles")
      .select("approved_by")
      .eq("id", newcomer.id)
      .single();
    expect(row!.approved_by).toBe(boss.id);
  });
});
