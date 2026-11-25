/** One entry found in an uploaded cookbook document, before the AI structures it. */
export type ImportEntry = {
  /** Stable within the document, e.g. "doc-12". */
  key: string;
  title: string;
  /** The document's category (heading or section) for this recipe. */
  group: string | null;
  /** recipe: has text to structure; link: only a link (import from it); empty: nothing. */
  kind: "recipe" | "link" | "empty";
  /** What the AI gets for a recipe entry. */
  text: string;
  sourceUrl: string | null;
  sourceName: string | null;
};

export type ParsedCollection = {
  format: "docx";
  entries: ImportEntry[];
};
