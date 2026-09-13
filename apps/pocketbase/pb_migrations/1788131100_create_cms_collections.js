/// <reference path="../pb_data/types.d.ts" />

// Estate Follow Insights — Full CMS control center.
// Adds: pages, banners (placements + custom slots + scheduling + per-banner
// analytics), menu items (header/footer), media library, audit log, site
// settings, banner events (impressions/clicks). Extends `editors` with
// is_primary / suspended / force_password_change / status. Seeds the
// undeletable Primary Content Admin account.

migrate(
  (app) => {
    // ---- extend editors collection ----
    let editors;
    try {
      editors = app.findCollectionByNameOrId("editors");
    } catch (_) {
      throw new Error("editors collection not found — run create_insights_content first");
    }

    if (!editors.fields.getByName("is_primary")) {
      editors.fields.add(new BoolField({ name: "is_primary" }));
    }
    if (!editors.fields.getByName("suspended")) {
      editors.fields.add(new BoolField({ name: "suspended" }));
    }
    if (!editors.fields.getByName("force_password_change")) {
      editors.fields.add(new BoolField({ name: "force_password_change" }));
    }
    if (!editors.fields.getByName("status")) {
      editors.fields.add(
        new SelectField({
          name: "status",
          maxSelect: 1,
          values: ["active", "inactive", "suspended"],
        }),
      );
    }
    // Tighten: only Super Admin or a Primary Content Admin can manage editors.
    editors.createRule = "@request.auth.is_super_admin = true";
    editors.updateRule =
      "id = @request.auth.id || @request.auth.is_super_admin = true";
    // Primary Content Admin can never be deleted (is_primary on the record).
    editors.deleteRule =
      "@request.auth.is_super_admin = true && is_primary != true";
    app.save(editors);

    // ---- insights_pages ----
    let pages;
    try {
      pages = app.findCollectionByNameOrId("insights_pages");
    } catch (_) {
      pages = new Collection({
        type: "base",
        name: "insights_pages",
        listRule: "status = 'published' || @request.auth.id != ''",
        viewRule: "status = 'published' || @request.auth.id != ''",
        createRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          { name: "title_ar", type: "text", max: 200 },
          { name: "title_en", type: "text", max: 200 },
          { name: "slug", type: "text", required: true, max: 200 },
          { name: "page_type", type: "select", maxSelect: 1, values: ["static", "landing", "legal", "about", "contact", "custom"] },
          { name: "content_ar", type: "editor", maxSize: 5000000 },
          { name: "content_en", type: "editor", maxSize: 5000000 },
          { name: "hero_ar", type: "text", max: 300 },
          { name: "hero_en", type: "text", max: 300 },
          {
            name: "image",
            type: "file",
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          },
          { name: "seo_title_ar", type: "text", max: 200 },
          { name: "seo_title_en", type: "text", max: 200 },
          { name: "meta_description_ar", type: "text", max: 500 },
          { name: "meta_description_en", type: "text", max: 500 },
          { name: "show_in_header", type: "bool" },
          { name: "show_in_footer", type: "bool" },
          { name: "indexable", type: "bool" },
          { name: "is_core", type: "bool" },
          { name: "order", type: "number", min: 0 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["draft", "published", "unpublished", "hidden", "archived"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_insights_pages_slug ON insights_pages (slug)",
          "CREATE INDEX idx_insights_pages_status ON insights_pages (status)",
        ],
      });
      app.save(pages);
    }

    // ---- insights_banners ----
    let banners;
    try {
      banners = app.findCollectionByNameOrId("insights_banners");
    } catch (_) {
      banners = new Collection({
        type: "base",
        name: "insights_banners",
        listRule: "status = 'active' || @request.auth.id != ''",
        viewRule: "status = 'active' || @request.auth.id != ''",
        createRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          { name: "name", type: "text", required: true, max: 120 },
          { name: "ad_type", type: "select", required: true, maxSelect: 1, values: ["manual", "adsense"] },
          {
            name: "image",
            type: "file",
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          },
          {
            name: "mobile_image",
            type: "file",
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          },
          { name: "alt_text", type: "text", max: 200 },
          { name: "link_url", type: "url", max: 500 },
          { name: "open_new_tab", type: "bool" },
          { name: "start_date", type: "date" },
          { name: "end_date", type: "date" },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["active", "paused", "expired", "draft"],
          },
          { name: "priority", type: "number", min: 0 },
          { name: "target_language", type: "select", maxSelect: 1, values: ["all", "ar", "en"] },
          { name: "target_country", type: "text", max: 10 },
          { name: "placement", type: "select", required: true, maxSelect: 1, values: [
            "header_banner", "below_header", "above_search", "below_search",
            "home_hero", "between_cards", "above_latest", "below_latest",
            "sidebar", "article_top", "article_middle", "article_bottom",
            "above_comments", "footer", "custom_slot",
          ] },
          { name: "custom_slot", type: "text", max: 80 },
          { name: "adsense_slot", type: "text", max: 60 },
          { name: "responsive", type: "bool" },
          { name: "lazy_load", type: "bool" },
          { name: "impressions", type: "number", min: 0 },
          { name: "clicks", type: "number", min: 0 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_insights_banners_placement ON insights_banners (placement, status)",
          "CREATE INDEX idx_insights_banners_slot ON insights_banners (custom_slot)",
        ],
      });
      app.save(banners);
    }

    // ---- insights_banner_events (impressions / clicks tracking) ----
    let bannerEvents;
    try {
      bannerEvents = app.findCollectionByNameOrId("insights_banner_events");
    } catch (_) {
      bannerEvents = new Collection({
        type: "base",
        name: "insights_banner_events",
        listRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        viewRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        createRule: "",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          { name: "banner", type: "text", required: true, max: 30 },
          { name: "event", type: "select", required: true, maxSelect: 1, values: ["impression", "click"] },
          { name: "placement", type: "text", max: 80 },
          { name: "reader_id", type: "text", max: 60 },
          { name: "country", type: "text", max: 10 },
          { name: "device", type: "text", max: 20 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
        indexes: [
          "CREATE INDEX idx_insights_bevents_banner ON insights_banner_events (banner, event, created)",
        ],
      });
      app.save(bannerEvents);
    }

    // ---- insights_menu_items (header + footer) ----
    let menu;
    try {
      menu = app.findCollectionByNameOrId("insights_menu_items");
    } catch (_) {
      menu = new Collection({
        type: "base",
        name: "insights_menu_items",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          { name: "label_ar", type: "text", required: true, max: 80 },
          { name: "label_en", type: "text", required: true, max: 80 },
          { name: "url", type: "text", required: true, max: 300 },
          { name: "location", type: "select", required: true, maxSelect: 1, values: ["header", "footer"] },
          { name: "order", type: "number", min: 0 },
          { name: "visible", type: "bool" },
          { name: "open_new_tab", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_insights_menu_location ON insights_menu_items (location, order)",
        ],
      });
      app.save(menu);
    }

    // ---- insights_media (media library) ----
    let media;
    try {
      media = app.findCollectionByNameOrId("insights_media");
    } catch (_) {
      media = new Collection({
        type: "base",
        name: "insights_media",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          {
            name: "file",
            type: "file",
            required: true,
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "application/pdf"],
          },
          { name: "name", type: "text", max: 200 },
          { name: "type", type: "select", maxSelect: 1, values: ["image", "video", "pdf", "file"] },
          { name: "alt_text", type: "text", max: 300 },
          { name: "caption", type: "text", max: 500 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [],
      });
      app.save(media);
    }

    // ---- insights_audit_log ----
    let audit;
    try {
      audit = app.findCollectionByNameOrId("insights_audit_log");
    } catch (_) {
      audit = new Collection({
        type: "base",
        name: "insights_audit_log",
        listRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        viewRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "actor", type: "text", max: 120 },
          { name: "actor_email", type: "text", max: 200 },
          { name: "action", type: "text", required: true, max: 80 },
          { name: "entity", type: "text", max: 80 },
          { name: "entity_id", type: "text", max: 30 },
          { name: "details", type: "json", maxSize: 200000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
        indexes: [
          "CREATE INDEX idx_insights_audit_created ON insights_audit_log (created)",
          "CREATE INDEX idx_insights_audit_entity ON insights_audit_log (entity, action)",
        ],
      });
      app.save(audit);
    }

    // ---- insights_settings (single source of truth for the portal) ----
    let settings;
    try {
      settings = app.findCollectionByNameOrId("insights_settings");
    } catch (_) {
      settings = new Collection({
        type: "base",
        name: "insights_settings",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "site_name_ar", type: "text", max: 120 },
          { name: "site_name_en", type: "text", max: 120 },
          { name: "logo_url", type: "text", max: 500 },
          { name: "default_language", type: "select", maxSelect: 1, values: ["ar", "en"] },
          { name: "contact_email", type: "email" },
          { name: "social_links", type: "json", maxSize: 200000 },
          { name: "default_seo_image", type: "text", max: 500 },
          { name: "comments_enabled", type: "bool" },
          { name: "ads_enabled", type: "bool" },
          { name: "analytics_integration", type: "json", maxSize: 200000 },
          { name: "search_settings", type: "json", maxSize: 200000 },
          { name: "homepage_sections", type: "json", maxSize: 500000 },
          { name: "footer_text_ar", type: "text", max: 500 },
          { name: "footer_text_en", type: "text", max: 500 },
          { name: "copyright_text", type: "text", max: 200 },
          { name: "editor_login_logo", type: "text", max: 500 },
          { name: "editor_portal_name", type: "text", max: 120 },
          { name: "editor_login_subtitle_ar", type: "text", max: 300 },
          { name: "editor_login_subtitle_en", type: "text", max: 300 },
          { name: "editor_login_bg", type: "text", max: 500 },
          { name: "editor_help_text_ar", type: "text", max: 500 },
          { name: "editor_help_text_en", type: "text", max: 500 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [],
      });
      app.save(settings);
    }

    // ---- seed default settings row ----
    let settingsRow = null;
    try {
      const rows = app.findRecordsByFilter("insights_settings", "1 = 1", "", 1);
      settingsRow = rows && rows.length ? rows[0] : null;
    } catch (_) { /* none yet */ }
    if (!settingsRow) {
      const rec = new Record(settings);
      rec.set("site_name_ar", "إستيت فولو Insights");
      rec.set("site_name_en", "Estate Follow Insights");
      rec.set("default_language", "ar");
      rec.set("comments_enabled", true);
      rec.set("ads_enabled", false);
      rec.set("social_links", {});
      rec.set("analytics_integration", { google_analytics: "", search_console: "" });
      rec.set("search_settings", { enabled: true });
      rec.set("homepage_sections", [
        { key: "hero", enabled: true, title_ar: "", title_en: "", limit: 1 },
        { key: "search", enabled: true, title_ar: "", title_en: "", limit: 0 },
        { key: "featured", enabled: true, title_ar: "المقال المميز", title_en: "Featured Article", limit: 1 },
        { key: "latest", enabled: true, title_ar: "أحدث المقالات", title_en: "Latest Articles", limit: 8 },
        { key: "news", enabled: true, title_ar: "أخبار العقارات", title_en: "Property News", limit: 6 },
        { key: "countries", enabled: true, title_ar: "محتوى حسب الدولة", title_en: "Content by Country", limit: 5 },
        { key: "categories", enabled: true, title_ar: "حسب التصنيف", title_en: "By Category", limit: 8 },
        { key: "videos", enabled: true, title_ar: "فيديوهات", title_en: "Videos", limit: 4 },
        { key: "most_read", enabled: true, title_ar: "الأكثر قراءة", title_en: "Most Read", limit: 5 },
        { key: "ads", enabled: false, title_ar: "", title_en: "", limit: 0 },
      ]);
      rec.set("footer_text_ar", "إستيت فولو Insights — مقالات وأخبار عقارية موثوقة.");
      rec.set("footer_text_en", "Estate Follow Insights — trusted real estate articles and news.");
      rec.set("copyright_text", "© Estate Follow");
      rec.set("editor_portal_name", "Editor Portal");
      rec.set("editor_login_subtitle_ar", "سجّل الدخول لإدارة محتوى Estate Follow Insights.");
      rec.set("editor_login_subtitle_en", "Sign in to manage Estate Follow Insights content.");
      app.save(rec);
    }

    // ---- seed default header menu items ----
    const defaultMenu = [
      { ar: "الرئيسية", en: "Home", url: "/insights", location: "header", order: 0 },
      { ar: "المقالات", en: "Articles", url: "/insights/articles", location: "header", order: 1 },
      { ar: "الأخبار", en: "News", url: "/insights/news", location: "header", order: 2 },
      { ar: "الأدلة", en: "Guides", url: "/insights/guides", location: "header", order: 3 },
      { ar: "الفيديوهات", en: "Videos", url: "/insights/videos", location: "header", order: 4 },
      { ar: "الدول", en: "Countries", url: "/insights/countries", location: "header", order: 5 },
      { ar: "من نحن", en: "About", url: "/insights/about", location: "header", order: 6 },
      { ar: "اتصل بنا", en: "Contact", url: "/insights/contact", location: "header", order: 7 },
      { ar: "من نحن", en: "About", url: "/insights/about", location: "footer", order: 0 },
      { ar: "اتصل بنا", en: "Contact", url: "/insights/contact", location: "footer", order: 1 },
    ];
    defaultMenu.forEach((m) => {
      let exists = false;
      try {
        const found = app.findRecordsByFilter(
          "insights_menu_items",
          `location = "${m.location}" && url = "${m.url}"`,
          "",
          1,
        );
        exists = !!(found && found.length);
      } catch (_) { /* none */ }
      if (!exists) {
        const rec = new Record(menu);
        rec.set("label_ar", m.ar);
        rec.set("label_en", m.en);
        rec.set("url", m.url);
        rec.set("location", m.location);
        rec.set("order", m.order);
        rec.set("visible", true);
        rec.set("open_new_tab", false);
        app.save(rec);
      }
    });

    // ---- seed core pages (Home / About / Contact — undeletable) ----
    const corePages = [
      { ar: "الرئيسية", en: "Home", slug: "home", type: "landing" },
      { ar: "من نحن", en: "About", slug: "about", type: "about" },
      { ar: "اتصل بنا", en: "Contact", slug: "contact", type: "contact" },
    ];
    corePages.forEach((p) => {
      let exists = false;
      try {
        const found = app.findRecordsByFilter("insights_pages", `slug = "${p.slug}"`, "", 1);
        exists = !!(found && found.length);
      } catch (_) { /* none */ }
      if (!exists) {
        const rec = new Record(pages);
        rec.set("title_ar", p.ar);
        rec.set("title_en", p.en);
        rec.set("slug", p.slug);
        rec.set("page_type", p.type);
        rec.set("status", "published");
        rec.set("is_core", true);
        rec.set("show_in_header", false);
        rec.set("show_in_footer", false);
        rec.set("indexable", true);
        rec.set("order", 0);
        app.save(rec);
      }
    });

    // ---- seed Primary Content Admin (undeletable, full permissions) ----
    //
    // SECURITY: no longer created with a hardcoded password. Only created
    // when the CONTENT_ADMIN_PASSWORD environment variable is set at
    // migration time; if it is not set, this step is skipped entirely and
    // no content-admin account is created. The email is kept as
    // "content.admin@estatefollow.com" since it is referenced elsewhere
    // (e.g. ContentManagementPanel.jsx) as the primary content admin's
    // identity.
    const PRIMARY_EMAIL = "content.admin@estatefollow.com";
    const contentAdminPassword = $os.getenv("CONTENT_ADMIN_PASSWORD");
    if (contentAdminPassword) {
      let primaryExists = false;
      try {
        app.findAuthRecordByEmail("editors", PRIMARY_EMAIL);
        primaryExists = true;
      } catch (_) { /* not found */ }
      if (!primaryExists) {
        const admin = new Record(editors);
        admin.setEmail(PRIMARY_EMAIL);
        admin.setPassword(contentAdminPassword);
        admin.set("name", "Primary Content Admin");
        admin.set("role", "content_manager");
        admin.set("active", true);
        admin.set("verified", true);
        admin.set("is_primary", true);
        admin.set("suspended", false);
        admin.set("force_password_change", false);
        admin.set("status", "active");
        admin.set("permissions", {
          create: true, edit: true, delete: true, publish: true, unpublish: true,
          schedule: true, manage_news: true, manage_pages: true, manage_media: true,
          manage_comments: true, manage_categories: true, seo_edit: true, manage_ads: true,
          view_analytics: true, manage_editors: true,
        });
        app.save(admin);
      }
    }
  },
  (app) => {
    const names = [
      "insights_banner_events",
      "insights_banners",
      "insights_menu_items",
      "insights_media",
      "insights_audit_log",
      "insights_settings",
      "insights_pages",
    ];
    names.forEach((n) => {
      try {
        const c = app.findCollectionByNameOrId(n);
        app.delete(c);
      } catch (e) {
        if (e.message.includes("no rows in result set")) return;
        throw e;
      }
    });
    // remove added editor fields
    try {
      const editors = app.findCollectionByNameOrId("editors");
      ["is_primary", "suspended", "force_password_change", "status"].forEach((f) => {
        try { editors.fields.removeByName(f); } catch (_) { /* ignore */ }
      });
      app.save(editors);
    } catch (_) { /* ignore */ }
    // remove primary admin
    try {
      const admin = app.findAuthRecordByEmail("editors", "content.admin@estatefollow.com");
      app.delete(admin);
    } catch (_) { /* ignore */ }
  },
);
