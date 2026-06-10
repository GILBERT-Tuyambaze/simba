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
  type AuthUser,
} from '@/lib/auth';
import {
  ensureUserProfile,
  getProfile,
  getSupabaseUser,
  isSupabaseConfigured,
  supabase,
} from '@/lib/supabase';
import { canAccessDashboard, normalizeStoreRole } from '@/lib/store-roles';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  sessionSyncing: boolean;
  isAdmin: boolean;
  sessionError: string | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveAuthUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { user, error } = await getSupabaseUser();
  if (error || !user) {
    return null;
  }

  const profile = await ensureUserProfile(user).catch(async () => {
    return getProfile(user.id);
  });

  const roleSource = profile?.role ??
    (typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : null) ??
    (typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : null);

  return {
    id: user.id,
    email: user.email || profile?.email || '',
    name:
      profile?.display_name ||
      user.user_metadata?.display_name ||
      user.user_metadata?.name ||
      null,
    role: normalizeStoreRole(roleSource),
    default_branch: profile?.default_branch || null,
    last_login: user.last_sign_in_at || null,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionSyncing, setSessionSyncing] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const refreshUser = async () => {
    if (!isSupabaseConfigured()) {
      clearSessionToken();
      setUser(null);
      setSessionError('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      setLoading(false);
      return;
    }

    setSessionSyncing(true);
    try {
      const nextUser = await resolveAuthUser();
      setUser(nextUser);
      setSessionError(null);
    } catch (error) {
      setUser(null);
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
      user,
      loading,
      sessionSyncing,
      isAdmin: canAccessDashboard(user?.role),
      sessionError,
      refreshUser,
      login: () => {
        window.location.assign('/login');
      },
      logout: async () => {
        clearSessionToken();
        await supabase.auth.signOut().catch(() => {});
        setUser(null);
      },
    }),
    [loading, sessionError, sessionSyncing, user]
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
