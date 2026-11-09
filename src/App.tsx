import { useAuth } from './auth/AuthProvider';
import { HomeScreen } from './screens/HomeScreen';
import { SignInScreen } from './screens/SignInScreen';

export function App() {
  const { state, redirectError } = useAuth();

  if (state.status === 'loading') {
    // Blank, same colour as the app — avoids flashing the sign-in screen at people already signed in.
    return <div className="screen" aria-busy="true" />;
  }
  if (state.status === 'signedOut') {
    return <SignInScreen initialError={redirectError} />;
  }
  return <HomeScreen />;
}
