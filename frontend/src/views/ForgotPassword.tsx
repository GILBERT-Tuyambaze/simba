import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageDialog } from '@/components/ui/message-dialog';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) throw resetError;
      setSuccess(true);
      setAlertOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset link.');
      setAlertOpen(true);
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

        <main className="relative flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <Card className="industrial-border dark:bg-card/92 bg-white/92 dark:backdrop-blur-sm backdrop-blur-2xl scanlines shadow-2xl border-black/5">
              <CardHeader className="dark:border-b border-b dark:border-border/50 border-black/10 pb-6">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="h-4 w-4 text-primary" />
                  <span className="text-[10px] uppercase tracking-[0.3em] text-primary">System Recovery</span>
                </div>
                <CardTitle className="font-display text-2xl text-primary crt-glow">
                  {t('auth.forgotPasswordTitle')}
                </CardTitle>
                <CardDescription>
                  {t('auth.forgotPasswordSubtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('auth.email')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder={t('auth.emailPlaceholder')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Transmitting...' : t('auth.sendResetLink')}
                  </Button>
                  <div className="pt-2 text-center">
                    <Link to="/login" className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors">
                      <ArrowRight className="h-3 w-3 rotate-180" />
                      {t('auth.backToLogin')}
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>

      <MessageDialog
        open={alertOpen}
        onOpenChange={setAlertOpen}
        title={success ? 'Reset Link Sent' : 'Recovery Failed'}
        description={success ? t('auth.resetSent') : error || 'An error occurred.'}
        variant={success ? 'success' : 'error'}
      />
    </div>
  );
}