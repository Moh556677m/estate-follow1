/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    // account_type: owner | broker | company
    try {
      if (!users.fields.getByName('account_type')) {
        users.fields.add(
          new SelectField({
            name: 'account_type',
            required: false,
            maxSelect: 1,
            values: ['owner', 'broker', 'company'],
          }),
        );
      }
    } catch (_) {
      users.fields.add(
        new SelectField({
          name: 'account_type',
          required: false,
          maxSelect: 1,
          values: ['owner', 'broker', 'company'],
        }),
      );
    }

    // profile_complete — false until broker/company finishes setup
    try {
      if (!users.fields.getByName('profile_complete')) {
        users.fields.add(new BoolField({ name: 'profile_complete' }));
      }
    } catch (_) {
      users.fields.add(new BoolField({ name: 'profile_complete' }));
    }

    app.save(users);

    // --- brokerage_companies ---
    const companies = app.findCollectionByNameOrId('brokerage_companies');

    const addCo = (field) => {
      try {
        if (!companies.fields.getByName(field.name)) {
          companies.fields.add(field);
        }
      } catch (_) {
        companies.fields.add(field);
      }
    };

    addCo(
      new RelationField({
        name: 'owner',
        required: false,
        maxSelect: 1,
        collectionId: users.id,
        cascadeDelete: false,
      }),
    );
    addCo(new JSONField({ name: 'cities', maxSize: 200000 }));
    addCo(new TextField({ name: 'license_number', max: 120 }));
    addCo(
      new FileField({
        name: 'license_pdf',
        maxSelect: 1,
        maxSize: 10485760,
        mimeTypes: ['application/pdf'],
        protected: true,
      }),
    );
    addCo(new TextField({ name: 'instagram', max: 300 }));
    addCo(new TextField({ name: 'facebook', max: 300 }));
    addCo(new TextField({ name: 'tiktok', max: 300 }));
    addCo(new JSONField({ name: 'social_links', maxSize: 200000 }));
    addCo(new TextField({ name: 'review_note', max: 2000 }));
    addCo(new BoolField({ name: 'license_verified' }));

    // Expand status values
    try {
      const st = companies.fields.getByName('status');
      if (st) {
        st.values = ['pending', 'approved', 'rejected', 'changes_requested', 'hidden'];
      }
    } catch (_) {}

    companies.listRule =
      "status = 'approved' || @request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = owner)";
    companies.viewRule =
      "status = 'approved' || @request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = owner)";
    companies.createRule =
      "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.account_type = 'company' && @request.auth.id = @request.body.owner)";
    companies.updateRule =
      "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = owner && (@request.body.status:isset = false || @request.body.status = status || @request.body.status = 'pending'))";
    companies.deleteRule = '@request.auth.is_super_admin = true';

    app.save(companies);

    // --- brokers ---
    const brokers = app.findCollectionByNameOrId('brokers');
    const co = app.findCollectionByNameOrId('brokerage_companies');

    const addBr = (field) => {
      try {
        if (!brokers.fields.getByName(field.name)) {
          brokers.fields.add(field);
        }
      } catch (_) {
        brokers.fields.add(field);
      }
    };

    addBr(
      new RelationField({
        name: 'owner',
        required: false,
        maxSelect: 1,
        collectionId: users.id,
        cascadeDelete: false,
      }),
    );
    addBr(new JSONField({ name: 'cities', maxSize: 200000 }));
    addBr(
      new FileField({
        name: 'passport_pdf',
        maxSelect: 1,
        maxSize: 10485760,
        mimeTypes: ['application/pdf'],
        protected: true,
      }),
    );
    addBr(new TextField({ name: 'nationality', max: 120 }));
    addBr(
      new SelectField({
        name: 'gender',
        maxSelect: 1,
        values: ['male', 'female'],
      }),
    );
    addBr(new DateField({ name: 'date_of_birth' }));
    addBr(new BoolField({ name: 'freelance' }));
    addBr(new BoolField({ name: 'licensed' }));
    addBr(new TextField({ name: 'license_number', max: 120 }));
    addBr(
      new FileField({
        name: 'license_pdf',
        maxSelect: 1,
        maxSize: 10485760,
        mimeTypes: ['application/pdf'],
        protected: true,
      }),
    );
    addBr(new TextField({ name: 'instagram', max: 300 }));
    addBr(new TextField({ name: 'facebook', max: 300 }));
    addBr(new TextField({ name: 'tiktok', max: 300 }));
    addBr(new JSONField({ name: 'social_links', maxSize: 200000 }));
    addBr(new TextField({ name: 'review_note', max: 2000 }));
    addBr(new BoolField({ name: 'license_verified' }));

    try {
      const st = brokers.fields.getByName('status');
      if (st) {
        st.values = ['pending', 'approved', 'rejected', 'changes_requested', 'hidden'];
      }
    } catch (_) {}

    // Ensure company relation still points at companies
    try {
      const cf = brokers.fields.getByName('company');
      if (cf && !cf.collectionId) {
        cf.collectionId = co.id;
      }
    } catch (_) {}

    brokers.listRule =
      "status = 'approved' || @request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = owner)";
    brokers.viewRule =
      "status = 'approved' || @request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = owner)";
    brokers.createRule =
      "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.account_type = 'broker' && @request.auth.id = @request.body.owner)";
    brokers.updateRule =
      "@request.auth.is_super_admin = true || (@request.auth.id != '' && @request.auth.id = owner && (@request.body.status:isset = false || @request.body.status = status || @request.body.status = 'pending'))";
    brokers.deleteRule = '@request.auth.is_super_admin = true';

    app.save(brokers);

    // Backfill existing users as owners
    const allUsers = app.findAllRecords('users');
    for (let i = 0; i < allUsers.length; i++) {
      const u = allUsers[i];
      const at = u.getString('account_type');
      if (!at) {
        u.set('account_type', 'owner');
        u.set('profile_complete', true);
        app.save(u);
      }
    }
  },
  (app) => {
    // Non-destructive down: leave fields in place
  },
);
