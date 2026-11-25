"use client";

import { useEffect, useState } from "react";
import { ImportForm } from "@/components/import/ImportForm";
import { ReviewForm } from "@/components/import/ReviewForm";
import { he } from "@/i18n/he";
import type { ImportResponse } from "@/lib/ai/schema";
import { getLibrary } from "@/lib/data";
import { getCurrentBook, type CurrentBook } from "@/lib/data/book";
import { isDemo } from "@/lib/demo";
import type { RecipeCard } from "@/lib/recipes/types";

type Loaded = { book: CurrentBook | null; library: RecipeCard[] };

/** Add a recipe (screen 7): link or text → AI → review → save. */
export function AddScreen() {
  const [loaded, setLoaded] = useState<Loaded | "error" | null>(null);
  const [imported, setImported] = useState<ImportResponse | null>(null);

  useEffect(() => {
    if (isDemo) return;
    let live = true;
    Promise.all([getCurrentBook(), getLibrary()]).then(
      ([book, library]) => live && setLoaded({ book, library: library.recipes }),
      () => live && setLoaded("error"),
    );
    return () => {
      live = false;
    };
  }, []);

  if (isDemo) return <Notice title={he.importer.title} text={he.importer.demo} />;
  if (loaded === null) return <p className="py-16 text-center text-muted">{he.common.loading}</p>;
  if (loaded === "error") return <Notice title={he.importer.title} text={he.common.loadFailed} />;
  if (!loaded.book) return <Notice title={he.importer.title} text={he.importer.noBook} />;

  if (imported) {
    return (
      <ReviewForm
        book={loaded.book}
        imported={imported}
        library={loaded.library}
        onStartOver={() => setImported(null)}
      />
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">{he.importer.title}</h1>
      <ImportForm bookId={loaded.book.id} onImported={setImported} />
    </div>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-muted">{text}</p>
    </div>
  );
}
