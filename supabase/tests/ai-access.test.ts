import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, type TestUser } from "./helpers";

// The AI runs on the owner's subscription, so only books the server owner
// turns on may use it, within daily limits (CLAUDE.md "AI").

let owner: TestUser;
let stranger: TestUser;
let viewer: TestUser;
let contributor: TestUser;

const quota = async (book: string, user: string) => {
  const { data, error } = await admin().rpc("ai_take_quota", { p_book: book, p_user: user });
  expect(error).toBeNull();
  return data;
};

beforeAll(async () => {
  [owner, stranger, viewer, contributor] = await Promise.all([
    createUser("ai-owner"),
    createUser("ai-stranger"),
    createUser("ai-viewer"),
    createUser("ai-contrib"),
  ]);
  const { error } = await admin()
    .from("book_members")
    .insert([
      { book_id: owner.bookId, user_id: viewer.id, role: "viewer" },
      { book_id: owner.bookId, user_id: contributor.id, role: "contributor" },
    ]);
  expect(error).toBeNull();
});

afterAll(cleanupUsers);

describe("AI access tables", () => {
  it.each(["ai_access", "ai_usage"] as const)(
    "%s is invisible and read-only to app users, even for their own book",
    async (table) => {
      const { data } = await owner.client.from(table).select("*");
      expect(data ?? []).toEqual([]);
      const row =
        table === "ai_access"
          ? { book_id: owner.bookId }
          : { book_id: owner.bookId, user_id: owner.id, calls: 0 };
      const { error } = await owner.client.from(table).insert(row as never);
      expect(error).not.toBeNull();
    },
  );

  it("app users can't call ai_take_quota", async () => {
    const { error } = await owner.client.rpc("ai_take_quota", {
      p_book: owner.bookId,
      p_user: owner.id,
    });
    expect(error).not.toBeNull();
  });
});

describe("ai_take_quota", () => {
  it("refuses a book that hasn't been turned on", async () => {
    expect(await quota(owner.bookId, owner.id)).toBe("not_enabled");
  });

  it("allows the owner and contributors once the book is on, never viewers or strangers", async () => {
    const { error } = await admin()
      .from("ai_access")
      .insert({ book_id: owner.bookId, daily_user_limit: 2, daily_book_limit: 3 });
    expect(error).toBeNull();

    expect(await quota(owner.bookId, owner.id)).toBe("ok");
    expect(await quota(owner.bookId, contributor.id)).toBe("ok");
    expect(await quota(owner.bookId, viewer.id)).toBe("not_member");
    expect(await quota(owner.bookId, stranger.id)).toBe("not_member");
    // A stranger can't borrow the owner's book for their own requests either.
    expect(await quota(stranger.bookId, stranger.id)).toBe("not_enabled");
  });

  it("enforces the per-user and per-book daily limits", async () => {
    expect(await quota(owner.bookId, owner.id)).toBe("ok"); // owner: 2 of 2
    expect(await quota(owner.bookId, owner.id)).toBe("book_limit"); // book: 3 of 3
    await admin().from("ai_access").update({ daily_book_limit: 10 }).eq("book_id", owner.bookId);
    expect(await quota(owner.bookId, owner.id)).toBe("user_limit");

    const { data } = await admin()
      .from("ai_usage")
      .select("user_id, calls")
      .eq("book_id", owner.bookId);
    const calls = Object.fromEntries((data ?? []).map((r) => [r.user_id, r.calls]));
    expect(calls).toEqual({ [owner.id]: 2, [contributor.id]: 1 });
  });

  it("refuses a revoked member", async () => {
    await admin()
      .from("book_members")
      .update({ revoked_at: new Date().toISOString() })
      .eq("book_id", owner.bookId)
      .eq("user_id", contributor.id);
    expect(await quota(owner.bookId, contributor.id)).toBe("not_member");
  });
});
