import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Sparkles,
  Terminal,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAuthErrorMessage } from '@/lib/auth';
import { firebaseAuth, googleProvider, isFirebaseConfigured } from '@/lib/firebase';
import { acceptInvitation, fetchInvitationPreview } from '@/lib/invitations';
import { useI18n } from '@/lib/i18n';
import type { Invitation } from '@/lib/types';

type LoginLocationState = {
  from?: string;
};

const DEFAULT_POST_AUTH_PATH = '/shop';
const SUPPORTED_POST_AUTH_PATHS = new Set([
  '/',
  '/shop',
  '/cart',
  '/account',
  '/checkout',
  '/admin',
]);
const SUPPORTED_POST_AUTH_PREFIXES = ['/product/', '/blog/', '/admin/'];

function normalizeReturnPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return DEFAULT_POST_AUTH_PATH;
  }

  if (trimmed === '/login') {
    return DEFAULT_POST_AUTH_PATH;
  }

  let parsedPath = trimmed;
  try {
    const url = new URL(trimmed, window.location.origin);
    parsedPath = `${url.pathname}${url.search}${url.hash}`;
    const route = url.pathname;
    const matchesKnownRoute =
      SUPPORTED_POST_AUTH_PATHS.has(route) ||
      SUPPORTED_POST_AUTH_PREFIXES.some((prefix) => route.startsWith(prefix));

    return matchesKnownRoute ? parsedPath : DEFAULT_POST_AUTH_PATH;
  } catch {
    return DEFAULT_POST_AUTH_PATH;
  }
}

function getReturnPathLabel(t: (key: string, fallback?: string) => string, path: string): string {
  if (path.startsWith('/account')) {
    return t('auth.dashboardReturn');
  }

  if (path.startsWith('/checkout')) {
    return t('auth.checkoutReturn');
  }

  if (path.startsWith('/admin')) {
    return t('auth.adminReturn');
  }

  if (path.startsWith('/shop')) {
    return t('auth.shopReturn');
  }

  if (path === '/') {
    return t('auth.homeReturn');
  }

  return path;
}

function getLocalizedAuthError(t: (key: string, fallback?: string) => string, error: unknown): string {
  const raw = getAuthErrorMessage(error);
  const lowered = raw.toLowerCase();

  if (
    lowered.includes('firebase service account') ||
    lowered.includes('firebase admin key') ||
    lowered.includes('firebase is not configured')
  ) {
    return t('auth.setFirebase');
  }

  return t('auth.authGeneric');
}

function getReturnPath(
  locationState: unknown,
  searchParams: URLSearchParams
): string {
  const fromState = (locationState as LoginLocationState | null)?.from;
  const queryTarget = searchParams.get('next') || searchParams.get('from');
  return normalizeReturnPath(queryTarget || fromState || DEFAULT_POST_AUTH_PATH);
}

export default function LoginPage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );
  const returnPath = useMemo(
    () => getReturnPath(location.state, searchParams),
    [location.state, searchParams]
  );
  const inviteToken = useMemo(() => searchParams.get('invite')?.trim() || '', [searchParams]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [invitePreview, setInvitePreview] = useState<Invitation | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [postAuthBusy, setPostAuthBusy] = useState(false);

  useEffect(() => {
    if (!inviteToken) {
      setInvitePreview(null);
      return;
    }

    let cancelled = false;
    setInviteLoading(true);
    fetchInvitationPreview(inviteToken)
      .then((preview) => {
        if (!cancelled) {
          setInvitePreview(preview);
        }
      })
      .catch((inviteError) => {
        if (!cancelled) {
          setInvitePreview(null);
          setError(inviteError instanceof Error ? inviteError.message : t('auth.authGeneric'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInviteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [inviteToken, t]);

  useEffect(() => {
    if (loading || !user || postAuthBusy) {
      return;
    }

    if (inviteToken) {
      setPostAuthBusy(true);
      acceptInvitation(inviteToken)
        .then(() => {
          navigate('/shop', { replace: true });
        })
        .catch((inviteError) => {
          setError(inviteError instanceof Error ? inviteError.message : t('auth.authGeneric'));
          setPostAuthBusy(false);
        });
      return;
    }

    setPostAuthBusy(true);
    navigate(returnPath, { replace: true });
  }, [inviteToken, loading, navigate, postAuthBusy, returnPath, t, user]);

  const firebaseMissing = !isFirebaseConfigured() || !firebaseAuth || !googleProvider;

  const handleGoogleSignIn = async () => {
    if (!firebaseAuth || !googleProvider) {
      setError(t('auth.setFirebase'));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (err) {
      setError(getLocalizedAuthError(t, err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!firebaseAuth) {
      setError(t('auth.setFirebase'));
      return;
    }

    setError(null);
    setSubmitting(true);
    setResetSent(false);

    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password
        );
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      }
    } catch (err) {
      setError(getLocalizedAuthError(t, err));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!firebaseAuth) {
      setError(t('auth.setFirebase'));
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t('auth.invalidInput'));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, trimmedEmail);
      setResetSent(true);
    } catch (err) {
      setError(getLocalizedAuthError(t, err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
            {t('auth.loading')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_42%),linear-gradient(135deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.94))]" />

        <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-10">
          <div className="mb-8">
              <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-primary"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
              {t('auth.backToStore')}
            </Link>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="space-y-6">
                <div className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-primary">
                <Terminal className="h-3 w-3" />
                {t('auth.accountAccess')}
              </div>

              <div className="space-y-4 max-w-xl">
                <h1 className="font-display text-5xl leading-none text-primary crt-glow-strong md:text-7xl">
                  {t('auth.hero.title')}
                </h1>
                <p className="max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
                  {t('auth.hero.body')}
                </p>
                <p className="text-xs uppercase tracking-[0.22em] text-accent">
                  {t('auth.shopAfter')}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  t('auth.google'),
                  t('auth.email') + '/' + t('auth.password'),
                  t('auth.savedOrders'),
                ].map((item) => (
                  <div
                    key={item}
                    className="border border-border bg-card/70 px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground"
                  >
                    <Sparkles className="mb-2 h-4 w-4 text-primary" />
                    {item}
                  </div>
                ))}
              </div>

              <div className="max-w-xl space-y-3 border border-border/60 bg-card/70 p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    {t('auth.firebaseIdentity')}
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    {t('auth.googleFastest')}
                  </p>
                </div>
                {inviteToken && (
                  <div className="flex items-start gap-3 border border-primary/30 bg-primary/10 p-3">
                    <Mail className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <p className="text-primary">
                        {inviteLoading
                          ? t('auth.inviteLoading')
                          : `${t('auth.inviteRole')}: ${invitePreview?.role || 'pending'}`}
                      </p>
                      {invitePreview?.branch && (
                        <p className="text-xs text-muted-foreground">
                          {t('auth.inviteBranch')}: {invitePreview.branch}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <Card className="industrial-border bg-card/90 backdrop-blur scanlines">
              <CardHeader className="border-b border-border/50 pb-6">
                <CardTitle className="font-display text-2xl text-primary crt-glow">
                  {t('auth.signInTitle')}
                </CardTitle>
                <CardDescription>
                  {t('auth.signInSubtitle')}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5 pt-6">
                {firebaseMissing && (
                  <div className="flex gap-3 border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-semibold text-amber-100">
                        {t('auth.firebaseMissing')}
                      </p>
                      <p className="text-amber-100/80">
                        {t('auth.setFirebase')}
                      </p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex gap-3 border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-semibold text-red-100">{t('auth.signInFailed')}</p>
                      <p className="text-red-100/80">{error}</p>
                    </div>
                  </div>
                )}

                {resetSent && (
                  <div className="border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                    {t('auth.resetSent')}
                  </div>
                )}

                <Button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full"
                  variant="outline"
                  disabled={submitting || firebaseMissing}
                >
                  {postAuthBusy ? t('auth.redirecting') : t('auth.google')}
                </Button>

                <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  <span className="flex-1 border-t border-border/60" />
                  <span>{t('auth.or')}</span>
                  <span className="flex-1 border-t border-border/60" />
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('auth.email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder={t('auth.emailPlaceholder')}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t('auth.password')}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        placeholder={t('auth.password')}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-primary"
                        aria-label={showPassword ? t('auth.passwordHide') : t('auth.passwordShow')}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button type="submit" className="w-full" disabled={submitting || firebaseMissing || postAuthBusy}>
                      {mode === 'signup' ? t('auth.createAccount') : t('auth.signIn')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        setMode((current) =>
                          current === 'signin' ? 'signup' : 'signin'
                        )
                      }
                      disabled={submitting || firebaseMissing || postAuthBusy}
                    >
                      {mode === 'signup' ? t('auth.useSignIn') : t('auth.createAccount')}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      disabled={submitting || firebaseMissing || !email.trim() || postAuthBusy}
                      className="text-left text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:text-muted-foreground"
                    >
                      {t('auth.resetPassword')}
                    </button>
                    <span>{getReturnPathLabel(t, returnPath)}</span>
                  </div>
                </form>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('auth.policy')}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
