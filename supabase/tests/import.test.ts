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

describe("finishing every recipe", () => {
  let jobId: string;
  let ids: string[];

  it("keeps at most p_limit items processing across overlapping runs", async () => {
    // Earlier tests leave other jobs' items claimed; they'd hold the slots.
    await admin().from("import_items").update({ status: "failed" }).eq("status", "processing");
    const { data: job } = await newJob(stranger);
    jobId = job!.id;
    await stranger.client
      .from("import_items")
      .insert([0, 1, 2].map((p) => item(jobId, stranger.bookId, p)));
    await stranger.client.from("import_jobs").update({ status: "queued" }).eq("id", jobId);

    const first = await admin().rpc("claim_import_items", { p_limit: 2 });
    expect(first.data).toHaveLength(2);
    // A second run while those two are still processing gets nothing.
    const second = await admin().rpc("claim_import_items", { p_limit: 2 });
    expect(second.data).toHaveLength(0);
    ids = first.data!.map((i) => i.id);
  });

  it("puts a 'busy' item back without using an attempt, and not at once", async () => {
    await admin().rpc("finish_import_item", {
      p_id: ids[0],
      p_status: "queued",
      p_result: null,
      p_error: "busy",
    });
    const { data: row } = await admin()
      .from("import_items")
      .select("status, attempts, retry_at")
      .eq("id", ids[0])
      .single();
    expect(row!.status).toBe("queued");
    expect(row!.attempts).toBe(0);
    expect(new Date(row!.retry_at!).getTime()).toBeGreaterThan(Date.now());

    // One slot is free, but the busy item waits: the third item is next.
    const { data: next } = await admin().rpc("claim_import_items", { p_limit: 2 });
    expect(next!.map((i) => i.position)).toEqual([2]);
    ids.push(next![0].id);
  });

  it("lets only the owner send failed items through again", async () => {
    await admin().rpc("finish_import_item", {
      p_id: ids[1],
      p_status: "done",
      p_result: { title: "א" },
      p_error: "",
    });
    await admin().rpc("finish_import_item", {
      p_id: ids[2],
      p_status: "failed",
      p_result: null,
      p_error: "ai_failed",
    });
    // The busy item is still waiting, so the job isn't ready yet; finish it too.
    await admin().from("import_items").update({ retry_at: null }).eq("id", ids[0]);
    const { data: again } = await admin().rpc("claim_import_items", { p_limit: 2 });
    await admin().rpc("finish_import_item", {
      p_id: again![0].id,
      p_status: "failed",
      p_result: null,
      p_error: "not_recipe",
    });
    let { data: job } = await admin()
      .from("import_jobs")
      .select("status, done, failed")
      .eq("id", jobId)
      .single();
    expect(job).toEqual({ status: "ready", done: 1, failed: 2 });

    // The owner saves what was read; marking it saved is allowed, "done" isn't.
    expect(
      (await stranger.client.from("import_items").update({ status: "done" }).eq("id", ids[2]))
        .error,
    ).not.toBeNull();
    await stranger.client.from("import_items").update({ status: "saved" }).eq("id", ids[1]);
    await stranger.client.from("import_jobs").update({ status: "imported" }).eq("id", jobId);

    expect((await owner.client.rpc("retry_import", { p_job: jobId })).error?.message).toContain(
      "not_found",
    );
    // A job can't be pushed back to queued by hand.
    await stranger.client.from("import_jobs").update({ status: "queued" }).eq("id", jobId);
    ({ data: job } = await admin()
      .from("import_jobs")
      .select("status, done, failed")
      .eq("id", jobId)
      .single());
    expect(job!.status).toBe("imported");

    const { data: count, error } = await stranger.client.rpc("retry_import", { p_job: jobId });
    expect(error).toBeNull();
    expect(count).toBe(2);
    ({ data: job } = await admin()
      .from("import_jobs")
      .select("status, done, failed")
      .eq("id", jobId)
      .single());
    expect(job).toEqual({ status: "queued", done: 1, failed: 0 });
    const { data: items } = await admin()
      .from("import_items")
      .select("status, attempts")
      .eq("job_id", jobId)
      .order("position");
    expect(items).toEqual([
      { status: "queued", attempts: 0 },
      { status: "saved", attempts: 1 },
      { status: "queued", attempts: 0 },
    ]);
  });
});

describe("finding photos", () => {
  // A book of its own: the others used up today's imports.
  let cook: TestUser;
  beforeAll(async () => {
    cook = await createUser("imp-photos");
    await admin().from("ai_access").insert({ book_id: cook.bookId });
  });

  it("hands a recipe to its next step without using an attempt", async () => {
    const { data: job } = await newJob(cook);
    await cook.client.from("import_items").insert(item(job!.id, cook.bookId, 0));
    await cook.client.from("import_jobs").update({ status: "queued" }).eq("id", job!.id);
    await admin().from("import_items").update({ status: "failed" }).eq("status", "processing");
    const { data: claimed } = await admin().rpc("claim_import_items", { p_limit: 2 });
    const mine = claimed!.find((c) => c.job_id === job!.id)!;

    await admin().rpc("finish_import_item", {
      p_id: mine.id,
      p_status: "queued",
      p_result: { stage: "photo", recipe: { title: "א" } },
      p_error: "next",
    });
    const { data: row } = await admin()
      .from("import_items")
      .select("status, attempts, retry_at, result")
      .eq("id", mine.id)
      .single();
    expect(row).toMatchObject({
      status: "queued",
      attempts: 0,
      retry_at: null,
      result: { stage: "photo" },
    });
    // Ready at once for the next step.
    const { data: next } = await admin().rpc("claim_import_items", { p_limit: 2 });
    expect(next!.map((i) => i.id)).toContain(mine.id);
  });

  it("finishes a photos job as imported: there's nothing to review", async () => {
    const { data: job } = await cook.client
      .from("import_jobs")
      .insert({
        book_id: cook.bookId,
        format: "photos",
        file_name: "photos",
        created_by: cook.id,
      })
      .select("id")
      .single();
    const { error: addError } = await cook.client.from("import_items").insert({
      job_id: job!.id,
      book_id: cook.bookId,
      position: 0,
      entry: { recipeId: "x" },
      task: "find_photo",
      input: '{"recipe_id":"x"}',
    });
    expect(addError).toBeNull();
    await cook.client.from("import_jobs").update({ status: "queued" }).eq("id", job!.id);
    await admin().from("import_items").update({ status: "failed" }).eq("status", "processing");
    const { data: claimed } = await admin().rpc("claim_import_items", { p_limit: 2 });
    const mine = claimed!.find((c) => c.job_id === job!.id)!;
    await admin().rpc("finish_import_item", {
      p_id: mine.id,
      p_status: "done",
      p_result: null,
      p_error: "",
    });
    const { data: state } = await admin()
      .from("import_jobs")
      .select("status, done")
      .eq("id", job!.id)
      .single();
    expect(state).toEqual({ status: "imported", done: 1 });
  });

  it("only takes web links as a photo's credit", async () => {
    const { data: recipe } = await cook.client
      .from("recipes")
      .insert({ book_id: cook.bookId, title: "עם תמונה", status: "approved" })
      .select("id")
      .single();
    const row = (credit_url: string) => ({
      recipe_id: recipe!.id,
      book_id: cook.bookId,
      storage_path: `${cook.bookId}/${recipe!.id}/x.jpg`,
      credit_name: "אתר",
      credit_url,
    });
    expect(
      (await cook.client.from("recipe_images").insert(row("javascript:alert(1)"))).error,
    ).not.toBeNull();
    expect(
      (await cook.client.from("recipe_images").insert(row("https://example.com/r"))).error,
    ).toBeNull();
  });
});
