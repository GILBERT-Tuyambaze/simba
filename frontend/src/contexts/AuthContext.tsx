import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import {
  clearSessionToken,
  exchangeFirebaseToken,
  getCurrentUser,
  getStoredSessionToken,
  storeSessionToken,
  type AuthUser,
} from '@/lib/auth';
import { firebaseAuth, isFirebaseConfigured } from '@/lib/firebase';
import { canAccessDashboard } from '@/lib/store-roles';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function syncLegacySession() {
      const token = getStoredSessionToken();

      if (!token) {
        if (!cancelled) {
          setUser(null);
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
        } else {
          clearSessionToken();
          setUser(null);
        }
      } catch {
        if (!cancelled) {
          clearSessionToken();
          setUser(null);
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
        setLoading(false);
        return;
      }

      try {
        const idToken = await firebaseUser.getIdToken();
        const session = await exchangeFirebaseToken(idToken);
        if (cancelled) {
          return;
        }

        storeSessionToken(session.token);
        setUser(session.user);
      } catch (error) {
        console.warn('Firebase session sync unavailable; continuing without backend session.', error);
        clearSessionToken();
        setUser(null);
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
    [loading, user]
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
