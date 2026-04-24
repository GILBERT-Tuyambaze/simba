import { useEffect } from 'react';
import { client } from '../lib/api';
import { useI18n } from '@/lib/i18n';

export default function AuthCallback() {
  const { t } = useI18n();

  useEffect(() => {
    client.auth.login();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">{t('auth.processingCallback')}</p>
      </div>
    </div>
  );
}
