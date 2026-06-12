import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Shield, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/access-control';
import { getStoreRoleMeta } from '@/lib/store-roles';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';

type ProtectedRouteProps = {
  children: React.ReactNode;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { authState, loading, login } = useAuth();
  const location = useLocation();
  const { t } = useI18n();
  const roleMeta = getStoreRoleMeta(authState.accessRole);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{t('auth.verifyPermissions')}</p>
        </div>
      </div>
    );
  }

  if (!authState.isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (!canAccessRoute(authState, location.pathname)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Shield className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>{t('auth.noAccess')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">{t('auth.noAccessBody')}</p>
            <div className="rounded-md border border-border bg-secondary/30 p-3">
              <div className="flex items-center justify-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{t('auth.currentRole')}: {roleMeta.label}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{roleMeta.description}</div>
            </div>
            <Button onClick={login} className="w-full" variant="outline">
              {t('auth.switchAccount')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
