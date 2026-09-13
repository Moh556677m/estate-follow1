/// <reference path="../pb_data/types.d.ts" />

// Owner identity documents — support BOTH Passport and Residence Permit.
//
// Previously the owner had a single identity document (document_type select
// [passport|residence] + document_number + document_file). Owners now can
// upload a Passport AND a Residence Permit together. At least ONE valid
// identity document is required for verification; the second is optional.
//
// Adds to `users`:
//   passport_number   text
//   passport_file     file (pdf/image, protected)
//   residence_number  text
//   residence_file    file (pdf/image, protected)
//
// The legacy document_type / document_number / document_file fields are kept
// for backward compatibility (existing verified accounts keep their data).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    const addField = (name, factory) => {
      if (users.fields.getByName(name)) return;
      users.fields.add(factory());
    };

    addField('passport_number', () =>
      new TextField({ name: 'passport_number', max: 120 }),
    );
    addField('passport_file', () =>
      new FileField({
        name: 'passport_file',
        maxSelect: 1,
        maxSize: 10485760,
        mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        protected: true,
      }),
    );
    addField('residence_number', () =>
      new TextField({ name: 'residence_number', max: 120 }),
    );
    addField('residence_file', () =>
      new FileField({
        name: 'residence_file',
        maxSelect: 1,
        maxSize: 10485760,
        mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        protected: true,
      }),
    );

    app.save(users);

    // Migrate legacy single-document data into the new dedicated fields so
    // existing owners keep their uploaded document without re-uploading.
    try {
      const all = app.findAllRecords('users');
      all.forEach((u) => {
        const dtype = String(u.get('document_type') || '').toLowerCase();
        const dnum = String(u.get('document_number') || '');
        const dfile = u.get('document_file');
        let changed = false;
        if (dtype === 'passport' && dfile && !u.get('passport_file')) {
          try { u.set('passport_number', dnum); } catch (_) {}
          try { u.set('passport_file', dfile); } catch (_) {}
          changed = true;
        } else if (dtype === 'residence' && dfile && !u.get('residence_file')) {
          try { u.set('residence_number', dnum); } catch (_) {}
          try { u.set('residence_file', dfile); } catch (_) {}
          changed = true;
        }
        if (changed) {
          try { app.save(u); } catch (_) {}
        }
      });
    } catch (_) {}
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    ['passport_number', 'passport_file', 'residence_number', 'residence_file'].forEach(
      (n) => {
        if (users.fields.getByName(n)) users.fields.removeByName(n);
      },
    );
    app.save(users);
  },
);
