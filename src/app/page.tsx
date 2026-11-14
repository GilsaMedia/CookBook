import { he } from "@/i18n/he";

export default function LibraryPage() {
  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold">{he.nav.library}</h1>
      <form action="/auth/signout" method="post">
        <button className="h-11 px-2 text-sm font-medium text-muted">{he.auth.signOut}</button>
      </form>
    </div>
  );
}
