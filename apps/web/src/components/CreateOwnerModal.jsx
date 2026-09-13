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
import PhoneField from '@/components/PhoneField';
import NationalityField from '@/components/NationalityField';
import GenderField from '@/components/GenderField';

const empty = {
  name: '',
  email: '',
  phone: '',
  nationality: '',
  gender: '',
  password: '',
  role: 'owner',
  account_state: 'active',
  access_plan: 'free',
  subscription_status: 'none',
  verified: true,
};

const CreateOwnerModal = ({ open, onOpenChange, onCreated }) => {
  const { t } = useLanguage();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const reset = () => setForm(empty);

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
      const suspended = form.account_state === 'suspended' || form.account_state === 'inactive';
      await pb.collection('users').create({
        name: form.name,
        email: form.email,
        password: form.password,
        passwordConfirm: form.password,
        phone: form.phone,
        nationality: form.nationality,
        gender: form.gender,
        role: form.role,
        verified: !!form.verified,
        suspended,
        account_state: form.account_state,
        access_plan: form.access_plan,
        subscription_status: form.subscription_status,
        pending_signup: false,
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
            {t('create_owner_title')}
          </DialogTitle>
          <DialogDescription>{t('create_owner_subtitle')}</DialogDescription>
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

          <PhoneField
            label={t('phone')}
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            heightClass="min-h-[44px]"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NationalityField
              label={t('nationality')}
              value={form.nationality}
              onChange={(v) => setForm((f) => ({ ...f, nationality: v }))}
              heightClass="min-h-[44px]"
            />
            <GenderField
              value={form.gender}
              onChange={(v) => setForm((f) => ({ ...f, gender: v }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('account_type')}</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">{t('role_owner')}</SelectItem>
                  <SelectItem value="admin">{t('role_admin')}</SelectItem>
                  <SelectItem value="editor">{t('role_editor')}</SelectItem>
                  <SelectItem value="support">{t('role_support')}</SelectItem>
                  <SelectItem value="custom">{t('role_custom')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.role === 'owner' ? t('free_account_hint') : t('staff_permissions_hint')}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('account_status')}</Label>
              <Select
                value={form.account_state}
                onValueChange={(v) => setForm((f) => ({ ...f, account_state: v }))}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('status_active_option')}</SelectItem>
                  <SelectItem value="inactive">{t('status_inactive_option')}</SelectItem>
                  <SelectItem value="suspended">{t('status_suspended_option')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('access_plan')}</Label>
              <Select
                value={form.access_plan}
                onValueChange={(v) => setForm((f) => ({ ...f, access_plan: v }))}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">{t('access_free')}</SelectItem>
                  <SelectItem value="paid">{t('access_paid')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('subscription_status_label')}</Label>
              <Select
                value={form.subscription_status}
                onValueChange={(v) => setForm((f) => ({ ...f, subscription_status: v }))}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('sub_status_none')}</SelectItem>
                  <SelectItem value="active">{t('sub_status_active')}</SelectItem>
                  <SelectItem value="expired">{t('sub_status_expired')}</SelectItem>
                  <SelectItem value="cancelled">{t('sub_status_cancelled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('email_verified_status')}</Label>
            <Select
              value={form.verified ? 'yes' : 'no'}
              onValueChange={(v) => setForm((f) => ({ ...f, verified: v === 'yes' }))}
            >
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">{t('email_verified_yes')}</SelectItem>
                <SelectItem value="no">{t('email_verified_no')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('manual_create_no_otp')}</p>
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
              {t('create_owner')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateOwnerModal;
