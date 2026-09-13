import React, { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  defaultPermissionsFor,
} from '@/lib/permissions';
import { cn } from '@/lib/utils';

const empty = {
  name: '',
  email: '',
  password: '',
  role: 'admin',
  staff_label: '',
  suspended: false,
};

const CreateStaffModal = ({ open, onOpenChange, onCreated }) => {
  const { t } = useLanguage();
  const [form, setForm] = useState(empty);
  const [perms, setPerms] = useState(() => defaultPermissionsFor('admin'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const reset = () => {
    setForm(empty);
    setPerms(defaultPermissionsFor('admin'));
  };

  const onRoleChange = (role) => {
    setForm((f) => ({ ...f, role }));
    setPerms(defaultPermissionsFor(role));
  };

  const togglePerm = (key) =>
    setPerms((p) => ({ ...p, [key]: !p[key] }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError(t('something_wrong'));
      return;
    }
    if (form.password.length < 10) {
      setError(t('password_too_short'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await pb.collection('users').create({
        name: form.name,
        email: form.email,
        password: form.password,
        passwordConfirm: form.password,
        role: form.role,
        staff_label: form.role === 'custom' ? form.staff_label : '',
        permissions: perms,
        can_view_revenue: !!perms.view_revenue,
        verified: true,
        suspended: !!form.suspended,
        account_state: form.suspended ? 'suspended' : 'active',
      });
      onCreated?.();
      onOpenChange(false);
      reset();
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === 'object') {
        const parts = Object.entries(data).map(([field, info]) => {
          const msg = info?.message || info?.code || '';
          return msg ? `${field}: ${msg}` : field;
        });
        setError(parts.join(' · ') || err?.message || t('something_wrong'));
      } else {
        setError(err?.message || t('something_wrong'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          reset();
          setError('');
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <UserPlus size={16} />
            </span>
            {t('create_staff_title')}
          </DialogTitle>
          <DialogDescription>{t('create_staff_subtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>{t('name')}</Label>
            <Input value={form.name} onChange={set('name')} required className="min-h-[44px]" />
          </div>

          <div className="space-y-2">
            <Label>{t('email')}</Label>
            <Input
              type="email"
              value={form.email}
              onChange={set('email')}
              required
              dir="ltr"
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label>{t('password')}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              dir="ltr"
              className="min-h-[44px]"
              placeholder={t('password_hint')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('staff_role')}</Label>
              <Select value={form.role} onValueChange={onRoleChange}>
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
            </div>
            <div className="space-y-2">
              <Label>{t('account_status')}</Label>
              <Select
                value={form.suspended ? 'suspended' : 'active'}
                onValueChange={(v) => setForm((f) => ({ ...f, suspended: v === 'suspended' }))}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('status_active_option')}</SelectItem>
                  <SelectItem value="suspended">{t('status_suspended_option')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.role === 'custom' && (
            <div className="space-y-2">
              <Label>{t('custom_role_name')}</Label>
              <Input
                value={form.staff_label}
                onChange={set('staff_label')}
                className="min-h-[44px]"
                placeholder={t('custom_role_name_hint')}
              />
            </div>
          )}

          <div className="space-y-2 rounded-xl border bg-card p-4">
            <div>
              <p className="text-sm font-semibold">{t('staff_permissions')}</p>
              <p className="text-xs text-muted-foreground">{t('staff_permissions_hint')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
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
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="min-h-[44px]"
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={saving} className="min-h-[44px]">
              {saving ? <Loader2 size={16} className="animate-spin me-1" /> : <UserPlus size={16} className="me-1" />}
              {t('create_staff')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateStaffModal;
