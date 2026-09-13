/// <reference path="../pb_data/types.d.ts" />

// Backfill Brand Entity defaults + seed public FAQ (v2).
//
// The previous backfill (1788128000) mutated the Go-backed JSON value returned
// by rec.get('cms') directly, which did not persist nested arrays/objects
// reliably. This migration deep-clones cms into a plain JS object first, then
// backfills any missing official Brand Entity fields and seeds the public FAQ
// when empty.

migrate(
  (app) => {
    const OFFICIAL_BRAND = {
      name_en: 'Estate Follow',
      name_ar: 'إستيت فولو',
      display_name: 'إستيت فولو | Estate Follow',
      website: 'https://estatefollow.com',
      short_desc_ar:
        'إستيت فولو هي منصة لإدارة ومتابعة المحفظة العقارية — عقارات، أقساط، إيجارات، مدفوعات، عقود، مستندات وتنبيهات من مكان واحد، مع وصول إلى الوسطاء وشركات الوساطة العقارية الموثوقة.',
      short_desc_en:
        'Estate Follow is a property management and real estate portfolio tracking platform — properties, installments, rentals, payments, contracts, documents and alerts in one place, with access to verified real estate brokers and brokerage companies.',
      long_desc_ar:
        'إستيت فولو هي منصة لإدارة ومتابعة المحفظة العقارية تساعد الملاك على إدارة عقاراتهم ومتابعة الأقساط والإيجارات والمدفوعات والعقود والمستندات والتنبيهات من مكان واحد، بالإضافة إلى الوصول إلى الوسطاء وشركات الوساطة العقارية الموثوقة.',
      long_desc_en:
        'Estate Follow is a property management and real estate portfolio tracking platform that helps property owners manage properties, installments, rentals, payments, contracts, documents, and reminders from one place, while also providing access to verified real estate brokers and brokerage companies.',
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
        'دليل الوسطاء العقاريين',
        'دليل شركات الوساطة',
        'CRM للوسطاء وشركات الوساطة',
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
        'Verified Broker Directory',
        'Brokerage Company Directory',
        'CRM tools for brokers and brokerage companies',
      ],
      audience_ar:
        'أصحاب العقارات والمستثمرون الذين يديرون محافظ عقارية (جاهزة، تحت الإنشاء، وإيجارية)، والوسطاء العقاريون، وشركات الوساطة العقارية.',
      audience_en:
        'Property owners and investors managing real estate portfolios (ready, off-plan and rental), real estate brokers, and brokerage companies.',
      countries: ['AE', 'EG', 'GE', 'SA', 'QA'],
      languages: ['ar', 'en'],
    };

    const DEFAULT_FAQ = [
      { id: 'faq_what_is', question_ar: 'ما هي إستيت فولو؟', question_en: 'What is Estate Follow?', answer_ar: 'إستيت فولو هي منصة لإدارة ومتابعة المحفظة العقارية تساعد الملاك على إدارة عقاراتهم ومتابعة الأقساط والإيجارات والمدفوعات والعقود والمستندات والتنبيهات من مكان واحد، مع الوصول إلى الوسطاء وشركات الوساطة العقارية الموثوقة.', answer_en: 'Estate Follow is a property management and real estate portfolio tracking platform that helps owners manage properties, installments, rentals, payments, contracts, documents and reminders from one place, with access to verified real estate brokers and brokerage companies.', page: '/about', keywords: 'ما هي إستيت فولو, what is estate follow', order: 0, visible: true },
      { id: 'faq_who_uses', question_ar: 'من يمكنه استخدام Estate Follow؟', question_en: 'Who can use Estate Follow?', answer_ar: 'أصحاب العقارات والمستثمرون الذين يديرون محافظ عقارية (جاهزة، تحت الإنشاء، وإيجارية)، بالإضافة إلى الوسطاء العقاريين وشركات الوساطة العقارية.', answer_en: 'Property owners and investors managing real estate portfolios (ready, off-plan and rental), as well as real estate brokers and brokerage companies.', page: '/about', keywords: 'من يستخدم estate follow, who uses estate follow', order: 1, visible: true },
      { id: 'faq_property_types', question_ar: 'ما أنواع العقارات التي يمكن متابعتها؟', question_en: 'What property types can be tracked?', answer_ar: 'يمكن متابعة العقارات الجاهزة، والعقارات تحت الإنشاء (على الخارطة)، والعقارات الإيجارية — مع بيانات المستأجرين والعقود والشيكات.', answer_en: 'You can track ready properties, off-plan properties, and rented properties — including tenant data, contracts and cheques.', page: '/about', keywords: 'أنواع العقارات, property types estate follow', order: 2, visible: true },
      { id: 'faq_installments', question_ar: 'هل يمكن متابعة الأقساط؟', question_en: 'Can I track installments?', answer_ar: 'نعم، تتيح المنصة متابعة الأقساط وجدول الدفع وتذكيرات الاستحقاق للعقارات تحت الإنشاء.', answer_en: 'Yes, the platform lets you track installments, payment schedules and due-date reminders for off-plan properties.', page: '/what-is-estate-follow', keywords: 'متابعة الأقساط, installment tracking estate follow', order: 3, visible: true },
      { id: 'faq_rentals', question_ar: 'هل يمكن متابعة الإيجارات؟', question_en: 'Can I track rentals?', answer_ar: 'نعم، يمكن إدارة عقود الإيجار ومتابعة الشيكات ودفعات الإيجار وتواريخ انتهاء العقود.', answer_en: 'Yes, you can manage rental contracts and track cheques, rent payments and contract expiry dates.', page: '/what-is-estate-follow', keywords: 'متابعة الإيجارات, rental tracking estate follow', order: 4, visible: true },
      { id: 'faq_documents', question_ar: 'هل يمكن حفظ العقود والمستندات؟', question_en: 'Can I save contracts and documents?', answer_ar: 'نعم، توفر المنصة مركز مستندات آمن لحفظ العقود وسندات الملكية والمستندات العقارية مربوطة بكل عقار.', answer_en: 'Yes, the platform provides a secure document center to store contracts, title deeds and property documents linked to each property.', page: '/what-is-estate-follow', keywords: 'حفظ المستندات, document management estate follow', order: 5, visible: true },
      { id: 'faq_brokerage', question_ar: 'هل يمكن الوصول إلى الوسطاء وشركات الوساطة؟', question_en: 'Can I access brokers and brokerage companies?', answer_ar: 'نعم، تضم المنصة دليلًا للوسطاء العقاريين وشركات الوساطة الموثوقة للوصول إليهم والتواصل معهم مباشرة.', answer_en: 'Yes, the platform includes a verified directory of real estate brokers and brokerage companies you can reach and contact directly.', page: '/what-is-estate-follow', keywords: 'دليل الوسطاء, brokerage directory estate follow', order: 6, visible: true },
    ];

    let rows = [];
    try {
      rows = app.findAllRecords('platform_settings');
    } catch (_) {
      rows = [];
    }

    rows.forEach((rec) => {
      // Deep-clone into a plain JS object so nested arrays/objects persist.
      let cms;
      try {
        cms = JSON.parse(JSON.stringify(rec.get('cms') || {}));
      } catch (_) {
        cms = {};
      }

      let changed = false;

      // ---- backfill Brand Entity defaults for any missing field ----
      let be = cms.brand_entity || {};
      Object.keys(OFFICIAL_BRAND).forEach((k) => {
        const cur = be[k];
        const isEmpty =
          cur === undefined ||
          cur === null ||
          cur === '' ||
          (Array.isArray(cur) && cur.length === 0);
        if (isEmpty) {
          be[k] = OFFICIAL_BRAND[k];
          changed = true;
        }
      });
      if (!be.contact || typeof be.contact !== 'object') be.contact = { email: '', phone: '' };
      if (!be.social_profiles || typeof be.social_profiles !== 'object') be.social_profiles = {};
      cms.brand_entity = be;

      // ---- seed FAQ only if the stored list is empty ----
      if (!Array.isArray(cms.seo_faq) || cms.seo_faq.length === 0) {
        cms.seo_faq = DEFAULT_FAQ;
        changed = true;
      }

      if (changed) {
        rec.set('cms', cms);
        app.save(rec);
      }
    });
  },
  (app) => {
    // Non-destructive: leave seeded brand/FAQ in place.
  },
);
