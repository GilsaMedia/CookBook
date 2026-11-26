import { describe, expect, it } from "vitest";
import { defaultTitle, fullDate, mealLabel, nextFriday, shortDate, weekday } from "./format";

describe("meal dates", () => {
  it("names the day and writes the date the Israeli way", () => {
    expect(weekday("2026-11-27")).toBe("שישי");
    expect(defaultTitle("2026-11-28")).toBe("יום שבת");
    expect(shortDate("2026-11-14")).toBe("14.11");
    expect(mealLabel("ארוחת שישי", "2026-11-20")).toBe("ארוחת שישי 20/11/2026");
    expect(mealLabel("", "2026-11-27")).toBe("יום שישי 27/11/2026");
    expect(mealLabel("יום הולדת", null)).toBe("יום הולדת");
    expect(fullDate("2026-11-27")).toBe("27.11.2026");
  });

  it("defaults to the coming Friday", () => {
    expect(nextFriday(new Date(2026, 10, 26))).toBe("2026-11-27"); // Thursday
    expect(nextFriday(new Date(2026, 10, 27))).toBe("2026-11-27"); // Friday itself
    expect(nextFriday(new Date(2026, 10, 28))).toBe("2026-12-04"); // Saturday
  });
});
