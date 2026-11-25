import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createUser, type TestUser } from "./helpers";

// Bulk import (PRD §7.3): owners only, AI-enabled books only, capped, and
// the AI's results are written by the worker (service role), never the app.

let owner: TestUser;
let stranger: TestUser;
let contributor: TestUser;
let noAi: TestUser;

const item = (jobId: string, bookId: string, position: number) => ({
  job_id: jobId,
  book_id: bookId,
  position,
  entry: { title: `מתכון ${position}`, kind: "recipe" },
  task: "structure_recipe",
  input: "Title: מתכון\n- 1 ביצה",
});

async function newJob(user: TestUser) {
  return user.client
    .from("import_jobs")
    .insert({ book_id: user.bookId, format: "docx", file_name: "book.docx", created_by: user.id })
    .select("id, status")
    .single();
}

beforeAll(async () => {
  [owner, stranger, contributor, noAi] = await Promise.all([
    createUser("imp-owner"),
    createUser("imp-stranger"),
    createUser("imp-contrib"),
    createUser("imp-noai"),
  ]);
  await admin()
    .from("ai_access")
    .insert([{ book_id: owner.bookId }, { book_id: stranger.bookId }]);
  await admin()
    .from("book_members")
    .insert({ book_id: owner.bookId, user_id: contributor.id, role: "contributor" });
});

afterAll(cleanupUsers);

describe("import jobs", () => {
  it("need a book with AI turned on", async () => {
    const { error } = await newJob(noAi);
    expect(error?.message).toContain("ai_not_enabled");
  });

  it("are for owners only", async () => {
    const { error } = await contributor.client.from("import_jobs").insert({
      book_id: owner.bookId,
      format: "docx",
      file_name: "x.docx",
      created_by: contributor.id,
    });
    expect(error).not.toBeNull();
  });

  it("take items only while a draft, then queue; the owner can't fake results", async () => {
    const { data: job, error } = await newJob(owner);
    expect(error).toBeNull();
    expect(job!.status).toBe("draft");

    const add = await owner.client
      .from("import_items")
      .insert([item(job!.id, owner.bookId, 0), item(job!.id, owner.bookId, 1)]);
    expect(add.error).toBeNull();
    const { data: counted } = await owner.client
      .from("import_jobs")
      .select("total")
      .eq("id", job!.id)
      .single();
    expect(counted!.total).toBe(2);

    // Results are the worker's.
    const fake = await owner.client
      .from("import_items")
      .update({ result: { title: "x" } } as never)
      .eq("job_id", job!.id);
    expect(fake.error).not.toBeNull();
    // Status may only go to skipped.
    const requeue = await owner.client
      .from("import_items")
      .update({ status: "done" })
      .eq("job_id", job!.id)
      .select();
    expect(requeue.data ?? []).toHaveLength(0);
    // The worker's statuses are off limits.
    const ready = await owner.client
      .from("import_jobs")
      .update({ status: "ready" })
      .eq("id", job!.id);
    expect(ready.error).not.toBeNull();

    const queue = await owner.client
      .from("import_jobs")
      .update({ status: "queued" })
      .eq("id", job!.id);
    expect(queue.error).toBeNull();
    const late = await owner.client.from("import_items").insert(item(job!.id, owner.bookId, 2));
    expect(late.error).not.toBeNull();
  });

  it("are invisible to other families, who can't add to them either", async () => {
    const { data: jobs } = await owner.client.from("import_jobs").select("id").limit(1);
    const jobId = jobs![0].id;
    const { data: seen } = await stranger.client.from("import_jobs").select("id").eq("id", jobId);
    expect(seen ?? []).toEqual([]);
    const { data: items } = await stranger.client
      .from("import_items")
      .select("id")
      .eq("job_id", jobId);
    expect(items ?? []).toEqual([]);
    const add = await stranger.client.from("import_items").insert(item(jobId, owner.bookId, 9));
    expect(add.error).not.toBeNull();
  });

  it("are limited to 3 a day per book", async () => {
    expect((await newJob(owner)).error).toBeNull(); // 2nd
    expect((await newJob(owner)).error).toBeNull(); // 3rd
    expect((await newJob(owner)).error?.message).toContain("import_limit");
  });
});

describe("the worker's queue", () => {
  it("is for the service role only", async () => {
    const { error } = await owner.client.rpc("claim_import_items", { p_limit: 5 });
    expect(error).not.toBeNull();
  });

  it("claims queued items and finishes the job when all are done", async () => {
    const { data: job } = await newJob(stranger);
    await stranger.client
      .from("import_items")
      .insert([item(job!.id, stranger.bookId, 0), item(job!.id, stranger.bookId, 1)]);
    await stranger.client.from("import_jobs").update({ status: "queued" }).eq("id", job!.id);

    const { data: claimed, error } = await admin().rpc("claim_import_items", { p_limit: 10 });
    expect(error).toBeNull();
    const mine = (claimed ?? []).filter((c) => c.job_id === job!.id);
    expect(mine).toHaveLength(2);

    await admin().rpc("finish_import_item", {
      p_id: mine[0].id,
      p_status: "done",
      p_result: { title: "א" },
      p_error: "",
    });
    let { data: state } = await admin()
      .from("import_jobs")
      .select("status, done, failed")
      .eq("id", job!.id)
      .single();
    expect(state).toEqual({ status: "running", done: 1, failed: 0 });

    await admin().rpc("finish_import_item", {
      p_id: mine[1].id,
      p_status: "failed",
      p_result: null,
      p_error: "ai_failed",
    });
    ({ data: state } = await admin()
      .from("import_jobs")
      .select("status, done, failed")
      .eq("id", job!.id)
      .single());
    expect(state).toEqual({ status: "ready", done: 1, failed: 1 });

    const { data: result } = await stranger.client
      .from("import_items")
      .select("result")
      .eq("id", mine[0].id)
      .single();
    expect(result!.result).toEqual({ title: "א" });
  });
});
