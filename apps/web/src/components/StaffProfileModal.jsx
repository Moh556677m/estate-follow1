import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserCog,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import { formatDate } from '@/lib/api';
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  defaultPermissionsFor,
  isSuperAdmin,
  roleDisplay,
} from '@/lib/permissions';
import { cn } from '@/lib/utils';

const StaffProfileModal = ({ user: userProp, onClose, onRefresh }) => {
  const { t, lang } = useLanguage();

  // Keep rendering the last non-null profile while the dialog closes, so the
  // <Dialog> stays mounted throughout and Radix runs its own close animation
  // and body-pointer-events cleanup, instead of the whole subtree being
  // yanked out mid-open by an early `return null` — which is what was
  // leaving the admin dashboard frozen/unclickable. Every other reference to
  // `user` below intentionally keeps using this derived value; only the
  // Dialog's own `open` prop tracks the real `userProp`.
  const [lastUser, setLastUser] = useState(userProp);
  useEffect(() => {
    if (userProp) setLastUser(userProp);
  }, [userProp]);
  const user = userProp || lastUser;

  const [perms, setPerms] = useState({});
  const [role, setRole] = useState('admin');
  const [staffLabel, setStaffLabel] = useState('');
  const [suspended, setSuspended] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const flash = (msg) => {
    setNotice(msg);
    setError('');
    setTimeout(() => setNotice(''), 4000);
  };

  useEffect(() => {
    if (!user) return;
    setRole(user.role || 'admin');
    setStaffLabel(user.staff_label || '');
    setSuspended(!!user.suspended);
    setNewEmail(user.email || '');
    const base = defaultPermissionsFor(user.role || 'admin');
    const existing = user.permissions && typeof user.permissions === 'object' ? user.permissions : {};
    setPerms({ ...base, ...existing });
    setNotice('');
    setError('');
  }, [user]);

  if (!user) return null;

  const protectedAccount = isSuperAdmin(user);

  const togglePerm = (key) => setPerms((p) => ({ ...p, [key]: !p[key] }));

  const savePermissions = async () => {
    setBusy('perms');
    try {
      await pb.collection('users').update(user.id, {
        permissions: perms,
        can_view_revenue: !!perms.view_revenue,
      });
      flash(t('permissions_saved'));
      onRefresh?.();
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setBusy('');
    }
  };

  const saveRole = async () => {
    setBusy('role');
    try {
      await pb.collection('users').update(user.id, {
        role,
        staff_label: role === 'custom' ? staffLabel : '',
      });
      flash(t('role_changed'));
      onRefresh?.();
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setBusy('');
    }
  };

  const saveStatus = async () => {
    if (protectedAccount) {
      setError(t('cannot_delete_super_admin'));
      return;
    }
    setBusy('status');
    try {
      await pb.collection('users').update(user.id, { suspended: !suspended });
      setSuspended((s) => !s);
      flash(t('status_changed'));
      onRefresh?.();
    } catch (err) {
      const msg = String(err?.response?.message || err?.message || '');
      if (msg.includes('SUPER_ADMIN_PROTECTED')) {
        setError(t('cannot_delete_super_admin'));
      } else {
        setError(String(err?.message || t('something_wrong')));
      }
    } finally {
      setBusy('');
    }
  };

  const submitEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      setError(t('something_wrong'));
      return;
    }
    setBusy('email');
    try {
      await pb.collection('users').update(user.id, { email: newEmail.trim() });
      flash(t('email_changed'));
      setEmailOpen(false);
      onRefresh?.();
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setBusy('');
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (newPassword.length < 10) {
      setError(t('password_too_short'));
      return;
    }
    setBusy('reset');
    try {
      await pb.collection('users').update(user.id, {
        password: newPassword,
        passwordConfirm: newPassword,
      });
      flash(t('reset_password_success'));
      setResetOpen(false);
      setNewPassword('');
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setBusy('');
    }
  };

  const verifyEmail = async () => {
    if (user.verified) {
      flash(t('email_already_verified'));
      return;
    }
    setBusy('verify');
    try {
      await pb.collection('users').update(user.id, { verified: true });
      flash(t('verify_email_success'));
      onRefresh?.();
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setBusy('');
    }
  };

  const deleteUser = async () => {
    if (protectedAccount) {
      setError(t('cannot_delete_super_admin'));
      return;
    }
    if (!window.confirm(t('confirm_delete_user'))) return;
    setBusy('delete');
    try {
      await pb.collection('users').delete(user.id);
      onRefresh?.();
      onClose();
    } catch (err) {
      const msg = String(err?.response?.message || err?.message || '');
      if (msg.includes('SUPER_ADMIN_PROTECTED')) {
        setError(t('cannot_delete_super_admin'));
      } else {
        setError(String(err?.message || t('something_wrong')));
      }
    } finally {
      setBusy('');
    }
  };

  return (
    <Dialog open={!!userProp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('edit_staff_title')}</DialogTitle>
          <DialogDescription dir="ltr">{user.email}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {notice && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {notice}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          {/* Identity */}
          <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
              {(user.name || user.email || '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{user.name || '—'}</p>
              <p className="text-xs text-muted-foreground truncate" dir="ltr">
                {user.email} {user.phone && `· ${user.phone}`}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-full border bg-[hsl(var(--gold))]/15 px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30">
                  {roleDisplay(user, t)}
                </span>
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    suspended
                      ? 'bg-red-100 text-red-800 border-red-200'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200',
                  )}
                >
                  {suspended ? t('suspended_flag') : t('active_flag')}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    user.verified
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200',
                  )}
                >
                  <Mail size={11} />
                  {user.verified ? t('email_already_verified') : t('verify_email')}
                </span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h4 className="text-sm font-bold text-primary flex items-center gap-2">
              <UserCog size={15} /> {t('actions')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {!user.verified && (
                <Button size="sm" variant="outline" onClick={verifyEmail} disabled={busy === 'verify'} className="min-h-[36px]">
                  {busy === 'verify' ? <Loader2 size={14} className="animate-spin me-1" /> : <BadgeCheck size={14} className="me-1" />}
                  {t('verify_email')}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => { setEmailOpen(true); setError(''); }} className="min-h-[36px]">
                <Mail size={14} className="me-1" />
                {t('change_email')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setResetOpen(true); setError(''); }} className="min-h-[36px]">
                <KeyRound size={14} className="me-1" />
                {t('reset_password')}
              </Button>
              {!protectedAccount && (
                <Button
                  size="sm"
                  variant={suspended ? 'default' : 'destructive'}
                  onClick={saveStatus}
                  disabled={busy === 'status'}
                  className="min-h-[36px]"
                >
                  <ShieldCheck size={14} className="me-1" />
                  {suspended ? t('activate') : t('suspend')}
                </Button>
              )}
              {!protectedAccount && (
                <Button size="sm" variant="ghost" onClick={deleteUser} disabled={busy === 'delete'} className="min-h-[36px] text-destructive hover:text-destructive">
                  {busy === 'delete' ? <Loader2 size={14} className="animate-spin me-1" /> : <Trash2 size={14} className="me-1" />}
                  {t('delete_user')}
                </Button>
              )}
            </div>
          </div>

          {/* Role */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h4 className="text-sm font-bold text-primary">{t('change_role')}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select value={role} onValueChange={setRole} disabled={protectedAccount}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t('role_admin')}</SelectItem>
                  <SelectItem value="editor">{t('role_editor')}</SelectItem>
                  <SelectItem value="support">{t('role_support')}</SelectItem>
                  <SelectItem value="custom">{t('role_custom')}</SelectItem>
                </SelectContent>
              </Select>
              {role === 'custom' && (
                <Input
                  value={staffLabel}
                  onChange={(e) => setStaffLabel(e.target.value)}
                  className="min-h-[44px]"
                  placeholder={t('custom_role_name_hint')}
                  disabled={protectedAccount}
                />
              )}
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={saveRole} disabled={busy === 'role' || protectedAccount} className="min-h-[36px]">
                {busy === 'role' ? <Loader2 size={14} className="animate-spin me-1" /> : null}
                {t('change_role')}
              </Button>
            </div>
          </div>

          {/* Permissions */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div>
              <h4 className="text-sm font-bold text-primary">{t('staff_permissions')}</h4>
              <p className="text-xs text-muted-foreground">{t('staff_permissions_hint')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PERMISSION_KEYS.map((key) => (
                <label
                  key={key}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer',
                    perms[key] ? 'border-primary/40 bg-primary/5' : 'bg-card',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={!!perms[key]}
                    onChange={() => togglePerm(key)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  {t(PERMISSION_LABELS[key])}
                </label>
              ))}
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={savePermissions} disabled={busy === 'perms'} className="min-h-[36px]">
                {busy === 'perms' ? <Loader2 size={14} className="animate-spin me-1" /> : null}
                {t('save')}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground" dir="ltr">
            {t('joined')}: {formatDate(user.created, lang)}
          </p>
        </div>
      </DialogContent>

      {/* Change email sub-dialog */}
      <Dialog open={emailOpen} onOpenChange={(o) => { setEmailOpen(o); if (!o) setNewEmail(user.email || ''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('change_email_title')}</DialogTitle>
            <DialogDescription>{t('change_email_hint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEmail} className="space-y-3 pt-2">
            <div className="space-y-2">
              <Label>{t('email')}</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                dir="ltr"
                className="min-h-[44px]"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEmailOpen(false)} className="min-h-[44px]">
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={busy === 'email'} className="min-h-[44px]">
                {busy === 'email' ? <Loader2 size={16} className="animate-spin me-1" /> : <Mail size={16} className="me-1" />}
                {t('change_email')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password sub-dialog */}
      <Dialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (!o) setNewPassword(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('reset_password_title')}</DialogTitle>
            <DialogDescription>{t('reset_password_hint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitReset} className="space-y-3 pt-2">
            <div className="space-y-2">
              <Label>{t('new_password')}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                dir="ltr"
                className="min-h-[44px]"
                placeholder={t('password_hint')}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)} className="min-h-[44px]">
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={busy === 'reset'} className="min-h-[44px]">
                {busy === 'reset' ? <Loader2 size={16} className="animate-spin me-1" /> : <KeyRound size={16} className="me-1" />}
                {t('reset_password')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default StaffProfileModal;
