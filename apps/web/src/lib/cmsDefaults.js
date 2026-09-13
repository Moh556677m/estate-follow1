/**
 * Default CMS configuration for Estate Follow Control Center.
 * Existing platform_settings scalar fields remain the source of truth for
 * branding colors / names; this object holds structured CMS extras.
 */

export const CMS_SECTIONS = [
  { id: 'branding', ar: 'هوية المنصة', en: 'Platform Branding' },
  { id: 'slogans', ar: 'السلوغان والنصوص', en: 'Slogans & Texts' },
  { id: 'pages', ar: 'إدارة الصفحات', en: 'Page Management' },
  { id: 'cards', ar: 'كروت الإحصائيات', en: 'Dashboard Cards' },
  { id: 'sidebar', ar: 'القائمة الجانبية', en: 'Sidebar Management' },
  { id: 'plans', ar: 'الاشتراكات والباقات', en: 'Subscriptions & Plans' },
  { id: 'accounts', ar: 'أنواع الحسابات', en: 'Account Types' },
  { id: 'forms', ar: 'الحقول والنماذج', en: 'Forms & Fields' },
  { id: 'geo', ar: 'اللغة الافتراضية والدول', en: 'Default Language & Countries' },
  { id: 'specs', ar: 'التخصصات', en: 'Specializations' },
  { id: 'notifications', ar: 'الإشعارات', en: 'Notifications' },
  { id: 'approval', ar: 'نظام المراجعة', en: 'Approval System' },
  { id: 'features', ar: 'إدارة المميزات', en: 'Feature Management' },
  { id: 'maintenance', ar: 'الصيانة', en: 'Maintenance' },
  { id: 'audit', ar: 'سجل التعديلات', en: 'Audit Log' },
  { id: 'colors', ar: 'الألوان والخطوط', en: 'Colors & Fonts' },
  { id: 'security', ar: 'الأمان', en: 'Security Limits' },
  { id: 'support', ar: 'إعدادات الدعم', en: 'Support Settings' },
  { id: 'marketing', ar: 'إعدادات التسويق', en: 'Marketing Settings' },
];

export const DEFAULT_PAGES = [
  { id: 'overview', key: 'overview', name_en: 'Overview', name_ar: 'نظرة عامة', icon: 'LayoutDashboard', visible: true, order: 0, surface: 'admin', route: '/dashboard/overview', permission: '', description_en: '', description_ar: '' },
  { id: 'analytics', key: 'analytics', name_en: 'User Analytics', name_ar: 'تحليلات المستخدمين', icon: 'BarChart3', visible: true, order: 1, surface: 'admin', route: '/dashboard/analytics', permission: '__super__', description_en: '', description_ar: '' },
  { id: 'reviews', key: 'reviews', name_en: 'Properties Pending Review', name_ar: 'عقارات قيد المراجعة', icon: 'ClipboardEdit', visible: true, order: 2, surface: 'admin', route: '/dashboard/reviews', permission: 'approve_properties', description_en: '', description_ar: '' },
  { id: 'user-reviews', key: 'user-reviews', name_en: 'Users Pending Review', name_ar: 'المستخدمون قيد المراجعة', icon: 'UserCheck', visible: true, order: 3, surface: 'admin', route: '/dashboard/user-reviews', permission: '__super__', description_en: '', description_ar: '' },
  { id: 'rejected', key: 'rejected', name_en: 'Rejected Properties', name_ar: 'العقارات المرفوضة', icon: 'Ban', visible: true, order: 4, surface: 'admin', route: '/dashboard/rejected', permission: '__super__', description_en: '', description_ar: '' },
  { id: 'properties', key: 'properties', name_en: 'Properties', name_ar: 'العقارات', icon: 'Building2', visible: true, order: 5, surface: 'admin', route: '/dashboard/properties', permission: 'edit_properties', description_en: '', description_ar: '' },
  { id: 'users', key: 'users', name_en: 'Users', name_ar: 'المستخدمون', icon: 'Users', visible: true, order: 6, surface: 'admin', route: '/dashboard/users', permission: 'view_users', description_en: '', description_ar: '' },
  { id: 'managers', key: 'managers', name_en: 'Managers', name_ar: 'المديرون', icon: 'Briefcase', visible: true, order: 7, surface: 'admin', route: '/dashboard/managers', permission: '__super__', description_en: '', description_ar: '' },
  { id: 'revenue', key: 'revenue', name_en: 'Subscription Revenue', name_ar: 'إيرادات الاشتراكات', icon: 'Wallet', visible: true, order: 8, surface: 'admin', route: '/dashboard/revenue', permission: '__revenue__', description_en: '', description_ar: '' },
  { id: 'brokerage', key: 'brokerage', name_en: 'Brokerage', name_ar: 'الوساطة العقارية', icon: 'Handshake', visible: true, order: 9, surface: 'admin', route: '/dashboard/brokerage', permission: '__super__', description_en: '', description_ar: '' },
  { id: 'payments', key: 'payments', name_en: 'Payments', name_ar: 'المدفوعات', icon: 'Wallet', visible: true, order: 10, surface: 'admin', route: '/dashboard/payments', permission: 'manage_payments', description_en: '', description_ar: '' },
  { id: 'security', key: 'security', name_en: 'Devices', name_ar: 'الأجهزة', icon: 'ShieldCheck', visible: true, order: 11, surface: 'admin', route: '/dashboard/security', permission: '', description_en: '', description_ar: '' },
  { id: 'support', key: 'support', name_en: 'Support', name_ar: 'الدعم والمساعدة', icon: 'LifeBuoy', visible: true, order: 12, surface: 'admin', route: '/dashboard/support', permission: '', description_en: '', description_ar: '' },
  { id: 'settings', key: 'settings', name_en: 'Settings', name_ar: 'الإعدادات', icon: 'Settings2', visible: true, order: 13, surface: 'admin', route: '/dashboard/settings', permission: 'manage_settings', description_en: '', description_ar: '' },
  { id: 'owner-home', key: 'home', name_en: 'Home', name_ar: 'الرئيسية', icon: 'Home', visible: true, order: 0, surface: 'owner', route: '/dashboard/home', permission: '', description_en: '', description_ar: '' },
  { id: 'owner-properties', key: 'properties', name_en: 'Properties', name_ar: 'العقارات', icon: 'Building2', visible: true, order: 1, surface: 'owner', route: '/dashboard/properties', permission: '', description_en: '', description_ar: '' },
  { id: 'broker-home', key: 'home', name_en: 'Home', name_ar: 'الرئيسية', icon: 'Home', visible: true, order: 0, surface: 'broker', route: '/dashboard/home', permission: '', description_en: '', description_ar: '' },
  { id: 'company-home', key: 'home', name_en: 'Home', name_ar: 'الرئيسية', icon: 'Home', visible: true, order: 0, surface: 'company', route: '/dashboard/home', permission: '', description_en: '', description_ar: '' },
];

export const DEFAULT_CARDS = [
  { id: 'stat_total_users', key: 'stat_total_users', name_en: 'Total Users', name_ar: 'إجمالي المستخدمين', icon: 'Users', visible: true, order: 0, link: '/dashboard/users', surface: 'admin' },
  { id: 'stat_total_brokers', key: 'stat_total_brokers', name_en: 'Total Brokers', name_ar: 'إجمالي الوسطاء', icon: 'Handshake', visible: true, order: 1, link: '/dashboard/users', surface: 'admin' },
  { id: 'stat_total_companies', key: 'stat_total_companies', name_en: 'Total Brokerage Companies', name_ar: 'إجمالي شركات الوساطة', icon: 'Briefcase', visible: true, order: 2, link: '/dashboard/users', surface: 'admin' },
  { id: 'stat_users_pending_review', key: 'stat_users_pending_review', name_en: 'Users Pending Review', name_ar: 'المستخدمون قيد المراجعة', icon: 'UserCheck', visible: true, order: 3, link: '/dashboard/user-reviews', surface: 'admin' },
  { id: 'stat_approved', key: 'stat_approved', name_en: 'Approved Properties', name_ar: 'العقارات المعتمدة', icon: 'Building2', visible: true, order: 4, link: '/dashboard/properties', surface: 'admin' },
  { id: 'stat_pending', key: 'stat_pending', name_en: 'Properties Pending Review', name_ar: 'عقارات قيد المراجعة', icon: 'Clock', visible: true, order: 5, link: '/dashboard/reviews', surface: 'admin' },
  { id: 'stat_rejected', key: 'stat_rejected', name_en: 'Rejected Properties', name_ar: 'العقارات المرفوضة', icon: 'Ban', visible: true, order: 6, link: '/dashboard/rejected', surface: 'admin' },
  { id: 'stat_subscription_revenue', key: 'stat_subscription_revenue', name_en: 'Subscription Revenue', name_ar: 'إيرادات الاشتراكات', icon: 'Wallet', visible: true, order: 7, link: '/dashboard/revenue', surface: 'admin' },
];

export const DEFAULT_SIDEBAR = {
  admin: [
    { id: 'overview', key: 'overview', name_en: 'Overview', name_ar: 'نظرة عامة', icon: 'LayoutDashboard', visible: true, order: 0 },
    { id: 'analytics', key: 'analytics', name_en: 'User Analytics', name_ar: 'تحليلات المستخدمين', icon: 'BarChart3', visible: true, order: 1 },
    { id: 'reviews', key: 'reviews', name_en: 'Properties Pending Review', name_ar: 'عقارات قيد المراجعة', icon: 'ClipboardEdit', visible: true, order: 2 },
    { id: 'user-reviews', key: 'user-reviews', name_en: 'Users Pending Review', name_ar: 'المستخدمون قيد المراجعة', icon: 'UserCheck', visible: true, order: 3 },
    { id: 'rejected', key: 'rejected', name_en: 'Rejected Properties', name_ar: 'العقارات المرفوضة', icon: 'Ban', visible: true, order: 4 },
    { id: 'properties', key: 'properties', name_en: 'Properties', name_ar: 'العقارات', icon: 'Building2', visible: true, order: 5 },
    { id: 'users', key: 'users', name_en: 'Users', name_ar: 'المستخدمون', icon: 'Users', visible: true, order: 6 },
    { id: 'managers', key: 'managers', name_en: 'Managers', name_ar: 'المديرون', icon: 'Briefcase', visible: true, order: 7 },
    { id: 'revenue', key: 'revenue', name_en: 'Subscription Revenue', name_ar: 'إيرادات الاشتراكات', icon: 'Wallet', visible: true, order: 8 },
    { id: 'brokerage', key: 'brokerage', name_en: 'Brokerage', name_ar: 'الوساطة العقارية', icon: 'Handshake', visible: true, order: 9 },
    { id: 'payments', key: 'payments', name_en: 'Payments', name_ar: 'المدفوعات', icon: 'Wallet', visible: true, order: 10 },
    { id: 'security', key: 'security', name_en: 'Devices', name_ar: 'الأجهزة', icon: 'ShieldCheck', visible: true, order: 11 },
    { id: 'support', key: 'support', name_en: 'Support', name_ar: 'الدعم والمساعدة', icon: 'LifeBuoy', visible: true, order: 12 },
    { id: 'settings', key: 'settings', name_en: 'Settings', name_ar: 'الإعدادات', icon: 'Settings2', visible: true, order: 13 },
  ],
  owner: [
    { id: 'home', key: 'home', name_en: 'Home', name_ar: 'الرئيسية', icon: 'Home', visible: true, order: 0 },
    { id: 'brokerage', key: 'brokerage', name_en: 'Brokerage', name_ar: 'الوساطة العقارية', icon: 'Handshake', visible: true, order: 1 },
    { id: 'properties', key: 'properties', name_en: 'Properties', name_ar: 'العقارات', icon: 'Building2', visible: true, order: 2 },
    { id: 'payments', key: 'payments', name_en: 'Payments', name_ar: 'المدفوعات', icon: 'Wallet', visible: true, order: 3 },
    { id: 'profile', key: 'profile', name_en: 'Profile', name_ar: 'الملف الشخصي', icon: 'UserRound', visible: true, order: 4 },
    { id: 'security', key: 'security', name_en: 'Security', name_ar: 'الأمان', icon: 'ShieldCheck', visible: true, order: 5 },
    { id: 'support', key: 'support', name_en: 'Support', name_ar: 'الدعم', icon: 'LifeBuoy', visible: true, order: 6 },
  ],
  broker: [
    { id: 'home', key: 'home', name_en: 'Home', name_ar: 'الرئيسية', icon: 'Home', visible: true, order: 0 },
    { id: 'profile', key: 'profile', name_en: 'Broker Profile', name_ar: 'ملف الوسيط', icon: 'UserRound', visible: true, order: 1 },
    { id: 'settings', key: 'settings', name_en: 'Settings', name_ar: 'الإعدادات', icon: 'Settings2', visible: true, order: 2 },
    { id: 'security', key: 'security', name_en: 'Security', name_ar: 'الأمان', icon: 'ShieldCheck', visible: true, order: 3 },
    { id: 'support', key: 'support', name_en: 'Support', name_ar: 'الدعم', icon: 'LifeBuoy', visible: true, order: 4 },
  ],
  company: [
    { id: 'home', key: 'home', name_en: 'Home', name_ar: 'الرئيسية', icon: 'Home', visible: true, order: 0 },
    { id: 'profile', key: 'profile', name_en: 'Company Profile', name_ar: 'ملف الشركة', icon: 'Building2', visible: true, order: 1 },
    { id: 'settings', key: 'settings', name_en: 'Settings', name_ar: 'الإعدادات', icon: 'Settings2', visible: true, order: 2 },
    { id: 'security', key: 'security', name_en: 'Security', name_ar: 'الأمان', icon: 'ShieldCheck', visible: true, order: 3 },
    { id: 'support', key: 'support', name_en: 'Support', name_ar: 'الدعم', icon: 'LifeBuoy', visible: true, order: 4 },
  ],
};

export const DEFAULT_PLANS = [
  {
    id: 'free',
    name_en: 'Free',
    name_ar: 'مجاني',
    price: 0,
    currency: 'USD',
    interval: 'lifetime',
    features_en: ['Basic property management', 'Document storage'],
    features_ar: ['إدارة عقارات أساسية', 'تخزين مستندات'],
    enabled: true,
    locked: true,
  },
  {
    id: 'monthly',
    name_en: 'Monthly',
    name_ar: 'شهري',
    price: 29,
    currency: 'USD',
    interval: 'month',
    features_en: ['Unlimited properties', 'Priority support'],
    features_ar: ['عقارات غير محدودة', 'دعم أولوية'],
    enabled: false,
    locked: false,
  },
  {
    id: 'yearly',
    name_en: 'Yearly',
    name_ar: 'سنوي',
    price: 290,
    currency: 'USD',
    interval: 'year',
    features_en: ['Unlimited properties', '2 months free'],
    features_ar: ['عقارات غير محدودة', 'شهران مجاناً'],
    enabled: false,
    locked: false,
  },
];

export const DEFAULT_ACCOUNT_TYPES = {
  owner: {
    id: 'owner',
    name_en: 'Owner',
    name_ar: 'مالك',
    signup_enabled: true,
    approval_required: false,
    locked: true,
  },
  broker: {
    id: 'broker',
    name_en: 'Broker',
    name_ar: 'وسيط',
    signup_enabled: true,
    approval_required: true,
    locked: true,
  },
  company: {
    id: 'company',
    name_en: 'Brokerage Company',
    name_ar: 'شركة وساطة',
    signup_enabled: true,
    approval_required: true,
    locked: true,
  },
};

export const DEFAULT_FORM_FIELDS = {
  signup: [
    { id: 'name', key: 'name', label_en: 'Full name', label_ar: 'الاسم الكامل', placeholder_en: '', placeholder_ar: '', required: true, visible: true, order: 0, locked: true },
    { id: 'email', key: 'email', label_en: 'Email', label_ar: 'البريد الإلكتروني', placeholder_en: '', placeholder_ar: '', required: true, visible: true, order: 1, locked: true },
    { id: 'phone', key: 'phone', label_en: 'Phone', label_ar: 'رقم الهاتف', placeholder_en: '', placeholder_ar: '', required: false, visible: true, order: 2, locked: false },
    { id: 'password', key: 'password', label_en: 'Password', label_ar: 'كلمة المرور', placeholder_en: '', placeholder_ar: '', required: true, visible: true, order: 3, locked: true },
  ],
  owner_profile: [
    { id: 'name', key: 'name', label_en: 'Name', label_ar: 'الاسم', required: true, visible: true, order: 0, locked: true },
    { id: 'nationality', key: 'nationality', label_en: 'Nationality', label_ar: 'الجنسية', required: false, visible: true, order: 1, locked: false },
    { id: 'gender', key: 'gender', label_en: 'Gender', label_ar: 'الجنس', required: false, visible: true, order: 2, locked: false },
    { id: 'date_of_birth', key: 'date_of_birth', label_en: 'Date of birth', label_ar: 'تاريخ الميلاد', required: false, visible: true, order: 3, locked: false },
  ],
};

export const DEFAULT_SLOGANS = {
  owner: {
    slogan_en: 'Your Properties. Always Followed.',
    slogan_ar: 'عقاراتك تحت المتابعة، دائماً.',
    desc_en: 'A smart platform to manage properties, installments, rentals and payments in one place.',
    desc_ar: 'منصة ذكية تساعدك على إدارة عقاراتك، أقساطك، إيجاراتك ومدفوعاتك من مكان واحد.',
    subline_en: 'Simpler management. Smarter follow-up.',
    subline_ar: 'إدارة أبسط. متابعة أذكى.',
    login_title_en: 'Owner login',
    login_title_ar: 'تسجيل دخول مالك',
    signup_title_en: 'Create owner account',
    signup_title_ar: 'إنشاء حساب مالك',
  },
  broker: {
    slogan_en: 'Grow your presence. Unlock more opportunities.',
    slogan_ar: 'وسّع حضورك، وخلّي فرصك أكبر.',
    desc_en: 'Showcase your professional profile, connect with property owners, and track performance.',
    desc_ar: 'اعرض ملفك المهني، تواصل مع ملاك العقارات، وتابع أداء حسابك من مكان واحد.',
    subline_en: 'Stronger visibility. Easier contact. More deals.',
    subline_ar: 'ظهور أقوى. تواصل أسهل. فرص أكثر.',
    login_title_en: 'Broker login',
    login_title_ar: 'تسجيل دخول وسيط',
    signup_title_en: 'Create broker account',
    signup_title_ar: 'إنشاء حساب وسيط',
  },
  company: {
    slogan_en: 'Present your company to property owners.',
    slogan_ar: 'اعرض شركتك وخدماتك أمام ملاك العقارات.',
    desc_en: 'Introduce owners to your company and services.',
    desc_ar: 'عرّف الملاك بشركتك، خدماتك، وخلّي الوصول ليك أسهل.',
    subline_en: 'Stronger visibility • Direct contact • More business',
    subline_ar: 'ظهور أقوى • تواصل مباشر • فرص أعمال أكثر.',
    login_title_en: 'Brokerage company login',
    login_title_ar: 'تسجيل دخول شركة وساطة',
    signup_title_en: 'Create brokerage company account',
    signup_title_ar: 'إنشاء حساب شركة وساطة',
  },
};

export const DEFAULT_NOTIFICATIONS = {
  reminder: {
    enabled: true,
    title_en: 'Payment reminder',
    title_ar: 'تذكير بالدفع',
    body_en: 'You have a payment due soon.',
    body_ar: 'لديك دفعة تستحق قريباً.',
  },
  status: {
    enabled: true,
    title_en: 'Status update',
    title_ar: 'تحديث الحالة',
    body_en: 'Your submission status has changed.',
    body_ar: 'تم تحديث حالة طلبك.',
  },
  system: {
    enabled: true,
    title_en: 'System notice',
    title_ar: 'إشعار النظام',
    body_en: 'Important platform notice.',
    body_ar: 'إشعار مهم من المنصة.',
  },
  brokerage_approved: {
    enabled: true,
    title_en: 'Brokerage profile approved',
    title_ar: 'تم اعتماد ملف الوساطة',
    body_en: 'Your brokerage profile was approved.',
    body_ar: 'تم اعتماد ملف الوساطة الخاص بك.',
  },
  brokerage_rejected: {
    enabled: true,
    title_en: 'Brokerage profile rejected',
    title_ar: 'تم رفض ملف الوساطة',
    body_en: 'Your brokerage profile was rejected.',
    body_ar: 'تم رفض ملف الوساطة الخاص بك.',
  },
};

export const DEFAULT_FEATURES = {
  ai_document_reader: { enabled: true, name_en: 'AI Document Reader', name_ar: 'قارئ المستندات بالذكاء الاصطناعي' },
  brokerage_directory: { enabled: true, name_en: 'Brokerage Directory', name_ar: 'دليل الوساطة' },
  payment_reminders: { enabled: true, name_en: 'Payment Reminders', name_ar: 'تذكيرات الدفع' },
  analytics_tracking: { enabled: true, name_en: 'Analytics Tracking', name_ar: 'تتبع التحليلات' },
  multi_device_sessions: { enabled: true, name_en: 'Multi-device Sessions', name_ar: 'جلسات متعددة الأجهزة' },
  owner_signup: { enabled: true, name_en: 'Owner Sign-up', name_ar: 'تسجيل الملاك' },
  broker_signup: { enabled: true, name_en: 'Broker Sign-up', name_ar: 'تسجيل الوسطاء' },
  company_signup: { enabled: true, name_en: 'Company Sign-up', name_ar: 'تسجيل الشركات' },
};

export const DEFAULT_APPROVAL = {
  brokers: true,
  companies: true,
  properties: true,
  pending_updates: true,
};

export const DEFAULT_MAINTENANCE = {
  enabled: false,
  message_en: 'We are performing scheduled maintenance. Please check back soon.',
  message_ar: 'نقوم حالياً بأعمال صيانة مجدولة. يرجى العودة لاحقاً.',
};

export const DEFAULT_SEO = {
  site_title_en: 'Estate Follow',
  site_title_ar: 'إستيت فولو',
  brand_name: 'Estate Follow',
  canonical_domain: 'https://estatefollow.com',
  meta_title_en: 'Estate Follow — Smart Property Management',
  meta_title_ar: 'إستيت فولو — منصتك الذكية لإدارة عقاراتك',
  meta_description_en: 'Manage your properties, payments and documents in one smart platform.',
  meta_description_ar: 'أدِر عقاراتك ومدفوعاتك ومستنداتك من منصة ذكية واحدة.',
  og_title: '',
  og_description: '',
  og_image_url: '',
  twitter_card: 'summary_large_image',
  default_language: 'ar',
  supported_languages: ['ar', 'en'],
};

// Public-facing pages that should always have SEO entries. New public pages
// added in the future are auto-merged into seo_pages on load.
export const DEFAULT_SEO_PAGES = [
  { id: 'home', key: 'home', name_en: 'Home', name_ar: 'الرئيسية', url: '/', slug: '', seo_title_en: '', seo_title_ar: '', meta_desc_en: '', meta_desc_ar: '', h1: '', canonical: '', social_image: '', index: true, follow: true, ai_description: '', structured_data: 'WebSite', keywords: [] },
  {
    id: 'about', key: 'about', name_en: 'About Estate Follow', name_ar: 'من نحن', url: '/about', slug: 'about',
    seo_title_en: 'About Estate Follow — Smart Property Management Platform',
    seo_title_ar: 'من نحن | إستيت فولو — منصة ذكية لإدارة العقارات',
    meta_desc_en: 'Estate Follow is a smart property management and real estate portfolio tracking platform for property owners and investors.',
    meta_desc_ar: 'إستيت فولو هي منصة ذكية لإدارة ومتابعة المحفظة العقارية لأصحاب العقارات والمستثمرين.',
    h1: '', canonical: 'https://estatefollow.com/about', social_image: '',
    index: true, follow: true, ai_description: '', structured_data: 'AboutPage',
    keywords: ['من نحن estate follow', 'about estate follow', 'ما هي إستيت فولو', 'estate follow property management'],
  },
  {
    id: 'what-is', key: 'what-is-estate-follow', name_en: 'What is Estate Follow', name_ar: 'ما هي إستيت فولو', url: '/what-is-estate-follow', slug: 'what-is-estate-follow',
    seo_title_en: 'What is Estate Follow? Smart Services for Property Owners',
    seo_title_ar: 'ما هي إستيت فولو؟ خدمات ذكية لإدارة العقارات',
    meta_desc_en: 'What is Estate Follow, who it is for, and how it helps property owners and investors manage properties, installments, rentals and documents.',
    meta_desc_ar: 'ما هي إستيت فولو، لمن هي، وكيف تساعد الملاك والمستثمرين على إدارة العقارات والأقساط والإيجارات والمستندات.',
    h1: '', canonical: 'https://estatefollow.com/what-is-estate-follow', social_image: '',
    index: true, follow: true, ai_description: '', structured_data: 'FAQPage',
    keywords: ['ما هي إستيت فولو', 'what is estate follow', 'كيف أتابع عقاراتي', 'how to track property installments', 'estate follow services'],
  },
  {
    id: 'login', key: 'login', name_en: 'Owner Login', name_ar: 'تسجيل الدخول', url: '/login', slug: 'login',
    seo_title_en: 'Estate Follow Login', seo_title_ar: 'استيت فولو تسجيل الدخول',
    meta_desc_en: 'Secure login to Estate Follow — your smart platform to manage your properties with ease',
    meta_desc_ar: 'دخول آمن إلى منصة Estate Follow — منصتك الذكية لإدارة عقاراتك بكل سهولة',
    h1: '', canonical: 'https://estatefollow.com/login', social_image: '',
    index: true, follow: true, ai_description: '', structured_data: 'LoginAction',
    keywords: ['استيت فولو تسجيل دخول', 'Estate Follow تسجيل دخول', 'تسجيل دخول استيت فولو', 'تسجيل الدخول Estate Follow', 'Estate Follow login', 'Estate Follow sign in', 'login Estate Follow', 'sign in Estate Follow'],
  },
  {
    id: 'signup', key: 'signup', name_en: 'Sign Up', name_ar: 'إنشاء حساب', url: '/signup', slug: 'signup',
    seo_title_en: 'Estate Follow Sign Up', seo_title_ar: 'إنشاء حساب في استيت فولو',
    meta_desc_en: 'Create your Estate Follow account today. Your smart platform to manage your properties with ease',
    meta_desc_ar: 'انضم إلى Estate Follow وأنشئ حسابك الآن. منصتك الذكية لإدارة عقاراتك بكل سهولة',
    h1: '', canonical: 'https://estatefollow.com/signup', social_image: '',
    index: true, follow: true, ai_description: '', structured_data: 'CreateAction',
    keywords: ['استيت فولو إنشاء حساب', 'إنشاء حساب Estate Follow', 'التسجيل في استيت فولو', 'استيت فولو تسجيل جديد', 'Estate Follow sign up', 'Estate Follow register', 'create Estate Follow account', 'Estate Follow create account'],
  },
  {
    id: 'forgot-password', key: 'forgot-password', name_en: 'Forgot Password', name_ar: 'نسيت كلمة المرور', url: '/forgot-password', slug: 'forgot-password',
    seo_title_en: 'Reset Password | Estate Follow', seo_title_ar: 'استعادة كلمة المرور | Estate Follow',
    meta_desc_en: 'Reset your Estate Follow password securely. Follow simple steps to regain access to your account',
    meta_desc_ar: 'استعد كلمة مرورك في Estate Follow بسهولة وأمان. اتبع خطوات بسيطة لاستعادة الوصول إلى حسابك',
    h1: '', canonical: 'https://estatefollow.com/forgot-password', social_image: '',
    index: true, follow: true, ai_description: '', structured_data: 'PasswordResetAction',
    keywords: ['استيت فولو نسيت كلمة المرور', 'نسيت كلمة السر Estate Follow', 'استعادة كلمة مرور استيت فولو', 'تغيير كلمة مرور Estate Follow', 'Estate Follow forgot password', 'Estate Follow reset password', 'reset Estate Follow password', 'Estate Follow password recovery'],
  },
  {
    id: 'admin-portal', key: 'admin-portal', name_en: 'Admin Portal', name_ar: 'بوابة الإدارة', url: '/admin', slug: 'admin',
    seo_title_en: 'Admin Portal | Estate Follow', seo_title_ar: 'بوابة الإدارة | Estate Follow Admin',
    meta_desc_en: 'Estate Follow Admin Portal. Secure access for administrators and staff only',
    meta_desc_ar: 'بوابة الإدارة الآمنة لـ Estate Follow. دخول محدود للمسؤولين والموظفين فقط',
    h1: '', canonical: 'https://estatefollow.com/admin', social_image: '',
    index: true, follow: true, ai_description: '', structured_data: 'WebSite',
    keywords: ['استيت فولو ادمن', 'Estate Follow admin', 'Estate Follow admin login', 'استيت فولو تسجيل دخول الادمن', 'admin portal Estate Follow'],
  },
  // Internal admin pages — always noindex, never in sitemap.
  { id: 'admin-login', key: 'admin-login', name_en: 'Admin Login', name_ar: 'دخول الإدارة', url: '/admin/login', slug: 'admin-login', seo_title_en: '', seo_title_ar: '', meta_desc_en: '', meta_desc_ar: '', h1: '', canonical: '', social_image: '', index: false, follow: false, ai_description: '', structured_data: '', keywords: [] },
  { id: 'admin-forgot', key: 'admin-forgot', name_en: 'Admin Forgot Password', name_ar: 'استعادة كلمة مرور الإدارة', url: '/admin/forgot-password', slug: 'admin-forgot-password', seo_title_en: '', seo_title_ar: '', meta_desc_en: '', meta_desc_ar: '', h1: '', canonical: '', social_image: '', index: false, follow: false, ai_description: '', structured_data: '', keywords: [] },
];

export const DEFAULT_KEYWORDS = [
  { id: 'kw_login_ar1', term: 'استيت فولو تسجيل دخول', lang: 'ar', country: '', page: '/login', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_login_ar2', term: 'Estate Follow تسجيل دخول', lang: 'ar', country: '', page: '/login', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_login_ar3', term: 'تسجيل دخول استيت فولو', lang: 'ar', country: '', page: '/login', type: 'secondary', intent: 'navigational', active: true },
  { id: 'kw_login_ar4', term: 'تسجيل الدخول Estate Follow', lang: 'ar', country: '', page: '/login', type: 'secondary', intent: 'navigational', active: true },
  { id: 'kw_login_en1', term: 'Estate Follow login', lang: 'en', country: '', page: '/login', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_login_en2', term: 'Estate Follow sign in', lang: 'en', country: '', page: '/login', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_login_en3', term: 'login Estate Follow', lang: 'en', country: '', page: '/login', type: 'secondary', intent: 'navigational', active: true },
  { id: 'kw_login_en4', term: 'sign in Estate Follow', lang: 'en', country: '', page: '/login', type: 'secondary', intent: 'navigational', active: true },
  { id: 'kw_signup_ar1', term: 'استيت فولو إنشاء حساب', lang: 'ar', country: '', page: '/signup', type: 'primary', intent: 'transactional', active: true },
  { id: 'kw_signup_ar2', term: 'إنشاء حساب Estate Follow', lang: 'ar', country: '', page: '/signup', type: 'primary', intent: 'transactional', active: true },
  { id: 'kw_signup_ar3', term: 'التسجيل في استيت فولو', lang: 'ar', country: '', page: '/signup', type: 'secondary', intent: 'transactional', active: true },
  { id: 'kw_signup_ar4', term: 'استيت فولو تسجيل جديد', lang: 'ar', country: '', page: '/signup', type: 'secondary', intent: 'transactional', active: true },
  { id: 'kw_signup_en1', term: 'Estate Follow sign up', lang: 'en', country: '', page: '/signup', type: 'primary', intent: 'transactional', active: true },
  { id: 'kw_signup_en2', term: 'Estate Follow register', lang: 'en', country: '', page: '/signup', type: 'primary', intent: 'transactional', active: true },
  { id: 'kw_signup_en3', term: 'create Estate Follow account', lang: 'en', country: '', page: '/signup', type: 'secondary', intent: 'transactional', active: true },
  { id: 'kw_signup_en4', term: 'Estate Follow create account', lang: 'en', country: '', page: '/signup', type: 'secondary', intent: 'transactional', active: true },
  { id: 'kw_forgot_ar1', term: 'استيت فولو نسيت كلمة المرور', lang: 'ar', country: '', page: '/forgot-password', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_forgot_ar2', term: 'نسيت كلمة السر Estate Follow', lang: 'ar', country: '', page: '/forgot-password', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_forgot_ar3', term: 'استعادة كلمة مرور استيت فولو', lang: 'ar', country: '', page: '/forgot-password', type: 'secondary', intent: 'navigational', active: true },
  { id: 'kw_forgot_ar4', term: 'تغيير كلمة مرور Estate Follow', lang: 'ar', country: '', page: '/forgot-password', type: 'secondary', intent: 'navigational', active: true },
  { id: 'kw_forgot_en1', term: 'Estate Follow forgot password', lang: 'en', country: '', page: '/forgot-password', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_forgot_en2', term: 'Estate Follow reset password', lang: 'en', country: '', page: '/forgot-password', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_forgot_en3', term: 'reset Estate Follow password', lang: 'en', country: '', page: '/forgot-password', type: 'secondary', intent: 'navigational', active: true },
  { id: 'kw_forgot_en4', term: 'Estate Follow password recovery', lang: 'en', country: '', page: '/forgot-password', type: 'secondary', intent: 'navigational', active: true },
  { id: 'kw_admin_ar1', term: 'استيت فولو ادمن', lang: 'ar', country: '', page: '/admin', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_admin_ar2', term: 'استيت فولو تسجيل دخول الادمن', lang: 'ar', country: '', page: '/admin', type: 'secondary', intent: 'navigational', active: true },
  { id: 'kw_admin_en1', term: 'Estate Follow admin', lang: 'en', country: '', page: '/admin', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_admin_en2', term: 'Estate Follow admin login', lang: 'en', country: '', page: '/admin', type: 'primary', intent: 'navigational', active: true },
  { id: 'kw_admin_en3', term: 'admin portal Estate Follow', lang: 'en', country: '', page: '/admin', type: 'secondary', intent: 'navigational', active: true },
];

/**
 * Keywords & AI Topics — page groups.
 *
 * Each entry is a "target page" that keywords, AI topics and AI search
 * queries can be linked to. Public pages (Home/Login/Signup/Forgot/Admin)
 * mirror the seo_pages list; internal feature pages (Property Management,
 * Installment Tracking, …) are platform concepts that don't have a public
 * URL but still deserve their own keyword/AI-topic group.
 *
 * `public: true` pages are auto-synced with seo_pages in mergeKeywordAiPages
 * so any new public page created in the future appears here automatically.
 */
export const DEFAULT_KEYWORD_AI_PAGES = [
  { id: 'kwpg_home', key: 'home', name_en: 'Home', name_ar: 'الرئيسية', url: '/', public: true, group: 'general' },
  { id: 'kwpg_login', key: 'login', name_en: 'Login', name_ar: 'تسجيل الدخول', url: '/login', public: true, group: 'auth' },
  { id: 'kwpg_signup', key: 'signup', name_en: 'Sign Up', name_ar: 'إنشاء حساب', url: '/signup', public: true, group: 'auth' },
  { id: 'kwpg_forgot', key: 'forgot-password', name_en: 'Forgot Password', name_ar: 'نسيت كلمة المرور', url: '/forgot-password', public: true, group: 'auth' },
  { id: 'kwpg_admin', key: 'admin-portal', name_en: 'Admin Portal', name_ar: 'بوابة الإدارة', url: '/admin', public: true, group: 'auth' },
  { id: 'kwpg_prop_mgmt', key: 'property-management', name_en: 'Property Management', name_ar: 'إدارة العقارات', url: '/dashboard/properties', public: false, group: 'property' },
  { id: 'kwpg_installment', key: 'installment-tracking', name_en: 'Installment Tracking', name_ar: 'متابعة الأقساط', url: '/dashboard/properties', public: false, group: 'property' },
  { id: 'kwpg_rental', key: 'rental-management', name_en: 'Rental Management', name_ar: 'إدارة الإيجارات', url: '/dashboard/properties', public: false, group: 'property' },
  { id: 'kwpg_docs', key: 'document-management', name_en: 'Document Management', name_ar: 'إدارة المستندات', url: '/dashboard/properties', public: false, group: 'property' },
  { id: 'kwpg_portfolio', key: 'property-portfolio', name_en: 'Property Portfolio Management', name_ar: 'إدارة محفظة العقارات', url: '/dashboard/home', public: false, group: 'property' },
  { id: 'kwpg_brokerage', key: 'brokerage', name_en: 'Brokerage', name_ar: 'الوساطة العقارية', url: '/dashboard/brokerage', public: false, group: 'brokerage' },
  { id: 'kwpg_brokers', key: 'brokers', name_en: 'Brokers', name_ar: 'الوسطاء', url: '/dashboard/brokerage', public: false, group: 'brokerage' },
  { id: 'kwpg_companies', key: 'brokerage-companies', name_en: 'Brokerage Companies', name_ar: 'شركات الوساطة', url: '/dashboard/brokerage', public: false, group: 'brokerage' },
];

// Build a seed keyword/AI-topic/AI-query item with a stable id.
let _kwaiSeedCounter = 0;
function kwaiSeed(kind, term, lang, pageKey, extra = {}) {
  _kwaiSeedCounter += 1;
  return {
    id: `seed_kwai_${_kwaiSeedCounter}`,
    kind, // 'keyword' | 'topic' | 'query'
    term,
    lang, // 'ar' | 'en'
    country: '',
    page: pageKey, // page key from DEFAULT_KEYWORD_AI_PAGES
    role: 'secondary', // for keywords: 'primary' | 'secondary'
    intent: 'informational', // for keywords
    active: true,
    ...extra,
  };
}

/**
 * Seed Keywords & AI Topics for the key Estate Follow pages.
 * Three kinds live in one flat list:
 *   - keyword : Google/Bing search keyword (primary/secondary + intent)
 *   - topic   : AI Topic / Entity Topic
 *   - query   : AI Search Query (real questions people type into AI)
 *
 * No search-volume / competition / ranking / AI-mention numbers are stored —
 * those are never invented (see task requirement #8).
 */
export const DEFAULT_KEYWORD_AI = [
  // ---- Login ----
  kwaiSeed('keyword', 'Estate Follow login', 'en', 'login', { role: 'primary', intent: 'navigational' }),
  kwaiSeed('keyword', 'استيت فولو تسجيل دخول', 'ar', 'login', { role: 'secondary', intent: 'navigational' }),
  kwaiSeed('keyword', 'تسجيل دخول Estate Follow', 'ar', 'login', { role: 'secondary', intent: 'navigational' }),
  kwaiSeed('keyword', 'Estate Follow sign in', 'en', 'login', { role: 'secondary', intent: 'navigational' }),
  kwaiSeed('keyword', 'login Estate Follow', 'en', 'login', { role: 'secondary', intent: 'navigational' }),
  kwaiSeed('topic', 'Estate Follow Login', 'en', 'login'),
  kwaiSeed('topic', 'Estate Follow Account Access', 'en', 'login'),
  kwaiSeed('topic', 'Sign in to Estate Follow', 'en', 'login'),
  kwaiSeed('query', 'How do I log in to Estate Follow?', 'en', 'login'),
  kwaiSeed('query', 'Where can I sign in to Estate Follow?', 'en', 'login'),
  kwaiSeed('query', 'ازاي اسجل دخول في استيت فولو؟', 'ar', 'login'),

  // ---- Sign Up ----
  kwaiSeed('keyword', 'Estate Follow sign up', 'en', 'signup', { role: 'primary', intent: 'transactional' }),
  kwaiSeed('keyword', 'Estate Follow register', 'en', 'signup', { role: 'secondary', intent: 'transactional' }),
  kwaiSeed('keyword', 'استيت فولو إنشاء حساب', 'ar', 'signup', { role: 'secondary', intent: 'transactional' }),
  kwaiSeed('keyword', 'التسجيل في استيت فولو', 'ar', 'signup', { role: 'secondary', intent: 'transactional' }),
  kwaiSeed('topic', 'Create Estate Follow Account', 'en', 'signup'),
  kwaiSeed('topic', 'Estate Follow Registration', 'en', 'signup'),
  kwaiSeed('topic', 'Join Estate Follow', 'en', 'signup'),
  kwaiSeed('query', 'How do I create an Estate Follow account?', 'en', 'signup'),
  kwaiSeed('query', 'ازاي اعمل حساب في Estate Follow؟', 'ar', 'signup'),

  // ---- Forgot Password ----
  kwaiSeed('keyword', 'Estate Follow forgot password', 'en', 'forgot-password', { role: 'primary', intent: 'navigational' }),
  kwaiSeed('keyword', 'Estate Follow reset password', 'en', 'forgot-password', { role: 'secondary', intent: 'navigational' }),
  kwaiSeed('keyword', 'استيت فولو نسيت كلمة المرور', 'ar', 'forgot-password', { role: 'secondary', intent: 'navigational' }),
  kwaiSeed('keyword', 'استعادة كلمة مرور استيت فولو', 'ar', 'forgot-password', { role: 'secondary', intent: 'navigational' }),
  kwaiSeed('topic', 'Estate Follow Password Recovery', 'en', 'forgot-password'),
  kwaiSeed('topic', 'Reset Estate Follow Password', 'en', 'forgot-password'),
  kwaiSeed('topic', 'Account Recovery', 'en', 'forgot-password'),
  kwaiSeed('query', 'I forgot my Estate Follow password, what do I do?', 'en', 'forgot-password'),
  kwaiSeed('query', 'نسيت كلمة السر في استيت فولو اعمل ايه؟', 'ar', 'forgot-password'),

  // ---- Admin Portal ----
  kwaiSeed('keyword', 'Estate Follow admin', 'en', 'admin-portal', { role: 'primary', intent: 'navigational' }),
  kwaiSeed('keyword', 'Estate Follow admin login', 'en', 'admin-portal', { role: 'secondary', intent: 'navigational' }),
  kwaiSeed('keyword', 'استيت فولو ادمن', 'ar', 'admin-portal', { role: 'secondary', intent: 'navigational' }),
  kwaiSeed('keyword', 'تسجيل دخول ادمن Estate Follow', 'ar', 'admin-portal', { role: 'secondary', intent: 'navigational' }),
  kwaiSeed('topic', 'Estate Follow Admin Portal', 'en', 'admin-portal'),
  kwaiSeed('topic', 'Estate Follow Staff Login', 'en', 'admin-portal'),
  kwaiSeed('topic', 'Estate Follow Administration', 'en', 'admin-portal'),
  kwaiSeed('query', 'Where is the Estate Follow admin portal?', 'en', 'admin-portal'),
  kwaiSeed('query', 'فين تسجيل دخول الادمن في Estate Follow؟', 'ar', 'admin-portal'),

  // ---- Home ----
  kwaiSeed('keyword', 'Estate Follow', 'en', 'home', { role: 'primary', intent: 'navigational' }),
  kwaiSeed('keyword', 'استيت فولو', 'ar', 'home', { role: 'primary', intent: 'navigational' }),
  kwaiSeed('keyword', 'property management platform', 'en', 'home', { role: 'secondary', intent: 'informational' }),
  kwaiSeed('topic', 'Estate Follow Platform', 'en', 'home'),
  kwaiSeed('topic', 'Property Management', 'en', 'home'),
  kwaiSeed('query', 'What is Estate Follow?', 'en', 'home'),
  kwaiSeed('query', 'ايه هي استيت فولو؟', 'ar', 'home'),

  // ---- Property Management ----
  kwaiSeed('keyword', 'property management', 'en', 'property-management', { role: 'primary', intent: 'informational' }),
  kwaiSeed('keyword', 'إدارة العقارات', 'ar', 'property-management', { role: 'primary', intent: 'informational' }),
  kwaiSeed('topic', 'Property Management', 'en', 'property-management'),
  kwaiSeed('topic', 'Real Estate Portfolio', 'en', 'property-management'),
  kwaiSeed('query', 'How do I manage my properties on Estate Follow?', 'en', 'property-management'),

  // ---- Installment Tracking ----
  kwaiSeed('keyword', 'installment tracking', 'en', 'installment-tracking', { role: 'primary', intent: 'informational' }),
  kwaiSeed('keyword', 'متابعة الأقساط', 'ar', 'installment-tracking', { role: 'primary', intent: 'informational' }),
  kwaiSeed('topic', 'Installment Tracking', 'en', 'installment-tracking'),
  kwaiSeed('topic', 'Off-plan Payments', 'en', 'installment-tracking'),
  kwaiSeed('query', 'How do I track property installments?', 'en', 'installment-tracking'),

  // ---- Rental Management ----
  kwaiSeed('keyword', 'rental management', 'en', 'rental-management', { role: 'primary', intent: 'informational' }),
  kwaiSeed('keyword', 'إدارة الإيجارات', 'ar', 'rental-management', { role: 'primary', intent: 'informational' }),
  kwaiSeed('topic', 'Rental Management', 'en', 'rental-management'),
  kwaiSeed('topic', 'Tenant Management', 'en', 'rental-management'),
  kwaiSeed('query', 'How do I manage rental contracts and cheques?', 'en', 'rental-management'),

  // ---- Document Management ----
  kwaiSeed('keyword', 'property document management', 'en', 'document-management', { role: 'primary', intent: 'informational' }),
  kwaiSeed('keyword', 'إدارة مستندات العقارات', 'ar', 'document-management', { role: 'primary', intent: 'informational' }),
  kwaiSeed('topic', 'Document Management', 'en', 'document-management'),
  kwaiSeed('topic', 'Secure Document Storage', 'en', 'document-management'),
  kwaiSeed('query', 'Where are my property documents stored?', 'en', 'document-management'),

  // ---- Property Portfolio Management ----
  kwaiSeed('keyword', 'property portfolio management', 'en', 'property-portfolio', { role: 'primary', intent: 'informational' }),
  kwaiSeed('keyword', 'إدارة محفظة العقارات', 'ar', 'property-portfolio', { role: 'primary', intent: 'informational' }),
  kwaiSeed('topic', 'Property Portfolio Management', 'en', 'property-portfolio'),
  kwaiSeed('topic', 'Portfolio Overview', 'en', 'property-portfolio'),
  kwaiSeed('query', 'How do I see an overview of my property portfolio?', 'en', 'property-portfolio'),

  // ---- Brokerage ----
  kwaiSeed('keyword', 'real estate brokerage', 'en', 'brokerage', { role: 'primary', intent: 'commercial' }),
  kwaiSeed('keyword', 'الوساطة العقارية', 'ar', 'brokerage', { role: 'primary', intent: 'commercial' }),
  kwaiSeed('topic', 'Real Estate Brokerage', 'en', 'brokerage'),
  kwaiSeed('topic', 'Brokerage Directory', 'en', 'brokerage'),
  kwaiSeed('query', 'How do I find a trusted real estate broker?', 'en', 'brokerage'),

  // ---- Brokers ----
  kwaiSeed('keyword', 'real estate brokers', 'en', 'brokers', { role: 'primary', intent: 'commercial' }),
  kwaiSeed('keyword', 'وسطاء عقارات', 'ar', 'brokers', { role: 'primary', intent: 'commercial' }),
  kwaiSeed('topic', 'Real Estate Brokers', 'en', 'brokers'),
  kwaiSeed('topic', 'Verified Brokers', 'en', 'brokers'),
  kwaiSeed('query', 'Where can I find verified property brokers?', 'en', 'brokers'),

  // ---- Brokerage Companies ----
  kwaiSeed('keyword', 'brokerage companies', 'en', 'brokerage-companies', { role: 'primary', intent: 'commercial' }),
  kwaiSeed('keyword', 'شركات الوساطة العقارية', 'ar', 'brokerage-companies', { role: 'primary', intent: 'commercial' }),
  kwaiSeed('topic', 'Brokerage Companies', 'en', 'brokerage-companies'),
  kwaiSeed('topic', 'Real Estate Agencies', 'en', 'brokerage-companies'),
  kwaiSeed('query', 'How do I find brokerage companies near me?', 'en', 'brokerage-companies'),
];

// Merge stored keyword_ai_pages with the default page list AND the live
// seo_pages so any new public page appears here automatically, while
// preserving user edits to existing pages.
export function mergeKeywordAiPages(basePages, storedPages, seoPages) {
  const map = new Map();
  basePages.forEach((p) => map.set(p.key, { ...p }));
  (storedPages || []).forEach((p) => {
    if (!p || !p.key) return;
    map.set(p.key, { ...map.get(p.key), ...p });
  });
  (seoPages || []).forEach((sp) => {
    if (!sp || !sp.key) return;
    if (map.has(sp.key)) {
      const existing = map.get(sp.key);
      map.set(sp.key, {
        ...existing,
        name_en: sp.name_en || existing.name_en,
        name_ar: sp.name_ar || existing.name_ar,
        url: sp.url || existing.url,
        public: true,
      });
    } else {
      map.set(sp.key, {
        id: `kwpg_${sp.key}`,
        key: sp.key,
        name_en: sp.name_en || sp.key,
        name_ar: sp.name_ar || sp.key,
        url: sp.url || '',
        public: true,
        group: 'general',
      });
    }
  });
  return Array.from(map.values());
}

export const DEFAULT_AI_SEARCH = {
  ai_description: '',
  entity_summary: '',
  main_topics: [],
  main_services: [],
  key_questions: [],
  ai_topics: [],
  faq_mapping: '',
  source_settings: '',
  ai_friendly_content: '',
  structured_summary: '',
  review_status: 'draft',
};

export const DEFAULT_BRAND_ENTITY = {
  name_en: 'Estate Follow',
  name_ar: 'إستيت فولو',
  display_name: 'إستيت فولو | Estate Follow',
  website: 'https://estatefollow.com',
  logo: '',
  short_desc_ar:
    'إستيت فولو هي منصة ذكية لإدارة ومتابعة المحفظة العقارية — عقارات، أقساط، إيجارات، مدفوعات، عقود، مستندات وتنبيهات من مكان واحد.',
  short_desc_en:
    'Estate Follow is a smart property management and real estate portfolio tracking platform — properties, installments, rentals, payments, contracts, documents and alerts in one place.',
  long_desc_ar:
    'إستيت فولو هي منصة ذكية لإدارة ومتابعة المحفظة العقارية تساعد الملاك على إدارة عقاراتهم ومتابعة الأقساط والإيجارات والمدفوعات والعقود والمستندات والتنبيهات من مكان واحد.',
  long_desc_en:
    'Estate Follow is a smart property management and real estate portfolio tracking platform that helps property owners manage properties, installments, rentals, payments, contracts, documents, and reminders from one place.',
  services_ar: [
    'إدارة المحفظة العقارية',
    'متابعة العقارات',
    'متابعة الأقساط',
    'إدارة الإيجارات',
    'متابعة دفعات الإيجار',
    'تذكيرات المدفوعات',
    'متابعة رسوم الخدمات',
    'إدارة العقود',
    'إدارة مستندات العقارات',
    'بيانات المستأجرين',
    'متابعة العقارات تحت الإنشاء',
    'إدارة العقارات الجاهزة',
    'تقويم العقارات',
    'التنبيهات والمتابعة',
  ],
  services_en: [
    'Property Portfolio Management',
    'Property Tracking',
    'Installment Tracking',
    'Rental Management',
    'Rent Payment Tracking',
    'Property Payment Reminders',
    'Service Charge Tracking',
    'Contract Management',
    'Property Document Management',
    'Tenant Information Management',
    'Off-Plan Property Tracking',
    'Ready Property Management',
    'Property Calendar',
    'Alerts & Follow-up',
  ],
  audience_ar:
    'أصحاب العقارات والمستثمرون الذين يديرون محافظ عقارية (جاهزة، تحت الإنشاء، وإيجارية).',
  audience_en:
    'Property owners and investors managing real estate portfolios (ready, off-plan and rental).',
  countries: ['AE', 'EG', 'GE', 'SA', 'QA'],
  languages: ['ar', 'en'],
  social_profiles: {},
  contact: { email: '', phone: '' },
};

export const DEFAULT_ROBOTS_TXT =
  'User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /admin/\n\nSitemap: https://estatefollow.com/sitemap.xml';

export const DEFAULT_REDIRECTS = [];

export const DEFAULT_SEO_FAQ = [
  {
    id: 'faq_what_is',
    question_ar: 'ما هي إستيت فولو؟',
    question_en: 'What is Estate Follow?',
    answer_ar:
      'إستيت فولو هي منصة ذكية لإدارة ومتابعة المحفظة العقارية تساعد الملاك على إدارة عقاراتهم ومتابعة الأقساط والإيجارات والمدفوعات والعقود والمستندات والتنبيهات من مكان واحد.',
    answer_en:
      'Estate Follow is a smart property management and real estate portfolio tracking platform that helps owners manage properties, installments, rentals, payments, contracts, documents and reminders from one place.',
    page: '/about',
    keywords: 'ما هي إستيت فولو, what is estate follow',
    order: 0,
    visible: true,
  },
  {
    id: 'faq_who_uses',
    question_ar: 'من يمكنه استخدام Estate Follow؟',
    question_en: 'Who can use Estate Follow?',
    answer_ar:
      'أصحاب العقارات والمستثمرون الذين يديرون محافظ عقارية (جاهزة، تحت الإنشاء، وإيجارية).',
    answer_en:
      'Property owners and investors managing real estate portfolios (ready, off-plan and rental).',
    page: '/about',
    keywords: 'من يستخدم estate follow, who uses estate follow',
    order: 1,
    visible: true,
  },
  {
    id: 'faq_property_types',
    question_ar: 'ما أنواع العقارات التي يمكن متابعتها؟',
    question_en: 'What property types can be tracked?',
    answer_ar:
      'يمكن متابعة العقارات الجاهزة، والعقارات تحت الإنشاء (على الخارطة)، والعقارات الإيجارية — مع بيانات المستأجرين والعقود والشيكات.',
    answer_en:
      'You can track ready properties, off-plan properties, and rented properties — including tenant data, contracts and cheques.',
    page: '/about',
    keywords: 'أنواع العقارات, property types estate follow',
    order: 2,
    visible: true,
  },
  {
    id: 'faq_installments',
    question_ar: 'هل يمكن متابعة الأقساط؟',
    question_en: 'Can I track installments?',
    answer_ar:
      'نعم، تتيح المنصة متابعة الأقساط وجدول الدفع وتذكيرات الاستحقاق للعقارات تحت الإنشاء.',
    answer_en:
      'Yes, the platform lets you track installments, payment schedules and due-date reminders for off-plan properties.',
    page: '/what-is-estate-follow',
    keywords: 'متابعة الأقساط, installment tracking estate follow',
    order: 3,
    visible: true,
  },
  {
    id: 'faq_rentals',
    question_ar: 'هل يمكن متابعة الإيجارات؟',
    question_en: 'Can I track rentals?',
    answer_ar:
      'نعم، يمكن إدارة عقود الإيجار ومتابعة الشيكات ودفعات الإيجار وتواريخ انتهاء العقود.',
    answer_en:
      'Yes, you can manage rental contracts and track cheques, rent payments and contract expiry dates.',
    page: '/what-is-estate-follow',
    keywords: 'متابعة الإيجارات, rental tracking estate follow',
    order: 4,
    visible: true,
  },
  {
    id: 'faq_documents',
    question_ar: 'هل يمكن حفظ العقود والمستندات؟',
    question_en: 'Can I save contracts and documents?',
    answer_ar:
      'نعم، توفر المنصة مركز مستندات آمن لحفظ العقود وسندات الملكية والمستندات العقارية مربوطة بكل عقار.',
    answer_en:
      'Yes, the platform provides a secure document center to store contracts, title deeds and property documents linked to each property.',
    page: '/what-is-estate-follow',
    keywords: 'حفظ المستندات, document management estate follow',
    order: 5,
    visible: true,
  },
  {
    id: 'faq_brokerage',
    question_ar: 'هل تصلح Estate Follow لإدارة أنواع عقارات متعددة؟',
    question_en: 'Can Estate Follow manage multiple property types?',
    answer_ar:
      'نعم، تدعم المنصة العقارات الجاهزة، والعقارات تحت الإنشاء (على الخارطة)، والعقارات الإيجارية — مع بيانات المستأجرين والعقود والشيكات وتذكيرات الاستحقاق.',
    answer_en:
      'Yes, the platform supports ready properties, off-plan properties, and rented properties — including tenant data, contracts, cheques and due-date reminders.',
    page: '/what-is-estate-follow',
    keywords: 'إدارة العقارات, property management estate follow',
    order: 6,
    visible: true,
  },
];

export const DEFAULT_CONTENT_HUB = [];

export const DEFAULT_SEO_INTEGRATIONS = {
  // Google Analytics is genuinely live: the gtag.js snippet with this
  // Measurement ID is hardcoded in apps/web/index.html and fires site-wide.
  google_analytics: { enabled: true, verification: 'G-G5N5852F44', settings: '', status: 'connected' },
  // Search Console is verified on Google's side for estatefollow.com; the
  // token is stored here for record-keeping. Status stays "configured" — we
  // cannot confirm external verification from inside the site.
  google_search_console: { enabled: true, verification: '', settings: 'estatefollow.com', status: 'configured' },
  // No GTM container is loaded in index.html; G-G5N5852F44 is a GA4 id, not a
  // GTM container. Left not_connected until a real GTM-XXXXXXX is added.
  google_tag_manager: { enabled: false, verification: '', settings: '', status: 'not_connected' },
  // No Bing verification token provided.
  bing_webmaster: { enabled: false, verification: '', settings: '', status: 'not_connected' },
};

export const DEFAULT_SUPPORT_SETTINGS = {
  support_name_en: 'Support & Help',
  support_name_ar: 'الدعم والمساعدة',
  form_title_en: 'Send Support Request',
  form_title_ar: 'إرسال طلب دعم',
  success_message_en:
    'Your support request has been sent successfully. Our support team will get back to you as soon as possible.',
  success_message_ar:
    'تم إرسال طلبك بنجاح. سيتواصل معك فريق الدعم في أقرب وقت.',
  receiving_email: 'support@estatefollow.com',
};

export const DEFAULT_MARKETING_SETTINGS = {
  feature_enabled: true,
  batch_size: 50,
  email_provider: 'platform',
  signature_default_en: '',
  signature_default_ar: '',
  provider_status: 'platform',
  connection_status: 'connected',
  webhook_status: 'not_configured',
  sender_verification: 'verified',
  tracking_opens: true,
  tracking_clicks: true,
};

export function buildDefaultCms() {
  return {
    version: 1,
    slogans: DEFAULT_SLOGANS,
    pages: DEFAULT_PAGES,
    cards: DEFAULT_CARDS,
    sidebar: DEFAULT_SIDEBAR,
    plans: DEFAULT_PLANS,
    subscription_system_enabled: false,
    account_types: DEFAULT_ACCOUNT_TYPES,
    forms: DEFAULT_FORM_FIELDS,
    geo: {
      disabled_countries: [],
      custom_cities: {},
      languages: [
        { id: 'ar', code: 'ar', name_en: 'Arabic', name_ar: 'العربية', enabled: true, order: 0, locked: true },
        { id: 'en', code: 'en', name_en: 'English', name_ar: 'الإنجليزية', enabled: true, order: 1, locked: true },
      ],
    },
    specializations: [
      { id: 'resale', en: 'Resale', ar: 'إعادة بيع', locked: true },
      { id: 'rental', en: 'Rental', ar: 'تأجير', locked: true },
      { id: 'off_plan', en: 'Off-plan', ar: 'على الخارطة', locked: true },
      { id: 'land_sales', en: 'Land Sales', ar: 'بيع الأراضي', locked: true },
      { id: 'building_sales', en: 'Building Sales', ar: 'بيع البنايات', locked: true },
    ],
    notifications: DEFAULT_NOTIFICATIONS,
    approval: DEFAULT_APPROVAL,
    features: DEFAULT_FEATURES,
    maintenance: DEFAULT_MAINTENANCE,
    seo: DEFAULT_SEO,
    seo_pages: DEFAULT_SEO_PAGES,
    keywords: DEFAULT_KEYWORDS,
    keyword_ai_pages: DEFAULT_KEYWORD_AI_PAGES,
    keyword_ai: DEFAULT_KEYWORD_AI,
    ai_search: DEFAULT_AI_SEARCH,
    brand_entity: DEFAULT_BRAND_ENTITY,
    robots_txt: DEFAULT_ROBOTS_TXT,
    redirects: DEFAULT_REDIRECTS,
    seo_faq: DEFAULT_SEO_FAQ,
    content_hub: DEFAULT_CONTENT_HUB,
    seo_integrations: DEFAULT_SEO_INTEGRATIONS,
    support_settings: DEFAULT_SUPPORT_SETTINGS,
    marketing_settings: DEFAULT_MARKETING_SETTINGS,
  };
}

export function mergeCms(raw) {
  const base = buildDefaultCms();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    slogans: { ...base.slogans, ...(raw.slogans || {}) },
    pages: Array.isArray(raw.pages) && raw.pages.length ? raw.pages : base.pages,
    cards: Array.isArray(raw.cards) && raw.cards.length ? raw.cards : base.cards,
    sidebar: { ...base.sidebar, ...(raw.sidebar || {}) },
    plans: Array.isArray(raw.plans) && raw.plans.length ? raw.plans : base.plans,
    account_types: { ...base.account_types, ...(raw.account_types || {}) },
    forms: { ...base.forms, ...(raw.forms || {}) },
    geo: { ...base.geo, ...(raw.geo || {}) },
    specializations:
      Array.isArray(raw.specializations) && raw.specializations.length
        ? raw.specializations
        : base.specializations,
    notifications: { ...base.notifications, ...(raw.notifications || {}) },
    approval: { ...base.approval, ...(raw.approval || {}) },
    features: { ...base.features, ...(raw.features || {}) },
    maintenance: { ...base.maintenance, ...(raw.maintenance || {}) },
    seo: { ...base.seo, ...(raw.seo || {}) },
    seo_pages: Array.isArray(raw.seo_pages) ? mergeSeoPages(base.seo_pages, raw.seo_pages) : base.seo_pages,
    keywords: Array.isArray(raw.keywords) ? raw.keywords : base.keywords,
    keyword_ai_pages: Array.isArray(raw.keyword_ai_pages)
      ? mergeKeywordAiPages(base.keyword_ai_pages, raw.keyword_ai_pages, Array.isArray(raw.seo_pages) ? raw.seo_pages : base.seo_pages)
      : base.keyword_ai_pages,
    keyword_ai: Array.isArray(raw.keyword_ai) ? raw.keyword_ai : base.keyword_ai,
    ai_search: { ...base.ai_search, ...(raw.ai_search || {}) },
    brand_entity: { ...base.brand_entity, ...(raw.brand_entity || {}) },
    robots_txt: typeof raw.robots_txt === 'string' ? raw.robots_txt : base.robots_txt,
    redirects: Array.isArray(raw.redirects) ? raw.redirects : base.redirects,
    seo_faq: Array.isArray(raw.seo_faq) ? raw.seo_faq : base.seo_faq,
    content_hub: Array.isArray(raw.content_hub) ? raw.content_hub : base.content_hub,
    seo_integrations: { ...base.seo_integrations, ...(raw.seo_integrations || {}) },
    support_settings: { ...base.support_settings, ...(raw.support_settings || {}) },
    marketing_settings: { ...base.marketing_settings, ...(raw.marketing_settings || {}) },
  };
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// Merge stored seo_pages with the default public-page list so any new public
// page added in the future appears automatically, while preserving user edits.
export function mergeSeoPages(basePages, storedPages) {
  const map = new Map();
  basePages.forEach((p) => map.set(p.id, { ...p }));
  storedPages.forEach((p) => {
    if (!p || !p.id) return;
    map.set(p.id, { ...map.get(p.id), ...p });
  });
  return Array.from(map.values());
}
