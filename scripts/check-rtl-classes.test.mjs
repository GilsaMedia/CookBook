import { describe, expect, it } from "vitest";
import { findPhysicalClasses, scan } from "./check-rtl-classes.mjs";

const tokens = (text) => findPhysicalClasses(text).map((h) => h.token);

describe("findPhysicalClasses", () => {
  it.each([
    ['<div className="ml-2" />', "ml-2"],
    ['<div className="p-4 mr-auto" />', "mr-auto"],
    ['<div className="md:pl-6" />', "pl-6"],
    ['<div className="hover:-mr-1" />', "-mr-1"],
    ['<div className="pr-[3px]" />', "pr-[3px]"],
    ['<div className="absolute left-0" />', "left-0"],
    ['<div className="-right-2" />', "-right-2"],
    ['<p className="text-right" />', "text-right"],
    ['<div className="rounded-tl-lg" />', "rounded-tl-lg"],
    ['<div className="border-l" />', "border-l"],
    ['<div className="border-r-2" />', "border-r-2"],
    ['<img className="float-left" />', "float-left"],
    ["<div className={`scroll-ml-4`} />", "scroll-ml-4"],
    ["cn('ml-2', active && 'pr-1')", "ml-2"],
    [".card { @apply ml-2; }", "ml-2"],
    ['<div className="ml-2!" />', "ml-2!"],
  ])("flags %s", (source, expected) => {
    expect(tokens(source)).toContain(expected);
  });

  it.each([
    '<div className="ms-2 me-auto ps-4 pe-[3px]" />',
    '<div className="start-0 -end-2 text-start rounded-ss-lg border-s float-start" />',
    '<div className="rounded-lg border-red-500 place-items-center px-4 mx-auto inset-x-0" />',
    '<div className="text-lg leading-tight" />',
    ".x { padding-left: 1rem; margin-right: 0; }",
    "const label = 'ספרייה';",
  ])("allows %s", (source) => {
    expect(tokens(source)).toEqual([]);
  });

  it("reports line and column", () => {
    expect(findPhysicalClasses('a\n<div className="p-2 ml-2" />')).toEqual([
      { line: 2, column: 21, token: "ml-2" },
    ]);
  });
});

describe("repository source", () => {
  it("contains no physical left/right utilities", () => {
    expect(scan()).toEqual([]);
  });
});
