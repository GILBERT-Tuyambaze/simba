import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

function normalizeAuthErrorMessage(
  t: (key: string, fallback?: string) => string,
  message: string | null
): string {
  const raw = (message || '').trim();
  const lowered = raw.toLowerCase();

  if (!raw) {
    return t('auth.authErrorBody');
  }

  if (
    lowered.includes('invalid') ||
    lowered.includes('expired') ||
    lowered.includes('authentication')
  ) {
    return t('auth.authErrorBody');
  }

  if (lowered.includes('firebase') && lowered.includes('session')) {
    return t('auth.setFirebase');
  }

  return t('auth.authErrorBody');
}

export default function AuthErrorPage() {
  const [searchParams] = useSearchParams();
  const [countdown, setCountdown] = useState(3);
  const { t } = useI18n();
  const errorMessage = normalizeAuthErrorMessage(t, searchParams.get('msg'));

  useEffect(() => {
    // Countdown logic
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          window.location.href = '/';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Clean up timer
    return () => clearInterval(timer);
  }, []);

  const handleReturnHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50 p-6 text-center">
      <div className="space-y-6 max-w-md">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full"></div>
              <AlertCircle
                className="relative h-12 w-12 text-red-500"
                strokeWidth={1.5}
              />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-800">{t('auth.authError')}</h1>

          <p className="text-base text-muted-foreground">{errorMessage}</p>
          <p className="text-sm text-gray-500">{t('auth.authErrorHint')}</p>

          <div className="pt-2">
            <p className="text-sm text-gray-500">
              {countdown > 0 ? (
                <>
                  {t('auth.authErrorCountdown')}{' '}
                  <span className="text-blue-600 font-semibold text-base">
                    {countdown}
                  </span>{' '}
                  {t('auth.authErrorSeconds')}
                </>
              ) : (
                t('auth.authErrorRedirecting')
              )}
            </p>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <Button onClick={handleReturnHome} className="px-6">
            {t('auth.authErrorReturn')}
          </Button>
        </div>
      </div>
    </div>
  );
}
