import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  RefreshCw,
  UserRound,
  Check,
  Mail,
  Phone,
  ShieldCheck,
  Loader2,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  RotateCw,
  Upload,
  Send,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import pb from '@/lib/pocketbaseClient';
import PhoneField from '@/components/PhoneField';
import NationalityField from '@/components/NationalityField';
import GenderField from '@/components/GenderField';
import DateField from '@/components/DateField';
import VerifiedBadge from '@/components/VerifiedBadge';
import IdentityDocumentsSection from '@/components/IdentityDocumentsSection';
import { safeSyncAuthRecord, compressImage } from '@/lib/uploadClient';
import { ensureFreshToken, withAuthRetry } from '@/lib/authRefresh';
import { cn } from '@/lib/utils';
import {
  requestEmailChange,
  verifyOldEmailCode,
  confirmEmailChange,
  requestPhoneChange,
  confirmPhoneChange,
} from '@/lib/profileApi';
import {
  getVerificationStatus,
  sendEmailCode,
  verifyEmailCode,
  sendPhoneCode,
  verifyPhoneCode,
  submitVerification,
  completeBasicProfile,
} from '@/lib/referralClient';

// Unified Owner Profile — a SINGLE page that holds every owner detail,
// account completion, verification, identity document upload and review
// status. Nothing is duplicated: each piece of data has one field and one
// source of truth. The separate "Verify Account" sidebar item was removed;
// its functions live here now.
//
// Layout (top → bottom):
//   1. Header: profile photo (upload/change/remove) + name (editable once)
//      + account status badge (+ verified badge when approved).
//   2. Personal information: nationality, gender, date of birth, phone
//      (with verify status + button), email (with verify status + button).
//   3. Identity document: type, number, uploaded file (open/replace).
//   4. Save / submit bar — one button whose label follows the account state.
//
// Registration data (name, email, phone, nationality, gender) is already on
// the users record from signup, so every field is pre-filled. Email & phone
// values are OTP-protected for CHANGES (separate modals); verification is a
// one-tap OTP flow inline next to each field. Saving never logs the user out.
const OwnerProfileEditor = () => {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');

  const [profile, setProfile] = useState({
    name: '',
    nationality: '',
    gender: '',
    date_of_birth: '',
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [fileError, setFileError] = useState('');

  // Inline verification OTP modal (email or phone).
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpPurpose, setOtpPurpose] = useState(''); // 'email' | 'phone'
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState('');

  // Email / phone CHANGE modals (OTP-protected change of the value itself).
  const [emailModal, setEmailModal] = useState(false);
  const [phoneModal, setPhoneModal] = useState(false);

  const avatarRef = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const s = await getVerificationStatus();
      setStatus(s);
      setProfile({
        name: s.name || user.name || '',
        nationality: s.nationality || user.nationality || '',
        gender: s.gender || user.gender || '',
        date_of_birth: s.date_of_birth ? String(s.date_of_birth).slice(0, 10) : '',
      });
      setAvatarFile(null);
      setAvatarRemoved(false);
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (e) => setProfile((p) => ({ ...p, [key]: e.target.value }));

  // ---- File picking / validation -------------------------------------------
  // Picking a photo uploads it immediately — no separate "Save" click
  // needed, matching every other file picker on this page (identity
  // documents already auto-upload on selection).
  const pickAvatar = async (e) => {
    const picked = e.target.files?.[0] || null;
    if (e.target) e.target.value = '';
    setFileError('');
    if (!picked) return;
    const okType =
      /^image\/(jpeg|png|webp|svg\+xml|gif)$/i.test(picked.type) ||
      /\.(jpe?g|png|webp|svg|gif)$/i.test(picked.name || '');
    if (!okType) { setFileError(t('file_image_invalid_type')); return; }
    if (!picked.size) { setFileError(t('file_empty') || t('file_image_invalid_type')); return; }
    const compressed = await compressImage(picked, { maxDim: 512, quality: 0.85 });
    setAvatarFile(compressed);
    setAvatarRemoved(false);
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', compressed);
      const updated = await withAuthRetry(() =>
        pb.collection('users').update(user.id, fd, {
          requestKey: `profile-avatar-upload-${user.id}-${Date.now()}`,
        }),
      );
      safeSyncAuthRecord(updated);
      setAvatarFile(null);
      setSaved(t('profile_saved'));
      setTimeout(() => setSaved(''), 2500);
    } catch (err) {
      setFileError(err?.response?.message || err?.message || t('upload_error_generic') || t('something_wrong'));
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarFile(null);
    setAvatarRemoved(true);
    setFileError('');
    // Best-effort clear of the stored avatar on the server.
    try {
      const updated = await withAuthRetry(() =>
        pb.collection('users').update(user.id, { avatar: null }, {
          requestKey: `profile-avatar-remove-${user.id}-${Date.now()}`,
        }),
      );
      safeSyncAuthRecord(updated);
      setSaved(t('profile_photo_removed'));
      setTimeout(() => setSaved(''), 2500);
    } catch {
      /* ignore — staged removal still reflected in UI */
    }
  };

  // ---- Inline verification OTP ---------------------------------------------
  const startVerify = async (purpose) => {
    setOtpPurpose(purpose);
    setCode(['', '', '', '', '', '']);
    setOtpError('');
    setOtpOpen(true);
    setOtpBusy(true);
    try {
      if (purpose === 'email') await sendEmailCode();
      else await sendPhoneCode();
    } catch (err) {
      setOtpError(String(err?.message || t('something_wrong')));
    } finally {
      setOtpBusy(false);
    }
  };

  const resendOtp = async () => {
    setOtpBusy(true);
    setOtpError('');
    try {
      if (otpPurpose === 'email') await sendEmailCode();
      else await sendPhoneCode();
    } catch (err) {
      setOtpError(String(err?.message || t('something_wrong')));
    } finally {
      setOtpBusy(false);
    }
  };

  const confirmOtp = async () => {
    const entered = code.join('').trim();
    if (entered.length !== 6) { setOtpError(t('otp_enter_code')); return; }
    setOtpBusy(true);
    setOtpError('');
    try {
      if (otpPurpose === 'email') await verifyEmailCode(entered);
      else await verifyPhoneCode(entered);
      setOtpOpen(false);
      await pb.collection('users').authRefresh({ requestKey: `profile-ver-refresh-${Date.now()}` });
      await load();
    } catch (err) {
      setOtpError(String(err?.response?.message || err?.message || t('otp_invalid')));
    } finally {
      setOtpBusy(false);
    }
  };

  // ---- Derived state -------------------------------------------------------
  const accountState = String(status?.account_state || '').toLowerCase();
  const isApproved = accountState === 'approved';
  const isPending = accountState === 'pending_review';
  const isRejected = accountState === 'rejected';
  const hasReviewNote = !!status?.review_note;
  const isChangesRequested = accountState === 'incomplete' && hasReviewNote;
  const isIncompleteFresh = accountState === 'incomplete' && !hasReviewNote;

  const emailVerified = !!status?.email_verified;
  const phoneVerified = !!status?.phone_verified;
  // At least ONE identity document (Passport or Residence Permit, or legacy
  // single document) is required for verification. The second is optional.
  const hasIdentityDocument = !!status?.has_identity_document;

  // ---- First-run "complete your profile" mode --------------------------
  // Only date of birth, gender and one identity document are mandatory to
  // leave this screen and reach the rest of Estate Follow (see
  // OwnerDashboard.jsx's access gate, which uses the exact same three
  // conditions computed from the same underlying fields). Phone/email
  // verification and the full admin-review "submit" flow below remain
  // available but are NOT required to proceed — they are a separate,
  // optional/ongoing verification track.
  const hasMandatoryBasicData =
    !!profile.gender && !!profile.date_of_birth && hasIdentityDocument;
  const firstRun = accountState === 'incomplete' && !hasMandatoryBasicData;

  const allRequirementsMet =
    !!profile.name.trim() &&
    !!profile.nationality &&
    !!profile.gender &&
    !!profile.date_of_birth &&
    !!(status?.phone || user?.phone) &&
    phoneVerified &&
    !!(status?.email || user?.email) &&
    emailVerified &&
    hasIdentityDocument;

  // Can the owner submit (or resubmit) for review right now?
  const canSubmit =
    allRequirementsMet && !isApproved && !isPending;

  // ---- Save ----------------------------------------------------------------
  const save = async (e, { submit = false } = {}) => {
    if (e) e.preventDefault();
    setSaving(true);
    setError('');
    setSaved('');
    try {
      // Proactively refresh the auth token before the write so a stale /
      // expired token (the cause of "The request requires valid record
      // authorization token.") never reaches the update. If the refresh
      // itself fails the token is too old to renew — surface a clear
      // re-login message instead of letting the 401 leak through raw.
      const fresh = await ensureFreshToken();
      if (fresh === false && pb.authStore.isValid) {
        // Token present but could not be refreshed — it is expired. Tell the
        // user to sign in again rather than showing the raw 401.
        setError(t('session_expired_relogin') || t('something_wrong'));
        return;
      }

      // Identity documents are uploaded separately through the unified
      // uploader (IdentityDocumentsSection) with real progress — the main
      // save only carries lightweight text fields + optional avatar, so it
      // is fast and never blocks on a large file upload.
      const fd = new FormData();
      fd.append('name', profile.name);
      fd.append('nationality', profile.nationality || '');
      fd.append('gender', profile.gender || '');
      fd.append('date_of_birth', profile.date_of_birth || '');
      if (avatarFile) fd.append('avatar', avatarFile);
      // withAuthRetry refreshes the token once and retries if PocketBase
      // still returns 401 on the first attempt.
      const updated = await withAuthRetry(() =>
        pb.collection('users').update(user.id, fd, {
          requestKey: `profile-save-${user.id}-${Date.now()}`,
        }),
      );
      // Reflect the updated record into the auth store WITHOUT ever clearing
      // it — a save failure cannot log the user out.
      safeSyncAuthRecord(updated);

      if (submit) {
        await submitVerification();
        await pb.collection('users').authRefresh({ requestKey: `profile-submit-refresh-${Date.now()}` });
      }
      await load();
      setSaved(submit ? t('verify_submitted') : t('profile_saved'));
      setTimeout(() => setSaved(''), 3000);
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 401) {
        // Token could not be refreshed — session is no longer valid.
        setError(t('session_expired_relogin') || t('something_wrong'));
      } else {
        const data = err?.response?.data;
        if (data && typeof data === 'object') {
          setError(
            Object.entries(data)
              .map(([f, i]) => `${f}: ${i?.message || i?.code || ''}`)
              .join(' · '),
          );
        } else {
          setError(err?.message || t('something_wrong'));
        }
      }
    } finally {
      setSaving(false);
    }
  };

  // ---- First-run "Save & Complete" (task: profile completion rebuild) -----
  // Validates the mandatory fields, saves them, then calls the dedicated
  // completion route and redirects straight into the dashboard. Never clears
  // what the user typed on failure, and is safe to retry.
  const completeAndEnter = async () => {
    setCompleteError('');
    if (!profile.date_of_birth) {
      setCompleteError(t('profile_complete_missing_dob') || t('date_of_birth'));
      return;
    }
    if (!profile.gender) {
      setCompleteError(t('profile_complete_missing_gender') || t('gender'));
      return;
    }
    if (!hasIdentityDocument) {
      setCompleteError(t('profile_complete_missing_doc'));
      return;
    }
    setCompleting(true);
    try {
      const fresh = await ensureFreshToken();
      if (fresh === false && pb.authStore.isValid) {
        setCompleteError(t('session_expired_relogin') || t('something_wrong'));
        return;
      }
      const fd = new FormData();
      fd.append('name', profile.name);
      fd.append('nationality', profile.nationality || '');
      fd.append('gender', profile.gender || '');
      fd.append('date_of_birth', profile.date_of_birth || '');
      if (avatarFile) fd.append('avatar', avatarFile);
      const updated = await withAuthRetry(() =>
        pb.collection('users').update(user.id, fd, {
          requestKey: `profile-complete-save-${user.id}-${Date.now()}`,
        }),
      );
      safeSyncAuthRecord(updated);

      // Server-side re-validation + flips profile_complete / account_state.
      await completeBasicProfile();
      const refreshed = await pb.collection('users').authRefresh({
        requestKey: `profile-complete-refresh-${Date.now()}`,
      });
      safeSyncAuthRecord(refreshed?.record || null);

      navigate('/dashboard/home', { replace: true });
    } catch (err) {
      const st = err?.status || err?.response?.status;
      if (st === 401) {
        setCompleteError(t('session_expired_relogin') || t('something_wrong'));
      } else {
        const data = err?.response?.data;
        const serverMsg = err?.response?.message || err?.message;
        if (data && typeof data === 'object' && Object.keys(data).length) {
          setCompleteError(
            Object.entries(data)
              .map(([f, i]) => `${f}: ${i?.message || i?.code || ''}`)
              .join(' · '),
          );
        } else {
          setCompleteError(serverMsg || t('something_wrong'));
        }
      }
    } finally {
      setCompleting(false);
    }
  };

  // ---- Display helpers -----------------------------------------------------
  const avatarUrl = avatarFile
    ? URL.createObjectURL(avatarFile)
    : !avatarRemoved && user?.avatar
      ? pb.files.getURL(user, user.avatar)
      : '';

  const statusBadge = () => {
    let label = t('profile_status_incomplete');
    let cls = 'bg-muted text-muted-foreground border-border';
    if (isApproved) { label = t('profile_status_verified'); cls = 'bg-emerald-100 text-emerald-800 border-emerald-200'; }
    else if (isPending) { label = t('profile_status_pending'); cls = 'bg-amber-100 text-amber-800 border-amber-200'; }
    else if (isRejected) { label = t('profile_status_rejected'); cls = 'bg-red-100 text-red-800 border-red-200'; }
    else if (isChangesRequested) { label = t('profile_status_changes'); cls = 'bg-orange-100 text-orange-800 border-orange-200'; }
    else { label = t('profile_status_incomplete'); cls = 'bg-muted text-muted-foreground border-border'; }
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold', cls)}>
        {isApproved && <BadgeCheck size={14} />}
        {label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 size={20} className="animate-spin me-2" />
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">{t('owner_profile_title')}</h2>
        <p className="text-sm text-muted-foreground">{t('profile_unified_subtitle')}</p>
      </div>

      {/* ---- First-run banner: shown only until mandatory data + one
             identity document are supplied. Disappears permanently once the
             owner saves — the owner is never sent back here afterwards. ---- */}
      {firstRun && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles size={18} />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-bold text-primary">{t('profile_complete_banner_title')}</p>
            <p className="text-xs text-muted-foreground">{t('profile_complete_banner_body')}</p>
          </div>
        </div>
      )}

      {/* ---- Identity documents — moved to the very top of the page so it's
             the first thing the owner sees (previously buried at the bottom,
             inside the personal-info form). It never depended on that form
             for submission (it uploads on its own), so lifting it out is
             purely a layout change. ---- */}
      <IdentityDocumentsSection status={status} onChanged={load} />

      {/* ---- 1) Header: photo + name + status ---- */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={profile.name}
                className="h-20 w-20 rounded-full object-cover border-2 border-primary/40"
              />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold border-2 border-primary/40">
                {(profile.name || user?.email || '?').slice(0, 1).toUpperCase()}
              </span>
            )}
            {avatarUploading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                <Loader2 size={20} className="animate-spin text-white" />
              </span>
            )}
          </div>
          <div className="min-w-[180px] flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('profile_photo')} · {t('profile_photo_optional')}</Label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif" className="hidden" onChange={pickAvatar} />
              {!avatarUrl && !avatarFile && (
                <Button type="button" variant="default" size="sm" onClick={() => avatarRef.current?.click()} disabled={avatarUploading} className="min-h-[40px]">
                  <Upload size={14} className="me-1.5" />{t('profile_photo_upload')}
                </Button>
              )}
              {(avatarUrl || avatarFile) && (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => avatarRef.current?.click()} disabled={avatarUploading} className="min-h-[40px]">
                    <Camera size={14} className="me-1.5" />{t('profile_photo_change')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={removeAvatar} disabled={avatarUploading} className="min-h-[40px] text-destructive hover:bg-destructive/10">
                    <Trash2 size={14} className="me-1.5" />{t('profile_photo_remove')}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Name (single editable field) + status */}
        <div className="space-y-2">
          <Label>{t('name')} *</Label>
          <Input value={profile.name} onChange={set('name')} className="min-h-[44px]" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('profile_status_label')}:</span>
          {statusBadge()}
          {isApproved && <VerifiedBadge size={18} showLabel />}
        </div>
      </div>

      {/* ---- 2) Personal information ---- */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (firstRun) {
            completeAndEnter();
            return;
          }
          save(e, { submit: canSubmit && (isIncompleteFresh || isChangesRequested || isRejected) });
        }}
        className="space-y-5 rounded-xl border bg-card p-5 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <UserRound size={16} />
          </span>
          <div>
            <p className="text-sm font-bold">{t('profile_data_section')}</p>
            <p className="text-xs text-muted-foreground">{t('profile_data_hint')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NationalityField
            value={profile.nationality}
            onChange={(v) => setProfile((p) => ({ ...p, nationality: v }))}
            label={t('nationality')}
            required
            heightClass="min-h-[44px]"
          />
          <GenderField
            value={profile.gender}
            onChange={(v) => setProfile((p) => ({ ...p, gender: v }))}
            label={t('gender')}
            required
            heightClass="min-h-[44px]"
          />
          <DateField
            label={`${t('date_of_birth')} *`}
            value={profile.date_of_birth || ''}
            onChange={(v) => setProfile((p) => ({ ...p, date_of_birth: v }))}
            heightClass="min-h-[44px]"
          />
        </div>

        {/* Phone — single field + verify status + verify/change buttons */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>{t('phone')} *</Label>
            {phoneVerified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 size={14} /> {t('email_verified_yes')}
              </span>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => startVerify('phone')} className="min-h-[40px]">
                <ShieldCheck size={14} className="me-1.5" />{t('verify_phone_btn')}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex min-h-[44px] flex-1 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
              <Phone size={15} className="shrink-0 text-muted-foreground" />
              <span className="truncate" dir="ltr">{status?.phone || user?.phone || '—'}</span>
            </div>
            <Button type="button" variant="outline" className="min-h-[44px] shrink-0" onClick={() => setPhoneModal(true)}>
              {t('change_phone_btn')}
            </Button>
          </div>
          {!phoneVerified && (
            <p className="text-xs text-muted-foreground">{t('verify_phone_hint')}</p>
          )}
        </div>

        {/* Email — single field + verify status + verify/change buttons */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>{t('email')} *</Label>
            {emailVerified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 size={14} /> {t('email_verified_yes')}
              </span>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => startVerify('email')} className="min-h-[40px]">
                <ShieldCheck size={14} className="me-1.5" />{t('verify_email_btn')}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex min-h-[44px] flex-1 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
              <Mail size={15} className="shrink-0 text-muted-foreground" />
              <span className="truncate" dir="ltr">{status?.email || user?.email || ''}</span>
            </div>
            <Button type="button" variant="outline" className="min-h-[44px] shrink-0" onClick={() => setEmailModal(true)}>
              {t('change_email_btn')}
            </Button>
          </div>
        </div>

        {fileError && <p className="text-sm text-destructive">{fileError}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && (
          <p className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
            <Check size={14} /> {saved}
          </p>
        )}

        {/* ---- 4) Save / submit bar ---- */}
        {firstRun ? (
          <div className="space-y-2">
            {completeError && <p className="text-sm text-destructive">{completeError}</p>}
            <Button
              type="button"
              disabled={completing}
              onClick={completeAndEnter}
              className="w-full min-h-[48px]"
            >
              {completing
                ? <><Loader2 size={18} className="animate-spin me-1.5" />{t('loading')}</>
                : <><Send size={16} className="me-1.5" />{t('profile_save_complete_btn')}</>}
            </Button>
            {!hasMandatoryBasicData && (
              <p className="text-xs text-muted-foreground text-center">{t('profile_complete_requirements_hint')}</p>
            )}
          </div>
        ) : (
          <SaveBar
            isApproved={isApproved}
            isPending={isPending}
            isRejected={isRejected}
            isChangesRequested={isChangesRequested}
            isIncompleteFresh={isIncompleteFresh}
            allRequirementsMet={allRequirementsMet}
            canSubmit={canSubmit}
            saving={saving}
            reviewNote={status?.review_note}
            onSave={(submit) => save(null, { submit })}
          />
        )}
      </form>

      {/* ---- Inline verification OTP modal ---- */}
      <Dialog open={otpOpen} onOpenChange={(o) => setOtpOpen(o)}>
        <DialogContent className="sm:max-w-md" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              {otpPurpose === 'email' ? <Mail size={22} /> : <Phone size={22} />}
            </div>
            <DialogTitle className="text-center text-xl">
              {otpPurpose === 'email' ? t('verify_email_title') : t('verify_phone_title')}
            </DialogTitle>
            <DialogDescription className="text-center">
              {otpPurpose === 'email'
                ? (lang === 'ar' ? 'أرسلنا رمزاً من 6 أرقام إلى بريدك.' : 'We sent a 6-digit code to your email.')
                : (lang === 'ar' ? 'أرسلنا رمزاً من 6 أرقام إلى بريدك المسجّل.' : 'We sent a 6-digit code to your registered email.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <OtpInput value={code} onChange={setCode} />
            {otpError && <p className="text-center text-sm text-destructive">{otpError}</p>}
            <Button onClick={confirmOtp} disabled={otpBusy || code.join('').length !== 6} className="w-full min-h-[48px]">
              {otpBusy ? <><Loader2 size={18} className="animate-spin me-1.5" />{t('loading')}</> : t('verify')}
            </Button>
            <button type="button" onClick={resendOtp} disabled={otpBusy} className="mx-auto flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-50">
              <RotateCw size={14} />{t('otp_resend')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Change email / phone modals (OTP-protected value change) ---- */}
      <ChangeEmailModal
        open={emailModal}
        onOpenChange={setEmailModal}
        currentEmail={status?.email || user?.email || ''}
        onDone={() => {
          pb.collection('users').authRefresh({ requestKey: `profile-email-refresh-${Date.now()}` }).catch(() => {});
          setEmailModal(false);
          load();
        }}
      />

      <ChangePhoneModal
        open={phoneModal}
        onOpenChange={setPhoneModal}
        onDone={() => {
          pb.collection('users').authRefresh({ requestKey: `profile-phone-refresh-${Date.now()}` }).catch(() => {});
          setPhoneModal(false);
          load();
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Save / submit bar — one button whose label follows the account state.
// ---------------------------------------------------------------------------
const SaveBar = ({
  isApproved,
  isPending,
  isRejected,
  isChangesRequested,
  isIncompleteFresh,
  allRequirementsMet,
  canSubmit,
  saving,
  reviewNote,
  onSave,
}) => {
  const { t } = useLanguage();

  if (isPending) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
        <ShieldCheck size={20} className="text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-amber-800">{t('profile_pending_msg')}</p>
      </div>
    );
  }

  const showReason = (isChangesRequested || isRejected) && reviewNote;
  const reasonTitle = isRejected ? t('profile_rejection_reason') : t('profile_changes_reason');

  // Approved → save only. Incomplete + not ready → save only.
  // Incomplete + ready, changes requested, rejected → save + (re)submit.
  const submit = canSubmit && (isIncompleteFresh || isChangesRequested || isRejected);
  const label = isApproved
    ? t('profile_save_btn')
    : submit
      ? (isChangesRequested || isRejected ? t('profile_save_resubmit_btn') : t('profile_save_submit_btn'))
      : t('profile_save_btn');

  return (
    <div className="space-y-3">
      {showReason && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-1">
          <p className="text-xs font-bold text-orange-800">{reasonTitle}</p>
          <p className="text-xs text-orange-700 whitespace-pre-wrap">{reviewNote}</p>
        </div>
      )}
      {isApproved && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2">
          <BadgeCheck size={18} className="text-emerald-600 shrink-0" />
          <p className="text-xs font-semibold text-emerald-800">{t('verify_approved_banner')}</p>
        </div>
      )}
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={saving} onClick={() => onSave(submit)} className="min-h-[48px] sm:min-w-[220px]">
          {saving ? <><Loader2 size={18} className="animate-spin me-1.5" />{t('loading')}</> : <><Send size={16} className="me-1.5" />{label}</>}
        </Button>
      </div>
      {!allRequirementsMet && !isApproved && !isPending && (
        <p className="text-xs text-muted-foreground text-center">{t('profile_requirements_hint')}</p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 6-box OTP input (auto-advance, backspace, paste).
// ---------------------------------------------------------------------------
const OtpInput = ({ value, onChange, disabled }) => {
  const refs = useRef([]);

  const updateAt = (i, v) => {
    const digit = v.replace(/\D/g, '').slice(-1);
    const next = [...value];
    next[i] = digit;
    onChange(next);
    if (digit && i < 5) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  const onPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    if (!pasted.length) return;
    const next = ['', '', '', '', '', ''];
    pasted.forEach((d, idx) => (next[idx] = d));
    onChange(next);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div className="flex items-center justify-center gap-2" dir="ltr">
      {value.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={(e) => updateAt(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          className="h-14 w-12 rounded-lg border border-input bg-card text-center text-2xl font-bold shadow-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Change email — dual OTP (current email, then new email).
// ---------------------------------------------------------------------------
const ChangeEmailModal = ({ open, onOpenChange, currentEmail, onDone }) => {
  const { t } = useLanguage();
  const [step, setStep] = useState(0); // 0 = enter new email, 1 = verify old, 2 = verify new
  const [newEmail, setNewEmail] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setStep(0);
    setNewEmail('');
    setChallengeId('');
    setCode(['', '', '', '', '', '']);
    setInfo('');
    setError('');
    setBusy(false);
    setDone(false);
  };

  const close = (o) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const startFlow = async () => {
    setError('');
    setInfo('');
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setError(t('new_email') + ' —');
      return;
    }
    setBusy(true);
    try {
      const res = await requestEmailChange(newEmail.trim());
      setChallengeId(res.challengeId);
      setCode(['', '', '', '', '', '']);
      setInfo(`${t('code_sent_to')} ${res.currentEmailMasked}`);
      setStep(1);
    } catch (err) {
      setError(err?.message || t('something_wrong'));
    } finally {
      setBusy(false);
    }
  };

  const verifyOld = async () => {
    setError('');
    setInfo('');
    const entered = code.join('').trim();
    if (entered.length !== 6) {
      setError(t('otp_enter_code'));
      return;
    }
    setBusy(true);
    try {
      const res = await verifyOldEmailCode({ challengeId, code1: entered });
      setCode(['', '', '', '', '', '']);
      setInfo(`${t('code_sent_to')} ${res.newEmailMasked}`);
      setStep(2);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('expired') || msg.includes('start again')) {
        setError(t('profile_code_expired'));
      } else {
        setError(err?.message || t('something_wrong'));
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmNew = async () => {
    setError('');
    setInfo('');
    const entered = code.join('').trim();
    if (entered.length !== 6) {
      setError(t('otp_enter_code'));
      return;
    }
    setBusy(true);
    try {
      await confirmEmailChange({ challengeId, code2: entered });
      setDone(true);
      setInfo(t('email_change_success'));
      setTimeout(() => {
        onDone();
        reset();
      }, 1200);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('expired') || msg.includes('start again')) {
        setError(t('profile_code_expired'));
      } else {
        setError(err?.message || t('something_wrong'));
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (step === 1) {
        const res = await requestEmailChange(newEmail.trim());
        setChallengeId(res.challengeId);
        setCode(['', '', '', '', '', '']);
        setInfo(`${t('code_sent_to')} ${res.currentEmailMasked}`);
      } else if (step === 2) {
        const res = await requestEmailChange(newEmail.trim());
        setChallengeId(res.challengeId);
        setStep(1);
        setCode(['', '', '', '', '', '']);
        setInfo(`${t('code_sent_to')} ${res.currentEmailMasked}`);
      }
    } catch (err) {
      setError(err?.message || t('something_wrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md" dir={document.documentElement.dir}>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Mail size={22} strokeWidth={1.8} />
          </div>
          <DialogTitle className="text-center text-xl">{t('change_own_email_title')}</DialogTitle>
          <DialogDescription className="text-center">
            {t('profile_no_logout_note')}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Check size={28} className="text-emerald-600" />
            <p className="text-sm font-medium text-muted-foreground">{info}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {step === 0 && (
              <>
                <div className="space-y-2">
                  <Label>{t('new_email')}</Label>
                  <Input
                    type="email"
                    dir="ltr"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="min-h-[48px]"
                    placeholder={currentEmail}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="button"
                  className="w-full min-h-[48px]"
                  disabled={busy}
                  onClick={startFlow}
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : t('send_code')}
                </Button>
              </>
            )}

            {step === 1 && (
              <>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-semibold">{t('change_email_step1')}</p>
                  <p className="text-xs text-muted-foreground">{t('change_email_step1_hint')}</p>
                </div>
                <OtpInput value={code} onChange={setCode} />
                {info && <p className="text-center text-xs text-muted-foreground">{info}</p>}
                {error && <p className="text-center text-sm text-destructive">{error}</p>}
                <Button
                  type="button"
                  className="w-full min-h-[48px]"
                  disabled={busy || code.join('').length !== 6}
                  onClick={verifyOld}
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : t('next_step')}
                </Button>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => { reset(); }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ArrowRight size={14} className={document.documentElement.dir === 'rtl' ? '' : 'rotate-180'} />
                    {t('start_over')}
                  </button>
                  <button
                    type="button"
                    onClick={resend}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {t('resend_code')}
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-semibold">{t('change_email_step2')}</p>
                  <p className="text-xs text-muted-foreground">{t('change_email_step2_hint')}</p>
                </div>
                <OtpInput value={code} onChange={setCode} />
                {info && <p className="text-center text-xs text-muted-foreground">{info}</p>}
                {error && <p className="text-center text-sm text-destructive">{error}</p>}
                <Button
                  type="button"
                  className="w-full min-h-[48px]"
                  disabled={busy || code.join('').length !== 6}
                  onClick={confirmNew}
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : t('verify_and_update')}
                </Button>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => { reset(); }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ArrowRight size={14} className={document.documentElement.dir === 'rtl' ? '' : 'rotate-180'} />
                    {t('start_over')}
                  </button>
                  <button
                    type="button"
                    onClick={resend}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {t('resend_code')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Change phone — single OTP to the owner's registered email.
// ---------------------------------------------------------------------------
const ChangePhoneModal = ({ open, onOpenChange, onDone }) => {
  const { t } = useLanguage();
  const [step, setStep] = useState(0); // 0 = enter new phone, 1 = verify code
  const [newPhone, setNewPhone] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setStep(0);
    setNewPhone('');
    setChallengeId('');
    setCode(['', '', '', '', '', '']);
    setInfo('');
    setError('');
    setBusy(false);
    setDone(false);
  };

  const close = (o) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const startFlow = async () => {
    setError('');
    setInfo('');
    if (!newPhone.trim()) {
      setError(t('new_phone') + ' —');
      return;
    }
    setBusy(true);
    try {
      const res = await requestPhoneChange(newPhone.trim());
      setChallengeId(res.challengeId);
      setCode(['', '', '', '', '', '']);
      setInfo(`${t('code_sent_to')} ${res.emailMasked}`);
      setStep(1);
    } catch (err) {
      setError(err?.message || t('something_wrong'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setError('');
    setInfo('');
    const entered = code.join('').trim();
    if (entered.length !== 6) {
      setError(t('otp_enter_code'));
      return;
    }
    setBusy(true);
    try {
      await confirmPhoneChange({ challengeId, code1: entered });
      setDone(true);
      setInfo(t('phone_change_success'));
      setTimeout(() => {
        onDone();
        reset();
      }, 1200);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (msg.includes('expired') || msg.includes('start again')) {
        setError(t('profile_code_expired'));
      } else {
        setError(err?.message || t('something_wrong'));
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      const res = await requestPhoneChange(newPhone.trim());
      setChallengeId(res.challengeId);
      setCode(['', '', '', '', '', '']);
      setInfo(`${t('code_sent_to')} ${res.emailMasked}`);
    } catch (err) {
      setError(err?.message || t('something_wrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md" dir={document.documentElement.dir}>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Phone size={22} strokeWidth={1.8} />
          </div>
          <DialogTitle className="text-center text-xl">{t('phone_change_title')}</DialogTitle>
          <DialogDescription className="text-center">
            {t('profile_no_logout_note')}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Check size={28} className="text-emerald-600" />
            <p className="text-sm font-medium text-muted-foreground">{info}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {step === 0 && (
              <>
                <div className="space-y-2">
                  <Label>{t('new_phone')}</Label>
                  <PhoneField
                    value={newPhone}
                    onChange={(v) => setNewPhone(v)}
                    heightClass="min-h-[48px]"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button
                  type="button"
                  className="w-full min-h-[48px]"
                  disabled={busy}
                  onClick={startFlow}
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : t('send_code')}
                </Button>
              </>
            )}

            {step === 1 && (
              <>
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-semibold">{t('phone_change_title')}</p>
                  <p className="text-xs text-muted-foreground">{t('phone_change_hint')}</p>
                </div>
                <OtpInput value={code} onChange={setCode} />
                {info && <p className="text-center text-xs text-muted-foreground">{info}</p>}
                {error && <p className="text-center text-sm text-destructive">{error}</p>}
                <Button
                  type="button"
                  className="w-full min-h-[48px]"
                  disabled={busy || code.join('').length !== 6}
                  onClick={confirm}
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : t('verify_and_update')}
                </Button>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => { reset(); }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ArrowRight size={14} className={document.documentElement.dir === 'rtl' ? '' : 'rotate-180'} />
                    {t('start_over')}
                  </button>
                  <button
                    type="button"
                    onClick={resend}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {t('resend_code')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OwnerProfileEditor;
