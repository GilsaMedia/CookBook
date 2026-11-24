import { describe, expect, it } from "vitest";
import { cardMeta, formatMinutes } from "./format";

describe("formatMinutes", () => {
  it("formats minutes and hours", () => {
    expect(formatMinutes(45)).toBe("45 דק׳");
    expect(formatMinutes(60)).toBe("1 ש׳");
    expect(formatMinutes(75)).toBe("1 ש׳ 15 דק׳");
  });
});

describe("cardMeta", () => {
  it("joins what is known", () => {
    expect(cardMeta("מרקים", 45)).toBe("מרקים · 45 דק׳");
    expect(cardMeta(null, 45)).toBe("45 דק׳");
    expect(cardMeta("מרקים", null)).toBe("מרקים");
  });
});
