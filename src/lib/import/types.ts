/** One entry found in an uploaded collection, before the AI structures it. */
export type ImportEntry = {
  /** Stable within the file, e.g. "doc-12" or the Keep note's file name. */
  key: string;
  title: string;
  /** The Doc's category heading, or the Keep note's first label. */
  group: string | null;
  /** Keep labels (become tags). */
  labels: string[];
  /** recipe: has text to structure; link: only a link (import from it); empty: nothing. */
  kind: "recipe" | "link" | "empty";
  /** What the AI gets for a recipe entry. */
  text: string;
  sourceUrl: string | null;
  sourceName: string | null;
  createdAt: string | null;
  /** Image files inside the uploaded ZIP (Keep attachments). */
  images: string[];
};

export type ParsedCollection = {
  format: "docx" | "keep";
  entries: ImportEntry[];
};
