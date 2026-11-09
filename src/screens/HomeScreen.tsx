import { TopBar } from '../components/TopBar';
import { signOut } from '../auth/signIn';

/** Placeholder signed-in screen. The recipe list arrives in Phase 6. */
export function HomeScreen() {
  return (
    <div className="screen">
      <TopBar
        title="Recipes"
        trailing={
          <button type="button" className="btn btn--plain pressable" onClick={() => signOut()}>
            Sign out
          </button>
        }
      />
      <main className="screen__content">
        <div className="empty">
          <h2 className="large-title">No recipes yet</h2>
          <p className="secondary">Your recipes will appear here.</p>
        </div>
      </main>
    </div>
  );
}
