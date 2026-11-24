import { LibraryView } from "@/components/library/LibraryView";
import { he } from "@/i18n/he";
import { getLibrary } from "@/lib/data";
import { isDemo } from "@/lib/demo";

export default async function LibraryPage() {
  const library = await getLibrary();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl leading-tight font-bold">{library.bookName ?? he.app.name}</h1>
          {library.recipes.length > 0 && (
            <p className="text-sm text-muted">{he.library.count(library.recipes.length)}</p>
          )}
        </div>
        {!isDemo && (
          <form action="/auth/signout" method="post">
            <button className="press h-11 px-2 text-sm font-medium text-muted">
              {he.auth.signOut}
            </button>
          </form>
        )}
      </header>
      {isDemo && (
        <p className="rounded-2xl bg-accent/10 px-4 py-3 text-sm text-ink">
          {he.library.demoNotice}
        </p>
      )}
      <LibraryView library={library} />
    </div>
  );
}
