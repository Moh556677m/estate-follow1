/// <reference path="../pb_data/types.d.ts" />

// Estate Follow Insights — public content portal collections.
// Articles, categories, tags, authors, comments, ad settings, analytics,
// and a separate `editors` auth collection (isolated from owner/broker data).

migrate(
  (app) => {
    // ---- editors auth collection (separate from users) ----
    let editors;
    try {
      editors = app.findCollectionByNameOrId("editors");
    } catch (_) {
      editors = new Collection({
        type: "auth",
        name: "editors",
        listRule: "id = @request.auth.id",
        viewRule: "id = @request.auth.id",
        // Only Super Admin (from users collection) can create editor accounts.
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "id = @request.auth.id || @request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        passwordAuth: { enabled: true },
        authAlert: { enabled: false },
        fields: [
          { name: "name", type: "text", max: 120 },
          {
            name: "role",
            type: "select",
            maxSelect: 1,
            values: ["editor", "senior_editor", "content_manager"],
          },
          { name: "permissions", type: "json", maxSize: 200000 },
          { name: "active", type: "bool" },
        ],
      });
      app.save(editors);
    }

    // ---- insights_categories ----
    let categories;
    try {
      categories = app.findCollectionByNameOrId("insights_categories");
    } catch (_) {
      categories = new Collection({
        type: "base",
        name: "insights_categories",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          { name: "name_ar", type: "text", required: true, max: 120 },
          { name: "name_en", type: "text", required: true, max: 120 },
          { name: "slug", type: "text", required: true, max: 120 },
          { name: "description_ar", type: "text", max: 500 },
          { name: "description_en", type: "text", max: 500 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_insights_cat_slug ON insights_categories (slug)"],
      });
      app.save(categories);
    }

    // ---- insights_tags ----
    let tags;
    try {
      tags = app.findCollectionByNameOrId("insights_tags");
    } catch (_) {
      tags = new Collection({
        type: "base",
        name: "insights_tags",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          { name: "name_ar", type: "text", required: true, max: 80 },
          { name: "name_en", type: "text", required: true, max: 80 },
          { name: "slug", type: "text", required: true, max: 80 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_insights_tag_slug ON insights_tags (slug)"],
      });
      app.save(tags);
    }

    // ---- insights_authors ----
    let authors;
    try {
      authors = app.findCollectionByNameOrId("insights_authors");
    } catch (_) {
      authors = new Collection({
        type: "base",
        name: "insights_authors",
        listRule: "",
        viewRule: "",
        createRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          { name: "name", type: "text", required: true, max: 120 },
          { name: "bio_ar", type: "text", max: 1000 },
          { name: "bio_en", type: "text", max: 1000 },
          {
            name: "photo",
            type: "file",
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(authors);
    }

    // ---- insights_articles ----
    let articles;
    try {
      articles = app.findCollectionByNameOrId("insights_articles");
    } catch (_) {
      articles = new Collection({
        type: "base",
        name: "insights_articles",
        // Public can read published; any authenticated staff/editor can read all.
        listRule: "status = 'published' || @request.auth.id != ''",
        viewRule: "status = 'published' || @request.auth.id != ''",
        createRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          { name: "title_ar", type: "text", max: 300 },
          { name: "title_en", type: "text", max: 300 },
          { name: "slug", type: "text", required: true, max: 300 },
          { name: "description_ar", type: "text", max: 1000 },
          { name: "description_en", type: "text", max: 1000 },
          { name: "content_ar", type: "editor", maxSize: 5000000 },
          { name: "content_en", type: "editor", maxSize: 5000000 },
          {
            name: "content_type",
            type: "select",
            maxSelect: 1,
            values: [
              "article",
              "news",
              "guide",
              "legal_update",
              "video",
              "photo_article",
              "official_statement",
            ],
          },
          {
            name: "cover_image",
            type: "file",
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          },
          {
            name: "images",
            type: "file",
            maxSelect: 20,
            maxSize: 5242880,
            mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          },
          { name: "video_url", type: "url", max: 500 },
          { name: "embed_video", type: "text", max: 2000 },
          { name: "country", type: "text", max: 10 },
          { name: "city", type: "text", max: 120 },
          {
            name: "category",
            type: "relation",
            maxSelect: 1,
            collectionId: categories.id,
            cascadeDelete: false,
          },
          { name: "tags", type: "json", maxSize: 200000 },
          {
            name: "author",
            type: "relation",
            maxSelect: 1,
            collectionId: authors.id,
            cascadeDelete: false,
          },
          { name: "sources", type: "json", maxSize: 200000 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: [
              "draft",
              "in_review",
              "scheduled",
              "published",
              "unpublished",
              "archived",
            ],
          },
          { name: "published_at", type: "date" },
          { name: "scheduled_at", type: "date" },
          { name: "seo_title_ar", type: "text", max: 200 },
          { name: "seo_title_en", type: "text", max: 200 },
          { name: "meta_description_ar", type: "text", max: 500 },
          { name: "meta_description_en", type: "text", max: 500 },
          { name: "canonical", type: "url", max: 500 },
          {
            name: "og_image",
            type: "file",
            maxSelect: 1,
            maxSize: 5242880,
            mimeTypes: ["image/jpeg", "image/png", "image/webp"],
          },
          { name: "indexable", type: "bool" },
          { name: "read_time", type: "number", min: 0 },
          { name: "views", type: "number", min: 0 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_insights_art_slug ON insights_articles (slug)",
          "CREATE INDEX idx_insights_art_status ON insights_articles (status)",
          "CREATE INDEX idx_insights_art_country ON insights_articles (country)",
          "CREATE INDEX idx_insights_art_type ON insights_articles (content_type)",
          "CREATE INDEX idx_insights_art_cat ON insights_articles (category)",
        ],
      });
      app.save(articles);
      // self-reference for related_articles (added after save so the
      // collection id exists and the relation collectionId is valid).
      articles.fields.add(
        new RelationField({
          name: "related_articles",
          maxSelect: 5,
          collectionId: articles.id,
          cascadeDelete: false,
        }),
      );
      app.save(articles);
    }

    // ---- insights_comments ----
    let comments;
    try {
      comments = app.findCollectionByNameOrId("insights_comments");
    } catch (_) {
      comments = new Collection({
        type: "base",
        name: "insights_comments",
        listRule: "status = 'approved' || @request.auth.is_super_admin = true || @request.auth.role != ''",
        viewRule: "status = 'approved' || @request.auth.is_super_admin = true || @request.auth.role != ''",
        createRule: "", // anyone can submit a comment
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          {
            name: "article",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: articles.id,
            cascadeDelete: true,
          },
          { name: "name", type: "text", required: true, max: 120 },
          { name: "email", type: "email", required: true },
          { name: "body", type: "text", required: true, max: 3000 },
          {
            name: "status",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["pending", "approved", "rejected", "spam"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE INDEX idx_insights_com_art ON insights_comments (article, status)"],
      });
      app.save(comments);
    }

    // ---- insights_ad_settings ----
    let adSettings;
    try {
      adSettings = app.findCollectionByNameOrId("insights_ad_settings");
    } catch (_) {
      adSettings = new Collection({
        type: "base",
        name: "insights_ad_settings",
        listRule: "", // public reads to know whether to render ads
        viewRule: "",
        createRule: "@request.auth.is_super_admin = true",
        updateRule: "@request.auth.is_super_admin = true",
        deleteRule: "@request.auth.is_super_admin = true",
        fields: [
          { name: "enabled", type: "bool" },
          { name: "publisher_id", type: "text", max: 60 },
          { name: "ad_units", type: "json", maxSize: 200000 },
          { name: "above_article", type: "bool" },
          { name: "middle_article", type: "bool" },
          { name: "below_article", type: "bool" },
          { name: "between_cards", type: "bool" },
          { name: "sidebar", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(adSettings);
    }

    // ---- insights_article_views (analytics) ----
    let views;
    try {
      views = app.findCollectionByNameOrId("insights_article_views");
    } catch (_) {
      views = new Collection({
        type: "base",
        name: "insights_article_views",
        listRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        viewRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        createRule: "", // public can log a view
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          {
            name: "article",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: articles.id,
            cascadeDelete: true,
          },
          { name: "country", type: "text", max: 10 },
          { name: "source", type: "text", max: 120 },
          { name: "reader_id", type: "text", max: 60 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
        indexes: ["CREATE INDEX idx_insights_views_art ON insights_article_views (article, created)"],
      });
      app.save(views);
    }

    // ---- insights_contact_messages ----
    let contact;
    try {
      contact = app.findCollectionByNameOrId("insights_contact_messages");
    } catch (_) {
      contact = new Collection({
        type: "base",
        name: "insights_contact_messages",
        listRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        viewRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        createRule: "", // public can submit
        updateRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        deleteRule: "@request.auth.is_super_admin = true || @request.auth.role != ''",
        fields: [
          { name: "name", type: "text", required: true, max: 120 },
          { name: "email", type: "email", required: true },
          { name: "subject", type: "text", max: 200 },
          { name: "message", type: "text", required: true, max: 5000 },
          { name: "handled", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(contact);
    }

    // ---- seed default categories ----
    const defaultCats = [
      { ar: "إدارة العقارات", en: "Property Management", slug: "property-management" },
      { ar: "الإيجارات", en: "Rentals", slug: "rentals" },
      { ar: "الأقساط", en: "Installments", slug: "installments" },
      { ar: "الاستثمار العقاري", en: "Real Estate Investment", slug: "investment" },
      { ar: "أخبار السوق", en: "Market News", slug: "market-news" },
      { ar: "القوانين", en: "Laws & Regulations", slug: "laws" },
      { ar: "الوسطاء", en: "Brokers", slug: "brokers" },
      { ar: "شركات الوساطة", en: "Brokerage Companies", slug: "brokerage-companies" },
      { ar: "دليل الملاك", en: "Owner Guide", slug: "owner-guide" },
      { ar: "Estate Follow Updates", en: "Estate Follow Updates", slug: "estate-follow-updates" },
    ];
    defaultCats.forEach((c) => {
      try {
        app.findRecordsByFilter("insights_categories", `slug = "${c.slug}"`, "", 1);
      } catch (_) {
        const rec = new Record(categories);
        rec.set("name_ar", c.ar);
        rec.set("name_en", c.en);
        rec.set("slug", c.slug);
        app.save(rec);
      }
    });

    // ---- seed default ad settings row ----
    try {
      app.findRecordsByFilter("insights_ad_settings", "1 = 1", "", 1);
    } catch (_) {
      const rec = new Record(adSettings);
      rec.set("enabled", false);
      rec.set("publisher_id", "");
      rec.set("above_article", true);
      rec.set("middle_article", false);
      rec.set("below_article", true);
      rec.set("between_cards", false);
      rec.set("sidebar", true);
      app.save(rec);
    }
  },
  (app) => {
    const names = [
      "insights_contact_messages",
      "insights_article_views",
      "insights_ad_settings",
      "insights_comments",
      "insights_articles",
      "insights_authors",
      "insights_tags",
      "insights_categories",
      "editors",
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
  },
);
