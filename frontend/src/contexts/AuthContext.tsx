import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { onIdTokenChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import {
  clearSessionToken,
  exchangeFirebaseToken,
  getCurrentUser,
  getStoredSessionToken,
  getAuthErrorMessage,
  storeSessionToken,
  shouldRetryFirebaseTokenExchange,
  shouldResetFirebaseSession,
  type AuthUser,
  type TokenExchangeResponse,
} from '@/lib/auth';
import { firebaseAuth, isFirebaseConfigured } from '@/lib/firebase';
import { canAccessDashboard } from '@/lib/store-roles';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  sessionError: string | null;
  login: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_EXCHANGE_RETRY_DELAYS_MS = [800, 2500, 6000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function exchangeFirebaseSessionWithRetry(firebaseUser: FirebaseUser): Promise<TokenExchangeResponse> {
  let idToken = await firebaseUser.getIdToken();

  try {
    return await exchangeFirebaseToken(idToken);
  } catch (error) {
    if (!shouldRetryFirebaseTokenExchange(error)) {
      throw error;
    }
  }

  let lastError: unknown = null;
  for (const retryDelay of TOKEN_EXCHANGE_RETRY_DELAYS_MS) {
    await delay(retryDelay);
    try {
      idToken = await firebaseUser.getIdToken(true);
      return await exchangeFirebaseToken(idToken);
    } catch (error) {
      lastError = error;
      if (!shouldRetryFirebaseTokenExchange(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to exchange Firebase token');
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncLegacySession() {
      const token = getStoredSessionToken();

      if (!token) {
        if (!cancelled) {
          setUser(null);
          setSessionError(null);
          setLoading(false);
        }
        return;
      }

      try {
        const currentUser = await getCurrentUser(token);
        if (cancelled) {
          return;
        }

        if (currentUser) {
          setUser(currentUser);
          setSessionError(null);
        } else {
          clearSessionToken();
          setUser(null);
          setSessionError(null);
        }
      } catch {
        if (!cancelled) {
          clearSessionToken();
          setUser(null);
          setSessionError(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (!isFirebaseConfigured() || !firebaseAuth) {
      void syncLegacySession();
      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = onIdTokenChanged(firebaseAuth, async (firebaseUser) => {
      if (cancelled) {
        return;
      }

      if (!firebaseUser) {
        clearSessionToken();
        setUser(null);
        setSessionError(null);
        setLoading(false);
        return;
      }

      try {
        const session: TokenExchangeResponse = await exchangeFirebaseSessionWithRetry(firebaseUser);

        if (cancelled) {
          return;
        }

        storeSessionToken(session.token);
        setUser(session.user);
        setSessionError(null);
      } catch (error) {
        if (shouldResetFirebaseSession(error) && firebaseAuth?.currentUser) {
          await signOut(firebaseAuth).catch(() => {});
        }

        clearSessionToken();
        setUser(null);
        setSessionError(
          getAuthErrorMessage(error, 'Failed to sync backend session.')
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin: canAccessDashboard(user?.role),
      sessionError,
      login: () => {
        window.location.assign('/login');
      },
      logout: async () => {
        clearSessionToken();
        setUser(null);

        if (firebaseAuth) {
          await signOut(firebaseAuth).catch(() => {});
        }

        window.location.assign('/');
      },
    }),
    [loading, sessionError, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
