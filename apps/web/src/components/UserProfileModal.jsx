import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  Check,
  FileText,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Monitor,
  Pencil,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  Upload,
  UserCog,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
import { StatusBadge, DocButton } from '@/components/shared';
import PhoneField from '@/components/PhoneField';
import NationalityField from '@/components/NationalityField';
import GenderField from '@/components/GenderField';
import DateField from '@/components/DateField';
import MultiChipSelect from '@/components/MultiChipSelect';
import LanguageMultiSelect from '@/components/LanguageMultiSelect';
import MarketsMultiSelect from '@/components/MarketsMultiSelect';
import WorkingCitiesField from '@/components/WorkingCitiesField';
import CitySearchField from '@/components/CitySearchField';
import { FileViewButton } from '@/components/FileViewButton';
import BrokerageBranches from '@/components/BrokerageBranches';
import BrokeragePermits from '@/components/BrokeragePermits';
import PropertyReviewModal from '@/components/PropertyReviewModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { formatDate, propertyLabel } from '@/lib/api';
import { countryName } from '@/lib/countries';
import {
  BROKER_SPECIALIZATIONS,
  COMMON_LANGUAGES,
  parseList,
  specLabel,
  langLabel,
} from '@/lib/brokerageConstants';
import { isSuperAdmin as checkSuperAdmin, STAFF_ROLES } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const TYPE_ICON = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };
const emptyBrokerForm = () => ({
  name: '',
  nationality: '',
  gender: '',
  date_of_birth: '',
  email: '',
  phone: '',
  whatsapp: '',
  country: '',
  cities: [],
  languages: [],
  specialization: [],
  freelance: true,
  company_name: '',
  job_title: '',
  markets: [],
  licensed: false,
  license_number: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  social_links: [],
});

const emptyCompanyForm = () => ({
  name: '',
  name_ar: '',
  country: '',
  city: '',
  city_ar: '',
  owner_country: '',
  cities: [],
  email: '',
  phone: '',
  whatsapp: '',
  website: '',
  license_number: '',
  languages: [],
  specialization: [],
  description: '',
  description_ar: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  social_links: [],
});

const UserProfileModal = ({
  user,
  properties,
  payments,
  onClose,
  onToggleSuspend,
  onSetAccountState,
  onRefresh,
  onReviewProperty,
  onEditProperty,
  onReviewDone,
}) => {
  const { t, lang } = useLanguage();
  const { user: currentUser } = useAuth();
  const canEdit = checkSuperAdmin(currentUser);

  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [role, setRole] = useState('owner');
  const [staffLabel, setStaffLabel] = useState('');
  const [roleOpen, setRoleOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  // Inline note UI for reject / request-changes (no window.prompt)
  const [statusMode, setStatusMode] = useState(null); // 'rejected' | 'changes_requested' | null
  const [statusNote, setStatusNote] = useState('');
  const [statusKind, setStatusKind] = useState(null); // 'broker' | 'company'

  // Personal data editor (Super Admin)
  const [personal, setPersonal] = useState({
    name: '',
    email: '',
    phone: '',
    nationality: '',
    gender: '',
    date_of_birth: '',
    access_plan: 'free',
    subscription_status: 'none',
    account_state: 'active',
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [passportFile, setPassportFile] = useState(null);
  const [residenceFile, setResidenceFile] = useState(null);
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Broker / company profile
  const [accountKind, setAccountKind] = useState('owner');
  const [brokerRecord, setBrokerRecord] = useState(null);
  const [companyRecord, setCompanyRecord] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [brokerForm, setBrokerForm] = useState(emptyBrokerForm());
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm());
  const [brokerPhoto, setBrokerPhoto] = useState(null);
  const [brokerPassport, setBrokerPassport] = useState(null);
  const [brokerLicense, setBrokerLicense] = useState(null);
  const [companyLogo, setCompanyLogo] = useState(null);
  const [companyLicense, setCompanyLicense] = useState(null);
  const [companyPassport, setCompanyPassport] = useState(null);
  const [savingBroker, setSavingBroker] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);

  // Property review (opened from within this modal)
  const [reviewTarget, setReviewTarget] = useState(null);

  const userProps = (properties || []).filter((p) => p.owner === user?.id);

  const flash = (msg) => {
    setNotice(msg);
    setError('');
    setTimeout(() => setNotice(''), 4000);
  };

  const resolveKind = (u) => {
    if (!u) return 'owner';
    if (u.is_super_admin) return 'super_admin';
    if (STAFF_ROLES.includes(u.role)) return 'staff';
    const at = String(u.account_type || '').toLowerCase();
    if (at === 'broker') return 'broker';
    if (at === 'company') return 'company';
    return 'owner';
  };

  useEffect(() => {
    if (!user) return;
    setNotice('');
    setError('');
    setAvatarFile(null);
    setPassportFile(null);
    setResidenceFile(null);
    setBrokerPhoto(null);
    setBrokerPassport(null);
    setBrokerLicense(null);
    setCompanyLogo(null);
    setCompanyLicense(null);
    setCompanyPassport(null);
    setReviewTarget(null);
    setRole(user.role || 'owner');
    setStaffLabel(user.staff_label || '');
    setNewEmail(user.email || '');
    setPersonal({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      nationality: user.nationality || '',
      gender: user.gender || '',
      date_of_birth: user.date_of_birth ? String(user.date_of_birth).slice(0, 10) : '',
      access_plan: user.access_plan || 'free',
      subscription_status: user.subscription_status || 'none',
      account_state: user.account_state || (user.suspended ? 'suspended' : 'active'),
    });

    const kind = resolveKind(user);
    setAccountKind(kind);

    setLoadingSessions(true);
    pb.collection('user_sessions')
      .getFullList({ filter: `user = "${user.id}"`, sort: '-last_active' })
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));

    // Load broker / company profile owned by this user (Super Admin only).
    if (!canEdit) return;
    if (kind !== 'broker' && kind !== 'company') return;
    setProfileLoading(true);
    (async () => {
      try {
        if (kind === 'broker') {
          const rows = await pb.collection('brokers').getFullList({
            filter: `owner = "${user.id}"`,
            sort: '-created',
            requestKey: `adm-broker-${user.id}`,
          });
          const r = rows[0] || null;
          setBrokerRecord(r);
          if (r) {
            setBrokerForm({
              name: r.name || '',
              nationality: r.nationality || '',
              gender: r.gender || '',
              date_of_birth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : '',
              email: r.email || '',
              phone: r.phone || '',
              whatsapp: r.whatsapp || '',
              country: r.country || '',
              cities: parseList(r.cities),
              languages: parseList(r.languages).map((x) => {
                const f = COMMON_LANGUAGES.find((l) => l.id === x || l.en === x || l.ar === x);
                return f ? f.id : x;
              }),
              specialization: parseList(r.specialization).map((x) => {
                const f = BROKER_SPECIALIZATIONS.find((s) => s.id === x || s.en === x || s.ar === x);
                return f ? f.id : x;
              }),
              freelance: !(r.freelance === false || r.freelance === 0 || r.freelance === 'false'),
              company_name: r.company_name || '',
              job_title: r.job_title || '',
              markets: parseList(r.markets),
              licensed: !!r.licensed,
              license_number: r.license_number || '',
              instagram: r.instagram || '',
              facebook: r.facebook || '',
              tiktok: r.tiktok || '',
              social_links: Array.isArray(r.social_links) ? r.social_links : [],
            });
          }
        } else if (kind === 'company') {
          const rows = await pb.collection('brokerage_companies').getFullList({
            filter: `owner = "${user.id}"`,
            sort: '-created',
            requestKey: `adm-company-${user.id}`,
          });
          const r = rows[0] || null;
          setCompanyRecord(r);
          if (r) {
            setCompanyForm({
              name: r.name || '',
              name_ar: r.name_ar || '',
              country: r.country || '',
              city: r.city || '',
              city_ar: r.city_ar || '',
              owner_country: r.owner_country || '',
              cities: parseList(r.cities),
              email: r.email || '',
              phone: r.phone || '',
              whatsapp: r.whatsapp || '',
              website: r.website || '',
              license_number: r.license_number || '',
              languages: parseList(r.languages).map((x) => {
                const f = COMMON_LANGUAGES.find((l) => l.id === x || l.en === x || l.ar === x);
                return f ? f.id : x;
              }),
              specialization: parseList(r.specialization).map((x) => {
                const f = BROKER_SPECIALIZATIONS.find((s) => s.id === x || s.en === x || s.ar === x);
                return f ? f.id : x;
              }),
              description: r.description || '',
              description_ar: r.description_ar || '',
              instagram: r.instagram || '',
              facebook: r.facebook || '',
              tiktok: r.tiktok || '',
              social_links: Array.isArray(r.social_links) ? r.social_links : [],
            });
          }
        }
      } catch {
        /* ignore */
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [user, canEdit]);

  if (!user) return null;

  const isSuperAdminTarget = !!user.is_super_admin;
  const accountState = personal.account_state;

  // ---- file helpers ----
  const pickPdf = (setter) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) {
      setError(t('file_invalid_type') || 'Invalid file');
      return;
    }
    if (!file.size) {
      setError(t('file_empty') || t('file_invalid_type') || 'Empty file');
      return;
    }
    setError('');
    setter(file);
  };

  const pickImg = (setter, acceptSvg) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const re = acceptSvg ? /^image\/(jpeg|png|webp|svg\+xml)$/ : /^image\/(jpeg|png|webp)$/;
    if (!re.test(file.type)) {
      setError(lang === 'ar' ? 'صورة غير صحيحة.' : 'Invalid image.');
      return;
    }
    if (!file.size) {
      setError(t('file_empty') || t('file_image_too_large') || 'Empty file');
      return;
    }
    setError('');
    setter(file);
  };

  const deleteFile = async (collection, recordId, field, doneMsg) => {
    if (!window.confirm(t('confirm_delete_file'))) return;
    setBusy(`del-${field}`);
    try {
      await pb.collection(collection).update(recordId, { [field]: '' });
      flash(doneMsg || t('file_deleted'));
      onRefresh?.();
      // refresh local record snapshot
      if (collection === 'users') {
        // user object comes from parent; trigger refresh
      } else if (collection === 'brokers' && brokerRecord) {
        const r = await pb.collection('brokers').getOne(brokerRecord.id, { requestKey: `adm-br-reload-${brokerRecord.id}` });
        setBrokerRecord(r);
      } else if (collection === 'brokerage_companies' && companyRecord) {
        const r = await pb.collection('brokerage_companies').getOne(companyRecord.id, { requestKey: `adm-co-reload-${companyRecord.id}` });
        setCompanyRecord(r);
      }
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setBusy('');
    }
  };

  // ---- existing admin actions ----
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

  const submitRole = async (e) => {
    e.preventDefault();
    setBusy('role');
    try {
      await pb.collection('users').update(user.id, {
        role,
        staff_label: role === 'custom' ? staffLabel : '',
      });
      flash(t('role_changed'));
      setRoleOpen(false);
      onRefresh?.();
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
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

  const deleteUser = async () => {
    if (isSuperAdminTarget) {
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

  const logoutSession = async (s) => {
    setBusy(`out-${s.id}`);
    try {
      await pb.collection('user_sessions').update(s.id, { active: false });
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: false } : x)));
    } catch {
      setError(t('something_wrong'));
    } finally {
      setBusy('');
    }
  };

  const removeSession = async (s) => {
    if (!window.confirm(t('confirm_remove_device'))) return;
    setBusy(`rm-${s.id}`);
    try {
      await pb.collection('user_sessions').delete(s.id);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
    } catch {
      setError(t('something_wrong'));
    } finally {
      setBusy('');
    }
  };

  // ---- personal data save (Super Admin) ----
  const savePersonal = async (e) => {
    e.preventDefault();
    setSavingPersonal(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', personal.name);
      fd.append('email', personal.email.trim());
      fd.append('phone', personal.phone);
      fd.append('nationality', personal.nationality);
      fd.append('gender', personal.gender);
      fd.append('date_of_birth', personal.date_of_birth);
      fd.append('access_plan', personal.access_plan);
      fd.append('subscription_status', personal.subscription_status);
      fd.append('account_state', personal.account_state);
      fd.append('suspended', personal.account_state === 'suspended' || personal.account_state === 'inactive' ? 'true' : 'false');
      if (avatarFile) fd.append('avatar', avatarFile);
      if (passportFile) fd.append('passport_pdf', passportFile);
      if (residenceFile) fd.append('residence_pdf', residenceFile);
      await pb.collection('users').update(user.id, fd, { requestKey: `adm-personal-${user.id}` });
      flash(t('personal_data_saved'));
      setAvatarFile(null);
      setPassportFile(null);
      setResidenceFile(null);
      onRefresh?.();
    } catch (err) {
      setError(String(err?.response?.message || err?.message || t('something_wrong')));
    } finally {
      setSavingPersonal(false);
    }
  };

  // ---- broker profile save (Super Admin — direct, no pending flow) ----
  const saveBroker = async (e) => {
    e.preventDefault();
    if (!brokerRecord) return;
    setSavingBroker(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', brokerForm.name);
      fd.append('nationality', brokerForm.nationality);
      fd.append('gender', brokerForm.gender);
      fd.append('date_of_birth', brokerForm.date_of_birth);
      fd.append('email', brokerForm.email.trim());
      fd.append('phone', brokerForm.phone);
      fd.append('whatsapp', brokerForm.whatsapp);
      fd.append('country', brokerForm.country);
      fd.append('cities', JSON.stringify(brokerForm.cities));
      fd.append('city', brokerForm.cities[0] || '');
      fd.append('languages', brokerForm.languages.map((id) => langLabel(id, 'en')).join(', '));
      fd.append('specialization', brokerForm.specialization.map((id) => specLabel(id, 'en')).join(', '));
      fd.append('specialization_ar', brokerForm.specialization.map((id) => specLabel(id, 'ar')).join('، '));
      fd.append('freelance', brokerForm.freelance ? 'true' : 'false');
      fd.append('company_name', brokerForm.freelance ? '' : brokerForm.company_name.trim());
      fd.append('job_title', brokerForm.job_title.trim());
      fd.append('markets', JSON.stringify(brokerForm.markets || []));
      fd.append('licensed', brokerForm.licensed ? 'true' : 'false');
      fd.append('license_number', brokerForm.licensed ? brokerForm.license_number.trim() : '');
      fd.append('instagram', brokerForm.instagram.trim());
      fd.append('facebook', brokerForm.facebook.trim());
      fd.append('tiktok', brokerForm.tiktok.trim());
      fd.append('social_links', JSON.stringify((brokerForm.social_links || []).filter((s) => s.platform || s.url)));
      if (brokerPhoto) fd.append('photo', brokerPhoto);
      if (brokerPassport) fd.append('passport_pdf', brokerPassport);
      if (brokerLicense) fd.append('license_pdf', brokerLicense);
      const saved = await pb.collection('brokers').update(brokerRecord.id, fd, { requestKey: `adm-broker-save-${brokerRecord.id}` });
      setBrokerRecord(saved);
      setBrokerPhoto(null);
      setBrokerPassport(null);
      setBrokerLicense(null);
      flash(t('broker_profile_saved'));
      onRefresh?.();
    } catch (err) {
      setError(String(err?.response?.message || err?.message || t('something_wrong')));
    } finally {
      setSavingBroker(false);
    }
  };

  // ---- company profile save (Super Admin — direct) ----
  const saveCompany = async (e) => {
    e.preventDefault();
    if (!companyRecord) return;
    setSavingCompany(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', companyForm.name.trim());
      fd.append('name_ar', companyForm.name_ar.trim());
      fd.append('country', companyForm.country);
      fd.append('city', String(companyForm.city || '').trim());
      fd.append('city_ar', String(companyForm.city_ar || '').trim());
      fd.append('owner_country', companyForm.owner_country || '');
      fd.append('cities', JSON.stringify(companyForm.cities));
      fd.append('email', companyForm.email.trim());
      fd.append('phone', companyForm.phone);
      fd.append('whatsapp', companyForm.whatsapp);
      fd.append('website', companyForm.website.trim());
      fd.append('license_number', companyForm.license_number.trim());
      fd.append('languages', companyForm.languages.map((id) => langLabel(id, 'en')).join(', '));
      fd.append('specialization', companyForm.specialization.map((id) => specLabel(id, 'en')).join(', '));
      fd.append('specialization_ar', companyForm.specialization.map((id) => specLabel(id, 'ar')).join('، '));
      fd.append('description', companyForm.description.trim());
      fd.append('description_ar', companyForm.description_ar.trim());
      fd.append('instagram', companyForm.instagram.trim());
      fd.append('facebook', companyForm.facebook.trim());
      fd.append('tiktok', companyForm.tiktok.trim());
      fd.append('social_links', JSON.stringify((companyForm.social_links || []).filter((s) => s.platform || s.url)));
      if (companyLogo) fd.append('logo', companyLogo);
      if (companyLicense) fd.append('license_pdf', companyLicense);
      if (companyPassport) fd.append('passport_pdf', companyPassport);
      const saved = await pb.collection('brokerage_companies').update(companyRecord.id, fd, { requestKey: `adm-company-save-${companyRecord.id}` });
      setCompanyRecord(saved);
      setCompanyLogo(null);
      setCompanyLicense(null);
      setCompanyPassport(null);
      flash(t('company_profile_saved'));
      onRefresh?.();
    } catch (err) {
      setError(String(err?.response?.message || err?.message || t('something_wrong')));
    } finally {
      setSavingCompany(false);
    }
  };

  // ---- broker / company status management ----
  const openStatusNote = (kind, status) => {
    if (busy.startsWith('status-')) return;
    setStatusKind(kind);
    setStatusMode(status);
    setStatusNote('');
    setError('');
  };

  const cancelStatusNote = () => {
    if (busy.startsWith('status-')) return;
    setStatusMode(null);
    setStatusNote('');
    setStatusKind(null);
  };

  const setProfileStatus = async (kind, record, status, noteArg = '') => {
    if (!record) return;
    if (busy.startsWith('status-')) return;
    let review_note = String(noteArg || '').trim();
    if (status === 'rejected' || status === 'changes_requested') {
      if (!review_note) {
        setError(t('reason_required'));
        return;
      }
    }
    const collection = kind === 'company' ? 'brokerage_companies' : 'brokers';
    setBusy(`status-${status}`);
    setError('');
    try {
      const payload = { status, review_note: status === 'approved' ? '' : review_note };
      if (status === 'approved') {
        if (kind === 'company') payload.license_verified = true;
        else if (record.licensed) payload.license_verified = true;
      }
      const saved = await pb.collection(collection).update(record.id, payload, {
        requestKey: `adm-status-${record.id}-${status}-${Date.now()}`,
      });
      if (kind === 'company') setCompanyRecord(saved);
      else setBrokerRecord(saved);
      try {
        const ownerId = typeof record.owner === 'string' ? record.owner : record.owner?.id;
        if (ownerId) {
          await pb.collection('notifications').create(
            {
              user: ownerId,
              title:
                status === 'approved'
                  ? t('brokerage_notif_approved')
                  : status === 'rejected'
                    ? t('brokerage_notif_rejected')
                    : status === 'changes_requested'
                      ? t('brokerage_notif_changes')
                      : t('brokerage_status_updated'),
              body: review_note || '',
              type: 'status',
              read: false,
            },
            { requestKey: `adm-status-n-${record.id}-${Date.now()}` },
          );
        }
      } catch {
        /* non-fatal */
      }
      const doneMsg =
        status === 'approved'
          ? t('account_approved_success')
          : status === 'rejected'
            ? t('account_rejected_success')
            : status === 'changes_requested'
              ? t('account_changes_sent')
              : t('brokerage_status_updated');
      setStatusMode(null);
      setStatusNote('');
      setStatusKind(null);
      // Close review UI immediately; parent flashes toast + reloads lists/stats.
      onReviewDone?.(doneMsg, { kind, status, recordId: record.id });
      onClose?.();
      onRefresh?.();
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setBusy('');
    }
  };

  const submitStatusNote = async () => {
    const kind = statusKind;
    const record = kind === 'company' ? companyRecord : brokerRecord;
    if (!kind || !record || !statusMode) return;
    await setProfileStatus(kind, record, statusMode, statusNote);
  };

  const StatusNotePanel = () => {
    if (!statusMode || !statusKind) return null;
    const isReject = statusMode === 'rejected';
    return (
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
        <p className="text-sm font-semibold text-foreground">
          {isReject ? t('rejection_reason') : t('changes_note')}
        </p>
        <Textarea
          value={statusNote}
          onChange={(e) => setStatusNote(e.target.value)}
          placeholder={
            isReject ? t('rejection_reason_placeholder') : t('changes_note_placeholder')
          }
          rows={3}
          className="min-h-[88px] bg-card"
          disabled={busy.startsWith('status-')}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={cancelStatusNote}
            disabled={busy.startsWith('status-')}
            className="min-h-[36px]"
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isReject ? 'destructive' : 'default'}
            onClick={submitStatusNote}
            disabled={busy.startsWith('status-') || !statusNote.trim()}
            className="min-h-[36px]"
          >
            {busy.startsWith('status-') ? (
              <Loader2 size={13} className="animate-spin me-1" />
            ) : isReject ? (
              <X size={13} className="me-1" />
            ) : null}
            {isReject ? t('reject_profile') : t('request_changes_profile')}
          </Button>
        </div>
      </div>
    );
  };

  const toggleLicenseVerified = async (kind, record) => {
    if (!record) return;
    const collection = kind === 'company' ? 'brokerage_companies' : 'brokers';
    setBusy('verify-license');
    try {
      const saved = await pb.collection(collection).update(record.id, { license_verified: !record.license_verified }, { requestKey: `adm-lv-${record.id}` });
      if (kind === 'company') setCompanyRecord(saved);
      else setBrokerRecord(saved);
      flash(t('profile_saved'));
      onRefresh?.();
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setBusy('');
    }
  };

  // ---- property actions from within the user profile ----
  const propReviewOwner = reviewTarget
    ? (reviewTarget.expand?.owner || user)
    : null;

  const handlePropReviewAction = async (mode, note) => {
    const p = reviewTarget;
    if (!p) return;
    if (mode === 'approve') {
      await pb.collection('properties').update(p.id, { status: 'approved', review_note: '' }, { requestKey: `adm-prop-approve-${p.id}` });
      flash(t('approved_success'));
    } else if (mode === 'reject') {
      await pb.collection('properties').update(p.id, { status: 'rejected', review_note: note, rejected_at: new Date().toISOString() }, { requestKey: `adm-prop-reject-${p.id}` });
      flash(t('rejected_success'));
    } else if (mode === 'changes') {
      await pb.collection('properties').update(p.id, { status: 'changes_requested', review_note: note }, { requestKey: `adm-prop-changes-${p.id}` });
      flash(t('changes_success'));
    }
    setReviewTarget(null);
    onRefresh?.();
  };

  const setPropStatus = async (p, status) => {
    await pb.collection('properties').update(p.id, { status }, { requestKey: `adm-prop-st-${p.id}-${status}` });
    flash(t('property_status_updated'));
    onRefresh?.();
  };

  const deleteProp = async (p) => {
    if (!window.confirm(t('confirm_delete_property'))) return;
    setBusy(`prop-del-${p.id}`);
    try {
      await pb.collection('properties').delete(p.id, { requestKey: `adm-prop-del-${p.id}` });
      flash(t('property_deleted'));
      onRefresh?.();
    } catch (err) {
      setError(String(err?.message || t('something_wrong')));
    } finally {
      setBusy('');
    }
  };

  const activeCount = sessions.filter((s) => s.active).length;
  const specOpts = BROKER_SPECIALIZATIONS.map((s) => ({ id: s.id, label: lang === 'ar' ? s.ar : s.en }));

  const setP = (key) => (e) => setPersonal((p) => ({ ...p, [key]: e?.target ? e.target.value : e }));
  const setB = (key) => (e) => setBrokerForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));
  const setC = (key) => (e) => setCompanyForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

  const FileRow = ({ collection, recordId, record, field, label, file, setFile, acceptImg, acceptSvg }) => (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium cursor-pointer hover:bg-accent min-h-[40px]">
        <Upload size={15} />
        {file?.name || (record?.[field] ? t('replace_file') : label)}
        <input
          type="file"
          accept={acceptImg ? 'image/*' : 'application/pdf'}
          className="hidden"
          onChange={acceptImg ? pickImg(setFile, acceptSvg) : pickPdf(setFile)}
        />
      </label>
      {file ? (
        <FileViewButton file={file} />
      ) : record?.[field] ? (
        <>
          <FileViewButton record={record} filename={record[field]} />
          <button
            type="button"
            onClick={() => deleteFile(collection, recordId, field)}
            disabled={busy === `del-${field}`}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 min-h-[36px] disabled:opacity-60"
          >
            {busy === `del-${field}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {t('delete_file')}
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('user_profile')}</DialogTitle>
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
                {isSuperAdminTarget ? (
                  <span className="rounded-full border bg-[hsl(var(--gold))]/15 px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30">
                    {t('role_super_admin')}
                  </span>
                ) : accountKind === 'staff' ? (
                  <span className="rounded-full border bg-[hsl(var(--gold))]/15 px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30">
                    {user.role === 'admin' ? t('role_admin') : user.role === 'editor' ? t('role_editor') : user.role === 'support' ? t('role_support') : t('role_custom')}
                  </span>
                ) : (
                  <span className="rounded-full border bg-secondary text-secondary-foreground px-2.5 py-0.5 text-xs font-semibold">{t('account_type_owner')}</span>
                )}
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    accountState === 'active'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : accountState === 'inactive'
                        ? 'bg-slate-100 text-slate-700 border-slate-200'
                        : 'bg-red-100 text-red-800 border-red-200',
                  )}
                >
                  {accountState === 'active' ? t('active_flag') : accountState === 'inactive' ? t('inactive_flag') : t('suspended_flag')}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                    user.verified ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200',
                  )}
                >
                  <Mail size={11} />
                  {user.verified ? t('email_verified_yes') : t('email_verified_no')}
                </span>
              </div>
            </div>
          </div>

          {/* Admin actions (all staff) */}
          {!isSuperAdminTarget && (
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
                <Button size="sm" variant="outline" onClick={() => { setResetOpen(true); setError(''); }} className="min-h-[36px]">
                  <KeyRound size={14} className="me-1" /> {t('reset_password')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEmailOpen(true); setError(''); }} className="min-h-[36px]">
                  <Mail size={14} className="me-1" /> {t('change_email')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setRoleOpen(true); setError(''); }} className="min-h-[36px]">
                  <UserCog size={14} className="me-1" /> {t('change_role')}
                </Button>
                {canEdit && (
                  <>
                    {accountState !== 'active' && (
                      <Button size="sm" onClick={() => onSetAccountState?.(user, 'active')} className="min-h-[36px]">
                        <ShieldCheck size={14} className="me-1" /> {t('activate')}
                      </Button>
                    )}
                    {accountState !== 'inactive' && (
                      <Button size="sm" variant="outline" onClick={() => onSetAccountState?.(user, 'inactive')} className="min-h-[36px]">
                        {t('deactivate')}
                      </Button>
                    )}
                    {accountState !== 'suspended' && (
                      <Button size="sm" variant="destructive" onClick={() => onSetAccountState?.(user, 'suspended')} className="min-h-[36px]">
                        <ShieldCheck size={14} className="me-1" /> {t('suspend')}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={deleteUser} disabled={busy === 'delete'} className="min-h-[36px] text-destructive hover:text-destructive">
                      {busy === 'delete' ? <Loader2 size={14} className="animate-spin me-1" /> : <Trash2 size={14} className="me-1" />}
                      {t('delete_user')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ===== Super Admin full control ===== */}
          {canEdit && !isSuperAdminTarget && (
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-4">
              <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                <ShieldCheck size={15} /> {t('super_admin_control')}
              </h4>

              {/* Personal data editor */}
              <form onSubmit={savePersonal} className="space-y-3 rounded-xl border bg-card p-4">
                <h5 className="text-sm font-bold flex items-center gap-2"><UserCog size={14} /> {t('personal_data')}</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('name')}</Label>
                    <Input value={personal.name} onChange={setP('name')} className="min-h-[40px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('email')}</Label>
                    <Input type="email" dir="ltr" value={personal.email} onChange={setP('email')} className="min-h-[40px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('phone')}</Label>
                    <PhoneField value={personal.phone} onChange={(v) => setPersonal((p) => ({ ...p, phone: v }))} heightClass="min-h-[40px]" showLabels={false} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('nationality')}</Label>
                    <NationalityField value={personal.nationality} onChange={(v) => setPersonal((p) => ({ ...p, nationality: v }))} heightClass="min-h-[40px]" showLabels={false} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('gender')}</Label>
                    <GenderField value={personal.gender} onChange={(v) => setPersonal((p) => ({ ...p, gender: v }))} heightClass="min-h-[40px]" showLabels={false} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('date_of_birth')}</Label>
                    <DateField value={personal.date_of_birth} onChange={(v) => setPersonal((p) => ({ ...p, date_of_birth: v }))} heightClass="min-h-[40px]" showLabels={false} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('access_plan')}</Label>
                    <Select value={personal.access_plan} onValueChange={(v) => setPersonal((p) => ({ ...p, access_plan: v }))}>
                      <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">{t('access_free')}</SelectItem>
                        <SelectItem value="paid">{t('access_paid')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('subscription_status_label')}</Label>
                    <Select value={personal.subscription_status} onValueChange={(v) => setPersonal((p) => ({ ...p, subscription_status: v }))}>
                      <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('sub_status_none')}</SelectItem>
                        <SelectItem value="active">{t('sub_status_active')}</SelectItem>
                        <SelectItem value="expired">{t('sub_status_expired')}</SelectItem>
                        <SelectItem value="cancelled">{t('sub_status_cancelled')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('account_status')}</Label>
                    <Select value={personal.account_state} onValueChange={(v) => setPersonal((p) => ({ ...p, account_state: v }))}>
                      <SelectTrigger className="min-h-[40px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t('status_active_option')}</SelectItem>
                        <SelectItem value="inactive">{t('status_inactive_option')}</SelectItem>
                        <SelectItem value="suspended">{t('status_suspended_option')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Avatar + documents */}
                <div className="grid grid-cols-1 gap-3 border-t pt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('profile_photo') || t('personal_data')}</Label>
                    <FileRow collection="users" recordId={user.id} record={user} field="avatar" label={t('profile_photo') || 'Avatar'} file={avatarFile} setFile={setAvatarFile} acceptImg />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('passport')}</Label>
                    <FileRow collection="users" recordId={user.id} record={user} field="passport_pdf" label={t('passport')} file={passportFile} setFile={setPassportFile} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('residence')}</Label>
                    <FileRow collection="users" recordId={user.id} record={user} field="residence_pdf" label={t('residence')} file={residenceFile} setFile={setResidenceFile} />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={savingPersonal} className="min-h-[40px]">
                    {savingPersonal ? <Loader2 size={14} className="animate-spin me-1" /> : <Check size={14} className="me-1" />}
                    {t('save')}
                  </Button>
                </div>
              </form>

              {/* Broker profile editor */}
              {accountKind === 'broker' && (
                <div className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-sm font-bold flex items-center gap-2"><BadgeCheck size={14} /> {t('broker_profile_title')}</h5>
                    {brokerRecord && <StatusBadge status={brokerRecord.status} />}
                  </div>

                  {profileLoading ? (
                    <p className="text-xs text-muted-foreground">{t('loading')}</p>
                  ) : !brokerRecord ? (
                    <p className="text-xs text-muted-foreground">{t('no_broker_profile')}</p>
                  ) : (
                    <>
                      {/* status + license verified controls */}
                      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                        <Button
                          size="sm"
                          onClick={() => setProfileStatus('broker', brokerRecord, 'approved')}
                          disabled={busy.startsWith('status-')}
                          className="min-h-[36px]"
                        >
                          {busy === 'status-approved' ? (
                            <Loader2 size={13} className="animate-spin me-1" />
                          ) : (
                            <Check size={13} className="me-1" />
                          )}
                          {t('approve_profile')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openStatusNote('broker', 'changes_requested')}
                          disabled={busy.startsWith('status-')}
                          className="min-h-[36px]"
                        >
                          {t('request_changes_profile')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openStatusNote('broker', 'rejected')}
                          disabled={busy.startsWith('status-')}
                          className="min-h-[36px]"
                        >
                          <X size={13} className="me-1" /> {t('reject_profile')}
                        </Button>
                        <div className="ms-auto flex items-center gap-2">
                          <Label className="text-xs">{t('license_verified_label')}</Label>
                          <Switch checked={!!brokerRecord.license_verified} onCheckedChange={() => toggleLicenseVerified('broker', brokerRecord)} disabled={busy === 'verify-license'} />
                        </div>
                      </div>
                      {statusKind === 'broker' && <StatusNotePanel />}

                      <form onSubmit={saveBroker} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('name')}</Label>
                            <Input value={brokerForm.name} onChange={setB('name')} className="min-h-[40px]" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('email')}</Label>
                            <Input type="email" dir="ltr" value={brokerForm.email} onChange={setB('email')} className="min-h-[40px]" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('phone')}</Label>
                            <PhoneField value={brokerForm.phone} onChange={(v) => setBrokerForm((f) => ({ ...f, phone: v }))} heightClass="min-h-[40px]" showLabels={false} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('whatsapp')}</Label>
                            <PhoneField value={brokerForm.whatsapp} onChange={(v) => setBrokerForm((f) => ({ ...f, whatsapp: v }))} heightClass="min-h-[40px]" showLabels={false} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('nationality')}</Label>
                            <NationalityField value={brokerForm.nationality} onChange={(v) => setBrokerForm((f) => ({ ...f, nationality: v }))} heightClass="min-h-[40px]" showLabels={false} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('gender')}</Label>
                            <GenderField value={brokerForm.gender} onChange={(v) => setBrokerForm((f) => ({ ...f, gender: v }))} heightClass="min-h-[40px]" showLabels={false} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('date_of_birth')}</Label>
                            <DateField value={brokerForm.date_of_birth} onChange={(v) => setBrokerForm((f) => ({ ...f, date_of_birth: v }))} heightClass="min-h-[40px]" showLabels={false} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('broker_job_title')}</Label>
                            <Input value={brokerForm.job_title} onChange={setB('job_title')} className="min-h-[40px]" />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">{t('broker_work_country')}</Label>
                          <NationalityField value={brokerForm.country} onChange={(v) => setBrokerForm((f) => ({ ...f, country: v, cities: f.country === v ? f.cities : [] }))} heightClass="min-h-[40px]" showLabels={false} />
                        </div>
                        <WorkingCitiesField country={brokerForm.country} value={brokerForm.cities} onChange={(cities) => setBrokerForm((f) => ({ ...f, cities }))} showLabels={false} />
                        <LanguageMultiSelect value={brokerForm.languages} onChange={(v) => setBrokerForm((f) => ({ ...f, languages: v }))} showLabels={false} />
                        <div className="space-y-1.5">
                          <Label className="text-xs">{t('broker_specializations')}</Label>
                          <MultiChipSelect options={specOpts} value={brokerForm.specialization} onChange={(v) => setBrokerForm((f) => ({ ...f, specialization: v }))} />
                        </div>
                        <MarketsMultiSelect label={t('broker_markets_title')} hint={t('broker_markets_hint')} value={brokerForm.markets} onChange={(v) => setBrokerForm((f) => ({ ...f, markets: v }))} showLabels={false} />

                        <div className="flex items-center gap-3">
                          <Label className="text-xs">{t('broker_freelance')}</Label>
                          <Switch checked={brokerForm.freelance} onCheckedChange={(v) => setBrokerForm((f) => ({ ...f, freelance: v }))} />
                        </div>
                        {!brokerForm.freelance && (
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('broker_company_name')}</Label>
                            <Input value={brokerForm.company_name} onChange={setB('company_name')} className="min-h-[40px]" />
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          <Label className="text-xs">{t('broker_license_title')}</Label>
                          <Switch checked={brokerForm.licensed} onCheckedChange={(v) => setBrokerForm((f) => ({ ...f, licensed: v }))} />
                        </div>
                        {brokerForm.licensed && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">{t('broker_license_number')}</Label>
                              <Input value={brokerForm.license_number} onChange={setB('license_number')} className="min-h-[40px]" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">{t('broker_license_pdf')}</Label>
                              <FileRow collection="brokers" recordId={brokerRecord.id} record={brokerRecord} field="license_pdf" label={t('broker_license_pdf')} file={brokerLicense} setFile={setBrokerLicense} />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-3 border-t pt-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('profile_photo') || 'Photo'}</Label>
                            <FileRow collection="brokers" recordId={brokerRecord.id} record={brokerRecord} field="photo" label={t('profile_photo') || 'Photo'} file={brokerPhoto} setFile={setBrokerPhoto} acceptImg />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t('broker_passport_or_residence')}</Label>
                            <FileRow collection="brokers" recordId={brokerRecord.id} record={brokerRecord} field="passport_pdf" label={t('broker_passport_or_residence')} file={brokerPassport} setFile={setBrokerPassport} />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5"><Label className="text-xs">Instagram</Label><Input dir="ltr" value={brokerForm.instagram} onChange={setB('instagram')} className="min-h-[40px]" /></div>
                          <div className="space-y-1.5"><Label className="text-xs">Facebook</Label><Input dir="ltr" value={brokerForm.facebook} onChange={setB('facebook')} className="min-h-[40px]" /></div>
                          <div className="space-y-1.5"><Label className="text-xs">TikTok</Label><Input dir="ltr" value={brokerForm.tiktok} onChange={setB('tiktok')} className="min-h-[40px]" /></div>
                        </div>

                        <div className="flex justify-end">
                          <Button type="submit" size="sm" disabled={savingBroker} className="min-h-[40px]">
                            {savingBroker ? <Loader2 size={14} className="animate-spin me-1" /> : <Check size={14} className="me-1" />}
                            {t('save_profile')}
                          </Button>
                        </div>
                      </form>

                      <div className="border-t pt-3">
                        <BrokeragePermits targetType="broker" targetId={brokerRecord.id} owner={user.id} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Company profile editor */}
              {accountKind === 'company' && (
                <div className="space-y-3 rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-sm font-bold flex items-center gap-2"><Building2 size={14} /> {t('company_profile_title')}</h5>
                    {companyRecord && <StatusBadge status={companyRecord.status} />}
                  </div>

                  {profileLoading ? (
                    <p className="text-xs text-muted-foreground">{t('loading')}</p>
                  ) : !companyRecord ? (
                    <p className="text-xs text-muted-foreground">{t('no_company_profile')}</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                        <Button
                          size="sm"
                          onClick={() => setProfileStatus('company', companyRecord, 'approved')}
                          disabled={busy.startsWith('status-')}
                          className="min-h-[36px]"
                        >
                          {busy === 'status-approved' ? (
                            <Loader2 size={13} className="animate-spin me-1" />
                          ) : (
                            <Check size={13} className="me-1" />
                          )}
                          {t('approve_profile')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openStatusNote('company', 'changes_requested')}
                          disabled={busy.startsWith('status-')}
                          className="min-h-[36px]"
                        >
                          {t('request_changes_profile')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openStatusNote('company', 'rejected')}
                          disabled={busy.startsWith('status-')}
                          className="min-h-[36px]"
                        >
                          <X size={13} className="me-1" /> {t('reject_profile')}
                        </Button>
                        <div className="ms-auto flex items-center gap-2">
                          <Label className="text-xs">{t('license_verified_label')}</Label>
                          <Switch checked={!!companyRecord.license_verified} onCheckedChange={() => toggleLicenseVerified('company', companyRecord)} disabled={busy === 'verify-license'} />
                        </div>
                      </div>
                      {statusKind === 'company' && <StatusNotePanel />}

                      <form onSubmit={saveCompany} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5"><Label className="text-xs">{t('brokerage_name_en')}</Label><Input value={companyForm.name} onChange={setC('name')} className="min-h-[40px]" /></div>
                          <div className="space-y-1.5"><Label className="text-xs">{t('brokerage_name_ar')}</Label><Input value={companyForm.name_ar} onChange={setC('name_ar')} className="min-h-[40px]" dir="rtl" /></div>
                          <div className="space-y-1.5"><Label className="text-xs">{t('email')}</Label><Input type="email" dir="ltr" value={companyForm.email} onChange={setC('email')} className="min-h-[40px]" /></div>
                          <div className="space-y-1.5"><Label className="text-xs">{t('brokerage_website')}</Label><Input dir="ltr" value={companyForm.website} onChange={setC('website')} className="min-h-[40px]" /></div>
                          <div className="space-y-1.5"><Label className="text-xs">{t('phone')}</Label><PhoneField value={companyForm.phone} onChange={(v) => setCompanyForm((f) => ({ ...f, phone: v }))} heightClass="min-h-[40px]" showLabels={false} /></div>
                          <div className="space-y-1.5"><Label className="text-xs">{t('whatsapp')}</Label><PhoneField value={companyForm.whatsapp} onChange={(v) => setCompanyForm((f) => ({ ...f, whatsapp: v }))} heightClass="min-h-[40px]" showLabels={false} /></div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">{t('country')}</Label>
                          <NationalityField value={companyForm.country} onChange={(v) => setCompanyForm((f) => ({ ...f, country: v, city: f.country === v ? f.city : '', city_ar: f.country === v ? f.city_ar : '', cities: f.country === v ? f.cities : [] }))} heightClass="min-h-[40px]" showLabels={false} />
                        </div>
                        <CitySearchField country={companyForm.country} value={companyForm.city} label={t('company_registration_city')} onChange={(en, ar) => setCompanyForm((f) => ({ ...f, city: en, city_ar: ar || '' }))} showLabels={false} />
                        <div className="space-y-1.5">
                          <Label className="text-xs">{t('company_owner_country')}</Label>
                          <NationalityField value={companyForm.owner_country} onChange={(v) => setCompanyForm((f) => ({ ...f, owner_country: v }))} heightClass="min-h-[40px]" showLabels={false} />
                        </div>
                        <WorkingCitiesField country={companyForm.country} value={companyForm.cities} onChange={(cities) => setCompanyForm((f) => ({ ...f, cities }))} showLabels={false} />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5"><Label className="text-xs">{t('company_license_number')}</Label><Input value={companyForm.license_number} onChange={setC('license_number')} className="min-h-[40px]" /></div>
                          <div className="space-y-1.5"><Label className="text-xs">{t('company_license_pdf')}</Label><FileRow collection="brokerage_companies" recordId={companyRecord.id} record={companyRecord} field="license_pdf" label={t('company_license_pdf')} file={companyLicense} setFile={setCompanyLicense} /></div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 border-t pt-3">
                          <div className="space-y-1.5"><Label className="text-xs">{t('company_logo')}</Label><FileRow collection="brokerage_companies" recordId={companyRecord.id} record={companyRecord} field="logo" label={t('company_logo')} file={companyLogo} setFile={setCompanyLogo} acceptImg acceptSvg /></div>
                          <div className="space-y-1.5"><Label className="text-xs">{t('company_owner_passport')}</Label><FileRow collection="brokerage_companies" recordId={companyRecord.id} record={companyRecord} field="passport_pdf" label={t('company_owner_passport')} file={companyPassport} setFile={setCompanyPassport} /></div>
                        </div>

                        <LanguageMultiSelect value={companyForm.languages} onChange={(v) => setCompanyForm((f) => ({ ...f, languages: v }))} showLabels={false} />
                        <div className="space-y-1.5"><Label className="text-xs">{t('broker_specializations')}</Label><MultiChipSelect options={specOpts} value={companyForm.specialization} onChange={(v) => setCompanyForm((f) => ({ ...f, specialization: v }))} /></div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5"><Label className="text-xs">Instagram</Label><Input dir="ltr" value={companyForm.instagram} onChange={setC('instagram')} className="min-h-[40px]" /></div>
                          <div className="space-y-1.5"><Label className="text-xs">Facebook</Label><Input dir="ltr" value={companyForm.facebook} onChange={setC('facebook')} className="min-h-[40px]" /></div>
                          <div className="space-y-1.5"><Label className="text-xs">TikTok</Label><Input dir="ltr" value={companyForm.tiktok} onChange={setC('tiktok')} className="min-h-[40px]" /></div>
                        </div>

                        <div className="space-y-1.5"><Label className="text-xs">{t('brokerage_desc_en')}</Label><Textarea value={companyForm.description} onChange={setC('description')} rows={3} className="min-h-[80px]" /></div>
                        <div className="space-y-1.5"><Label className="text-xs">{t('brokerage_desc_ar')}</Label><Textarea value={companyForm.description_ar} onChange={setC('description_ar')} rows={3} className="min-h-[80px]" dir="rtl" /></div>

                        <div className="flex justify-end">
                          <Button type="submit" size="sm" disabled={savingCompany} className="min-h-[40px]">
                            {savingCompany ? <Loader2 size={14} className="animate-spin me-1" /> : <Check size={14} className="me-1" />}
                            {t('save_profile')}
                          </Button>
                        </div>
                      </form>

                      <div className="border-t pt-3 space-y-4">
                        <BrokerageBranches companyId={companyRecord.id} owner={user.id} />
                        <BrokeragePermits targetType="company" targetId={companyRecord.id} owner={user.id} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Properties management (owners) */}
              {accountKind === 'owner' && (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <h5 className="text-sm font-bold flex items-center gap-2"><Building2 size={14} /> {t('user_properties')} ({userProps.length})</h5>
                  {userProps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('no_properties_user')}</p>
                  ) : (
                    <div className="divide-y">
                      {userProps.map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                          <div className="min-w-[160px] flex-1">
                            <p className="font-medium truncate">{propertyLabel(p)}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.type === 'cash' ? t('type_cash') : p.type === 'installment' ? t('type_installment') : t('type_rented')}
                              {p.country ? ` · ${countryName(p.country, lang)}` : ''}
                            </p>
                          </div>
                          <StatusBadge status={p.status} />
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => setReviewTarget(p)} className="min-h-[34px]">
                              <FileText size={13} className="me-1" /> {t('review_property')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => onEditProperty?.(p)} className="min-h-[34px]">
                              <Pencil size={13} className="me-1" /> {t('edit_property')}
                            </Button>
                            {p.status !== 'approved' && (
                              <Button size="sm" onClick={() => setPropStatus(p, 'approved')} className="min-h-[34px]">
                                <Check size={13} className="me-1" /> {t('approve')}
                              </Button>
                            )}
                            {p.status !== 'rejected' && (
                              <Button size="sm" variant="outline" onClick={() => setPropStatus(p, 'rejected')} className="min-h-[34px]">
                                <X size={13} className="me-1" /> {t('reject')}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => deleteProp(p)} disabled={busy === `prop-del-${p.id}`} className="min-h-[34px] text-destructive hover:text-destructive">
                              {busy === `prop-del-${p.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Documents (view — all staff) */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h4 className="text-sm font-bold text-primary flex items-center gap-2">
              <FileText size={15} /> {t('view_documents')}
            </h4>
            <div className="flex flex-wrap gap-2">
              <DocButton record={user} field="passport_pdf" label={t('passport')} />
              <DocButton record={user} field="residence_pdf" label={t('residence')} />
              {brokerRecord && <DocButton record={brokerRecord} field="passport_pdf" label={t('broker_passport_or_residence')} />}
              {brokerRecord && brokerRecord.license_pdf && <DocButton record={brokerRecord} field="license_pdf" label={t('broker_license_pdf')} />}
              {companyRecord && <DocButton record={companyRecord} field="license_pdf" label={t('company_license_pdf')} />}
              {companyRecord && companyRecord.passport_pdf && <DocButton record={companyRecord} field="passport_pdf" label={t('company_owner_passport')} />}
            </div>
            {!user.passport_pdf && !user.residence_pdf && !brokerRecord?.passport_pdf && !companyRecord?.license_pdf && (
              <p className="text-xs text-muted-foreground">{t('no_documents')}</p>
            )}
          </div>

          {/* Sessions & devices */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                <Monitor size={15} /> {t('user_sessions')}
              </h4>
              <span className="text-xs text-muted-foreground">
                {activeCount} {t('active_devices_count')}
              </span>
            </div>
            {loadingSessions ? (
              <p className="py-4 text-center text-xs text-muted-foreground">{t('loading')}</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('no_sessions_user')}</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s) => {
                  const Icon = TYPE_ICON[s.device_type] || Monitor;
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5">
                      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', s.active ? 'bg-primary text-primary-foreground' : 'bg-primary/70 text-primary-foreground')}>
                        <Icon size={16} strokeWidth={1.8} />
                      </span>
                      <div className="min-w-[140px] flex-1">
                        <p className="text-sm font-semibold">{s.device_name || t('unknown_device')}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.browser} · {t('last_active')}: {formatDate(s.last_active, lang)}
                        </p>
                      </div>
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', s.active ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600')}>
                        {s.active ? t('active_flag') : t('inactive_session')}
                      </span>
                      {s.active && (
                        <Button size="sm" variant="outline" onClick={() => logoutSession(s)} disabled={busy === `out-${s.id}`} className="min-h-[34px]">
                          {busy === `out-${s.id}` ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                          {t('logout_user_device')}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => removeSession(s)} disabled={busy === `rm-${s.id}`} className="min-h-[34px] text-destructive hover:text-destructive">
                        {busy === `rm-${s.id}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        {t('remove_user_device')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

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
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required dir="ltr" className="min-h-[44px]" placeholder={t('password_hint')} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)} className="min-h-[44px]">{t('cancel')}</Button>
              <Button type="submit" disabled={busy === 'reset'} className="min-h-[44px]">
                {busy === 'reset' ? <Loader2 size={16} className="animate-spin me-1" /> : <KeyRound size={16} className="me-1" />}
                {t('reset_password')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required dir="ltr" className="min-h-[44px]" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEmailOpen(false)} className="min-h-[44px]">{t('cancel')}</Button>
              <Button type="submit" disabled={busy === 'email'} className="min-h-[44px]">
                {busy === 'email' ? <Loader2 size={16} className="animate-spin me-1" /> : <Mail size={16} className="me-1" />}
                {t('change_email')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change role sub-dialog */}
      <Dialog open={roleOpen} onOpenChange={(o) => { setRoleOpen(o); if (!o) { setRole(user.role || 'owner'); setStaffLabel(user.staff_label || ''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('change_role')}</DialogTitle>
            <DialogDescription>{t('staff_permissions_hint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitRole} className="space-y-3 pt-2">
            <div className="space-y-2">
              <Label>{t('account_type')}</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">{t('role_owner')}</SelectItem>
                  <SelectItem value="admin">{t('role_admin')}</SelectItem>
                  <SelectItem value="editor">{t('role_editor')}</SelectItem>
                  <SelectItem value="support">{t('role_support')}</SelectItem>
                  <SelectItem value="custom">{t('role_custom')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === 'custom' && (
              <div className="space-y-2">
                <Label>{t('custom_role_name')}</Label>
                <Input value={staffLabel} onChange={(e) => setStaffLabel(e.target.value)} className="min-h-[44px]" placeholder={t('custom_role_name_hint')} />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRoleOpen(false)} className="min-h-[44px]">{t('cancel')}</Button>
              <Button type="submit" disabled={busy === 'role'} className="min-h-[44px]">
                {busy === 'role' ? <Loader2 size={16} className="animate-spin me-1" /> : <UserCog size={16} className="me-1" />}
                {t('change_role')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Property review (opened from within this modal) */}
      <PropertyReviewModal
        property={reviewTarget}
        owner={propReviewOwner}
        payments={payments}
        onClose={() => setReviewTarget(null)}
        onAction={handlePropReviewAction}
      />
    </Dialog>
  );
};

export default UserProfileModal;
