import { describe, expect, it } from "vitest";
import { authorized, createAiServer, parseJob } from "./server.mjs";

const SECRET = "s".repeat(40);

describe("authorized", () => {
  it("accepts only the exact bearer secret", () => {
    expect(authorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(authorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(authorized(SECRET, SECRET)).toBe(false);
    expect(authorized(undefined, SECRET)).toBe(false);
  });

  it("refuses everything when the secret is missing or short", () => {
    expect(authorized("Bearer ", "")).toBe(false);
    expect(authorized("Bearer short", "short")).toBe(false);
  });
});

describe("parseJob", () => {
  it("accepts known tasks only", () => {
    expect(parseJob({ task: "structure_recipe", input: "מרק" }).error).toBeUndefined();
    expect(
      parseJob({ task: "structure_video", input: "https://vt.tiktok.com/x/" }).error,
    ).toBeUndefined();
    expect(parseJob({ task: "write_my_essay", input: "x" }).error).toBe("unknown_task");
    expect(parseJob({ task: "__proto__", input: "x" }).error).toBe("unknown_task");
    expect(parseJob({ task: "structure_recipe", input: "" }).error).toBe("bad_request");
    expect(parseJob({ task: "structure_recipe", input: "x".repeat(20_001) }).error).toBe(
      "too_long",
    );
  });
});

describe("server", () => {
  const start = () =>
    new Promise((resolve) => {
      const server = createAiServer({
        secret: SECRET,
        run: async (_t, input) => ({ result: { echoed: input.length } }),
      });
      server.listen(0, "127.0.0.1", () => resolve(server));
    });
  const call = (server, init) =>
    fetch(`http://127.0.0.1:${server.address().port}/v1/run`, { method: "POST", ...init });

  it("rejects a request without the secret, runs one with it", async () => {
    const server = await start();
    try {
      const body = JSON.stringify({ task: "structure_recipe", input: "abc" });
      expect((await call(server, { body })).status).toBe(401);
      const ok = await call(server, { body, headers: { authorization: `Bearer ${SECRET}` } });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ result: { echoed: 3 } });
    } finally {
      server.close();
    }
  });
});
