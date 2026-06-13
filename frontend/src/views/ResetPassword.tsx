import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageDialog } from '@/components/ui/message-dialog';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  // Check if we have a recovery token
  const token = searchParams.get('token');
  const tokenHash = searchParams.get('token_hash');
  const email = searchParams.get('email');
  const type = searchParams.get('type');

  useEffect(() => {
    if (type !== 'recovery' || (!token && !tokenHash)) {
      setError('Invalid password reset link. Please request a new one.');
      setAlertOpen(true);
    }
  }, [token, tokenHash, type]);

  useEffect(() => {
    setAlertOpen(Boolean(error || success));
  }, [error, success]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate inputs
    if (!password || !confirmPassword) {
      setError('Please enter a password and confirm it.');
      setAlertOpen(true);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      setAlertOpen(true);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setAlertOpen(true);
      return;
    }

    setLoading(true);
    try {
      // Verify the token first
      const verifyArgs = tokenHash
        ? { token_hash: tokenHash, type: 'recovery' as const }
        : email
        ? { email, token: token || '', type: 'recovery' as const }
        : null;

      if (!verifyArgs) {
        throw new Error('Email is required to verify this password reset link.');
      }

      const { data, error: verifyError } = await supabase.auth.verifyOtp(verifyArgs);

      if (verifyError || !data.user) {
        throw verifyError || new Error('Failed to verify recovery token.');
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      setPassword('');
      setConfirmPassword('');

      // Redirect after success
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset password.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

 return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="hero-surface relative overflow-hidden flex flex-col min-h-screen">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute inset-0 dark:bg-background/35 bg-white/10" />
        <Header />

        <main className="relative flex-1 flex items-center justify-center px-4 py-10">
          <Card className="industrial-border dark:bg-card/92 bg-white/92 dark:backdrop-blur-sm backdrop-blur-2xl scanlines shadow-2xl border-black/5 w-full max-w-md">
            <CardHeader className="dark:border-b border-b dark:border-border/50 border-black/10 pb-6">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="h-5 w-5 text-primary" />
                <CardTitle className="font-display text-2xl text-primary crt-glow">
                  {t('auth.resetPassword')}
                </CardTitle>
              </div>
              <CardDescription>
                Enter your new password to reset your account access.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={t('auth.password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>

      <MessageDialog
        open={alertOpen}
        onOpenChange={(open) => {
          if (!open && !success) {
            setError(null);
          }
          setAlertOpen(open);
        }}
        title={success ? 'Password reset successful' : 'Error'}
        description={
          success
            ? 'Your password has been reset. You will be redirected to login.'
            : error || 'An error occurred.'
        }
        variant={success ? 'success' : 'error'}
        actionLabel={success ? 'Go to Login' : 'Try Again'}
      />
    </div>
  );
}
