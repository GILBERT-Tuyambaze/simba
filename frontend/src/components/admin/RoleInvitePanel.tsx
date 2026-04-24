import { useMemo, useState } from 'react';
import { Link2, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { createRoleInvitation, updateAdminUserRole } from '@/lib/admin';
import { BRANCHES, type Invitation, type UserProfile } from '@/lib/types';
import {
  canUpdateExistingRoles,
  getAssignableRoles,
  getStoreRoleMeta,
  normalizeStoreRole,
} from '@/lib/store-roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';

type Props = {
  actorRole: string;
  defaultBranch?: string | null;
  profiles: UserProfile[];
  invitations: Invitation[];
  onRefresh: () => void;
};

export default function RoleInvitePanel({
  actorRole,
  defaultBranch,
  profiles,
  invitations,
  onRefresh,
}: Props) {
  const { t } = useI18n();
  const assignableRoles = getAssignableRoles(actorRole);
  const branchLocked = normalizeStoreRole(actorRole) !== 'super_admin';

  const [busy, setBusy] = useState(false);
  const [inviteRole, setInviteRole] = useState(assignableRoles[0] || 'customer');
  const [inviteBranch, setInviteBranch] = useState(defaultBranch || BRANCHES[0]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [roleOverrideUserId, setRoleOverrideUserId] = useState('');
  const [roleOverrideValue, setRoleOverrideValue] = useState('customer');
  const [roleOverrideBranch, setRoleOverrideBranch] = useState(defaultBranch || BRANCHES[0]);

  const recentInvitations = useMemo(() => invitations.slice(0, 6), [invitations]);

  const handleCreateInvite = async () => {
    if (!inviteRole) {
      toast.error(t('admin.inviteChooseRole'));
      return;
    }

    setBusy(true);
    try {
      const invitation = await createRoleInvitation({
        role: inviteRole,
        branch: branchLocked ? defaultBranch || inviteBranch : inviteBranch,
        invited_email: inviteEmail.trim() || null,
      });
      const inviteUrl = `${window.location.origin}/login?invite=${invitation.token}`;
      await navigator.clipboard.writeText(inviteUrl).catch(() => {});
      toast.success(t('admin.inviteCreated'));
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('admin.inviteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleRoleOverride = async () => {
    if (!roleOverrideUserId) {
      toast.error(t('admin.overrideChooseUser'));
      return;
    }

    setBusy(true);
    try {
      await updateAdminUserRole(roleOverrideUserId, {
        role: roleOverrideValue,
        branch: roleOverrideBranch,
      });
      toast.success(t('admin.overrideUpdated'));
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('admin.overrideFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="industrial-border bg-card/90 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-display text-primary">
          <Send className="h-4 w-4" />
          {t('admin.roleInvitationFlow')}
        </div>
        <div className="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {t('admin.roleInvitationHelp')}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="invite_role">{t('admin.role')}</Label>
            <select
              id="invite_role"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value)}
              className="w-full border border-border bg-input p-2 font-mono text-sm"
            >
              {assignableRoles.map((role) => (
                <option key={role} value={role}>
                  {getStoreRoleMeta(role).label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite_branch">{t('admin.branch')}</Label>
            <select
              id="invite_branch"
              value={branchLocked ? defaultBranch || inviteBranch : inviteBranch}
              onChange={(event) => setInviteBranch(event.target.value)}
              disabled={branchLocked}
              className="w-full border border-border bg-input p-2 font-mono text-sm"
            >
              {BRANCHES.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="invite_email">{t('admin.optionalEmailLock')}</Label>
            <Input
              id="invite_email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder={t('admin.optionalEmailPlaceholder')}
            />
          </div>
        </div>
        <Button type="button" className="mt-4 w-full gap-2" onClick={() => void handleCreateInvite()} disabled={busy}>
          <Link2 className="h-4 w-4" />
          {busy ? t('admin.creatingInvitation') : t('admin.createInvitationLink')}
        </Button>
      </div>

      <div className="industrial-border bg-card/90 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-display text-primary">
          <ShieldCheck className="h-4 w-4" />
          {t('admin.recentInvitations')}
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          {recentInvitations.map((invitation) => (
            <div key={invitation.token} className="border border-border bg-secondary/20 p-3">
              <div className="text-foreground">
                {getStoreRoleMeta(invitation.role).label}
              </div>
              <div>{invitation.branch || t('admin.noBranchLock')}</div>
              <div className="uppercase">{invitation.status}</div>
            </div>
          ))}
          {recentInvitations.length === 0 && <div>{t('admin.noInvitationLinks')}</div>}
        </div>

        {canUpdateExistingRoles(actorRole) && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-3 text-sm font-display text-primary">{t('admin.superAdminRoleOverride')}</div>
            <div className="grid gap-3">
              <select
                value={roleOverrideUserId}
                onChange={(event) => setRoleOverrideUserId(event.target.value)}
                className="w-full border border-border bg-input p-2 font-mono text-sm"
              >
                <option value="">{t('admin.selectUser')}</option>
                {profiles.map((profile) => (
                  <option key={profile.user_id} value={profile.user_id}>
                    {profile.display_name || profile.email}
                  </option>
                ))}
              </select>
              <select
                value={roleOverrideValue}
                onChange={(event) => setRoleOverrideValue(event.target.value)}
                className="w-full border border-border bg-input p-2 font-mono text-sm"
              >
                {['super_admin', 'branch_manager', 'branch_staff', 'delivery_agent', 'customer'].map((role) => (
                  <option key={role} value={role}>
                    {getStoreRoleMeta(role).label}
                  </option>
                ))}
              </select>
              <select
                value={roleOverrideBranch}
                onChange={(event) => setRoleOverrideBranch(event.target.value)}
                className="w-full border border-border bg-input p-2 font-mono text-sm"
              >
                {BRANCHES.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" onClick={() => void handleRoleOverride()} disabled={busy}>
                {t('admin.updateExistingRole')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
