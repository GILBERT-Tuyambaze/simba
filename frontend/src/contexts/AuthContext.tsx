import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  clearSessionToken,
  getAuthErrorMessage,
} from '@/lib/auth';
import { GUEST_AUTH_STATE, resolveAuthState, type AuthState } from '@/lib/auth-state';
import { canAccess, type AccessPermission } from '@/lib/access-control';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type AuthContextValue = {
  authState: AuthState;
  user: AuthState['user'];
  accessRole: AuthState['accessRole'];
  permissions: AuthState['permissions'];
  loading: boolean;
  sessionSyncing: boolean;
  isAdmin: boolean;
  canAccess: (permission: AccessPermission) => boolean;
  sessionError: string | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authState, setAuthState] = useState<AuthState>(GUEST_AUTH_STATE);
  const [loading, setLoading] = useState(true);
  const [sessionSyncing, setSessionSyncing] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const refreshUser = async () => {
    setSessionSyncing(true);
    try {
      const nextState = await resolveAuthState();
      setAuthState(nextState);
      setSessionError(nextState.error ? getAuthErrorMessage(nextState.error, 'Failed to sync Supabase session.') : null);
    } catch (error) {
      setAuthState(GUEST_AUTH_STATE);
      setSessionError(getAuthErrorMessage(error, 'Failed to sync Supabase session.'));
    } finally {
      setSessionSyncing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      await refreshUser();
      if (cancelled) {
        return;
      }
      setLoading(false);
    }

    void initialLoad();

    if (!isSupabaseConfigured()) {
      return () => {
        cancelled = true;
      };
    }

    const { data } = supabase.auth.onAuthStateChange(() => {
      void refreshUser();
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authState,
      user: authState.user,
      accessRole: authState.accessRole,
      permissions: authState.permissions,
      loading,
      sessionSyncing,
      isAdmin: canAccess(authState, 'dashboard:view'),
      canAccess: (permission) => canAccess(authState, permission),
      sessionError,
      refreshUser,
      login: () => {
        window.location.assign('/login');
      },
      logout: async () => {
        clearSessionToken();
        await supabase.auth.signOut().catch(() => {});
        setAuthState(GUEST_AUTH_STATE);
      },
    }),
    [authState, loading, sessionError, sessionSyncing]
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
