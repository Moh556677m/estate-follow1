/// <reference path="../pb_data/types.d.ts" />

// Estate Follow Insights — CMS enhancements:
//  1. insights_templates collection (Create From Template)
//  2. sections json field on insights_pages (Page Builder)
//  3. blocked_words json field on insights_settings (spam protection)
//  4. Seed built-in templates
//  5. Remove 'countries' from any seeded homepage_sections config
migrate(
  (app) => {
    /* ---- 1. insights_templates collection ---- */
    let templates;
    try {
      templates = app.findCollectionByNameOrId('insights_templates');
    } catch (_) {
      templates = new Collection({
        type: 'base',
        name: 'insights_templates',
        listRule: '@request.auth.is_super_admin = true || @request.auth.role != ""',
        viewRule: '@request.auth.is_super_admin = true || @request.auth.role != ""',
        createRule: '@request.auth.is_super_admin = true || @request.auth.role != ""',
        updateRule: '@request.auth.is_super_admin = true || @request.auth.role != ""',
        deleteRule: '@request.auth.is_super_admin = true',
        fields: [
          { name: 'name_ar', type: 'text', required: true, max: 120 },
          { name: 'name_en', type: 'text', required: true, max: 120 },
          { name: 'description_ar', type: 'text', max: 500 },
          { name: 'description_en', type: 'text', max: 500 },
          { name: 'content_type', type: 'text', required: true, max: 40 },
          { name: 'content_ar', type: 'editor', maxSize: 5000000 },
          { name: 'content_en', type: 'editor', maxSize: 5000000 },
          { name: 'is_builtin', type: 'bool' },
          { name: 'icon', type: 'text', max: 40 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      });
      app.save(templates);
    }

    /* ---- 2. sections field on insights_pages ---- */
    try {
      const pages = app.findCollectionByNameOrId('insights_pages');
      if (!pages.fields.getByName('sections')) {
        pages.fields.add(new JSONField({ name: 'sections', maxSize: 500000 }));
        app.save(pages);
      }
    } catch (e) {
      if (!String(e).includes('no rows')) throw e;
    }

    /* ---- 3. blocked_words on insights_settings ---- */
    try {
      const settings = app.findCollectionByNameOrId('insights_settings');
      if (!settings.fields.getByName('blocked_words')) {
        settings.fields.add(new JSONField({ name: 'blocked_words', maxSize: 200000 }));
        app.save(settings);
      }
      if (!settings.fields.getByName('spam_protection')) {
        settings.fields.add(new BoolField({ name: 'spam_protection' }));
        app.save(settings);
      }
    } catch (e) {
      if (!String(e).includes('no rows')) throw e;
    }

    /* ---- 4. Seed built-in templates (idempotent by name_en) ---- */
    const builtin = [
      {
        name_ar: 'مقال قياسي',
        name_en: 'Standard Article',
        description_ar: 'قالب مقال عام بمقدمة وفقرات وخاتمة.',
        description_en: 'General article template with intro, body and conclusion.',
        content_type: 'article',
        icon: 'FileText',
        content_ar: '<h2>المقدمة</h2><p>اكتب هنا مقدمة المقال...</p><h2>النقاط الرئيسية</h2><p>اكتب هنا المحتوى الرئيسي...</p><h2>الخلاصة</h2><p>اكتب هنا الخلاصة...</p>',
        content_en: '<h2>Introduction</h2><p>Write your intro here...</p><h2>Main Points</h2><p>Write the main content here...</p><h2>Conclusion</h2><p>Write your conclusion here...</p>',
      },
      {
        name_ar: 'خبر',
        name_en: 'News Article',
        description_ar: 'قالب خبر سريع بتاريخ ومصدر.',
        description_en: 'Quick news template with date and source.',
        content_type: 'news',
        icon: 'Newspaper',
        content_ar: '<p>اكتب هنا نص الخبر...</p><h2>التفاصيل</h2><p>التفاصيل الإضافية...</p>',
        content_en: '<p>Write the news text here...</p><h2>Details</h2><p>Additional details...</p>',
      },
      {
        name_ar: 'تحديث قانوني',
        name_en: 'Legal Update',
        description_ar: 'قالب تحديث قانوني مع بنود ومراجع.',
        description_en: 'Legal update template with clauses and references.',
        content_type: 'legal_update',
        icon: 'Scale',
        content_ar: '<h2>ملخص التحديث</h2><p>...</p><h2>البنود الرئيسية</h2><ul><li>...</li></ul><h2>المصادر</h2><p>...</p>',
        content_en: '<h2>Update Summary</h2><p>...</p><h2>Key Clauses</h2><ul><li>...</li></ul><h2>Sources</h2><p>...</p>',
      },
      {
        name_ar: 'دليل',
        name_en: 'Guide',
        description_ar: 'قالب دليل خطوة بخطوة.',
        description_en: 'Step-by-step guide template.',
        content_type: 'guide',
        icon: 'BookOpen',
        content_ar: '<h2>نظرة عامة</h2><p>...</p><h2>الخطوة 1</h2><p>...</p><h2>الخطوة 2</h2><p>...</p>',
        content_en: '<h2>Overview</h2><p>...</p><h2>Step 1</h2><p>...</p><h2>Step 2</h2><p>...</p>',
      },
      {
        name_ar: 'مقال فيديو',
        name_en: 'Video Article',
        description_ar: 'قالب مقال يركز على الفيديو.',
        description_en: 'Video-focused article template.',
        content_type: 'video',
        icon: 'Video',
        content_ar: '<p>وصف الفيديو...</p><h2>أبرز النقاط</h2><ul><li>...</li></ul>',
        content_en: '<p>Video description...</p><h2>Key Moments</h2><ul><li>...</li></ul>',
      },
      {
        name_ar: 'إعلان رسمي',
        name_en: 'Announcement',
        description_ar: 'قالب بيان أو إعلان رسمي.',
        description_en: 'Official announcement template.',
        content_type: 'official_statement',
        icon: 'Megaphone',
        content_ar: '<p>نص الإعلان الرسمي...</p><h2>التفاصيل</h2><p>...</p>',
        content_en: '<p>Official announcement text...</p><h2>Details</h2><p>...</p>',
      },
    ];

    for (const t of builtin) {
      let exists = false;
      try {
        app.findFirstRecordByFilter('insights_templates', `name_en = '${t.name_en.replace(/'/g, '')}'`);
        exists = true;
      } catch (_) { /* not found */ }
      if (exists) continue;
      const r = new Record(templates);
      r.set('name_ar', t.name_ar);
      r.set('name_en', t.name_en);
      r.set('description_ar', t.description_ar);
      r.set('description_en', t.description_en);
      r.set('content_type', t.content_type);
      r.set('content_ar', t.content_ar);
      r.set('content_en', t.content_en);
      r.set('is_builtin', true);
      r.set('icon', t.icon);
      app.save(r);
    }

    /* ---- 5. Remove 'countries' from homepage_sections on existing settings ---- */
    try {
      const rows = app.findRecordsByFilter('insights_settings', "id != ''");
      for (const s of rows) {
        let sections = s.get('homepage_sections');
        if (!sections) continue;
        let arr;
        try { arr = typeof sections === 'string' ? JSON.parse(sections) : sections; } catch (_) { continue; }
        if (!Array.isArray(arr)) continue;
        const filtered = arr.filter((sec) => sec && sec.key !== 'countries');
        if (filtered.length !== arr.length) {
          s.set('homepage_sections', JSON.stringify(filtered));
          app.save(s);
        }
      }
    } catch (e) {
      if (!String(e).includes('no rows')) {
        // non-fatal — settings may be empty
      }
    }
  },
  (app) => {
    try {
      const templates = app.findCollectionByNameOrId('insights_templates');
      app.delete(templates);
    } catch (e) {
      if (!String(e).includes('no rows')) throw e;
    }
    try {
      const pages = app.findCollectionByNameOrId('insights_pages');
      pages.fields.removeByName('sections');
      app.save(pages);
    } catch (e) {
      if (!String(e).includes('no rows')) throw e;
    }
    try {
      const settings = app.findCollectionByNameOrId('insights_settings');
      settings.fields.removeByName('blocked_words');
      settings.fields.removeByName('spam_protection');
      app.save(settings);
    } catch (e) {
      if (!String(e).includes('no rows')) throw e;
    }
  },
);
