import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageDialog } from '@/components/ui/message-dialog';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function EmailVerificationPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  // Check if we have an email confirmation token
  const token = searchParams.get('token');
  const tokenHash = searchParams.get('token_hash');
  const email = searchParams.get('email');
  const type = searchParams.get('type');

  useEffect(() => {
    const verifyEmail = async () => {
      if (type !== 'email' || (!token && !tokenHash)) {
        setError('Invalid email verification link. Please check your email for the correct link.');
        setAlertOpen(true);
        setLoading(false);
        return;
      }

      try {
        // Verify the email token or token hash
        const verifyArgs = tokenHash
          ? { token_hash: tokenHash, type: 'email' as const }
          : email
          ? { email, token: token!, type: 'email' as const }
          : null;

        if (!verifyArgs) {
          setError('Email is required to verify this confirmation link.');
          setAlertOpen(true);
          setLoading(false);
          return;
        }

        const { data, error: verifyError } = await supabase.auth.verifyOtp(verifyArgs);

        if (verifyError || !data.user) {
          throw verifyError || new Error('Failed to verify email.');
        }

        setSuccess(true);
        setAlertOpen(true);

        // Redirect to login or shop after success
        setTimeout(() => {
          navigate('/shop', { replace: true });
        }, 2000);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to verify email.';
        setError(message);
        setAlertOpen(true);
      } finally {
        setLoading(false);
      }
    };

    verifyEmail();
  }, [email, navigate, token, tokenHash, type]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary mb-4" />
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                Verifying email...
              </p>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl">Email Verification</CardTitle>
            </div>
            <CardDescription>
              {success
                ? 'Your email has been verified successfully.'
                : 'We are verifying your email address.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <Button
                onClick={() => navigate('/shop', { replace: true })}
                className="w-full"
              >
                Continue to Shop
              </Button>
            ) : (
              <Button onClick={() => navigate('/login')} variant="outline" className="w-full">
                Back to Login
              </Button>
            )}

            <MessageDialog
              open={alertOpen}
              onOpenChange={(open) => {
                if (!open && !success) {
                  setError(null);
                }
                setAlertOpen(open);
              }}
              title={success ? 'Email verified' : 'Verification error'}
              description={
                success
                  ? 'Your email has been verified. You can now use your account.'
                  : error || 'Failed to verify your email.'
              }
              variant={success ? 'success' : 'error'}
              actionLabel="Close"
            />
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
