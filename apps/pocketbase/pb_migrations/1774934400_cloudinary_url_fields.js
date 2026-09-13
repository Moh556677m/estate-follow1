/// <reference path="../pb_data/types.d.ts" />

// Cloudinary file storage — adds parallel URL fields next to the existing
// PocketBase file fields. New uploads are stored in Cloudinary and their
// secure URL is written here; the display layer prefers these URL fields and
// falls back to the original PocketBase file field for legacy records, so no
// existing file is lost.
//
// Collections touched:
//   properties      -> title_deed_pdf_url, tenant_document_url, lease_contract_url (text)
//                      additional_documents_urls (json array of {name, url})
//   owner_documents -> file_url (text)
//   users           -> document_file_url, passport_file_url, residence_file_url (text)
//
// All fields are optional and additive.

migrate(
  (app) => {
    const addTextField = (collection, name, max = 1000) => {
      if (!collection.fields.getByName(name)) {
        collection.fields.add(new TextField({ name, max }));
      }
    };

    const addJsonField = (collection, name, maxSize = 200000) => {
      if (!collection.fields.getByName(name)) {
        collection.fields.add(new JSONField({ name, maxSize }));
      }
    };

    // properties
    try {
      const props = app.findCollectionByNameOrId('properties');
      addTextField(props, 'title_deed_pdf_url');
      addTextField(props, 'tenant_document_url');
      addTextField(props, 'lease_contract_url');
      addJsonField(props, 'additional_documents_urls');
      app.save(props);
    } catch (e) {
      if (!String(e?.message || '').includes('no rows')) throw e;
    }

    // owner_documents
    try {
      const docs = app.findCollectionByNameOrId('owner_documents');
      addTextField(docs, 'file_url');
      // `file` becomes optional so a Cloudinary-only upload (file_url set, no
      // local file) can be created. Legacy records with `file` are unaffected.
      const fileField = docs.fields.getByName('file');
      if (fileField) fileField.required = false;
      app.save(docs);
    } catch (e) {
      if (!String(e?.message || '').includes('no rows')) throw e;
    }

    // users (auth collection)
    try {
      const users = app.findCollectionByNameOrId('users');
      addTextField(users, 'document_file_url');
      addTextField(users, 'passport_file_url');
      addTextField(users, 'residence_file_url');
      app.save(users);
    } catch (e) {
      if (!String(e?.message || '').includes('no rows')) throw e;
    }
  },
  (app) => {
    const remove = (collection, names) => {
      names.forEach((name) => {
        const f = collection?.fields?.getByName(name);
        if (f) collection.fields.remove(f);
      });
    };

    try {
      const props = app.findCollectionByNameOrId('properties');
      remove(props, [
        'title_deed_pdf_url',
        'tenant_document_url',
        'lease_contract_url',
        'additional_documents_urls',
      ]);
      app.save(props);
    } catch (e) {
      if (!String(e?.message || '').includes('no rows')) throw e;
    }

    try {
      const docs = app.findCollectionByNameOrId('owner_documents');
      remove(docs, ['file_url']);
      const fileField = docs?.fields?.getByName('file');
      if (fileField) fileField.required = true;
      app.save(docs);
    } catch (e) {
      if (!String(e?.message || '').includes('no rows')) throw e;
    }

    try {
      const users = app.findCollectionByNameOrId('users');
      remove(users, ['document_file_url', 'passport_file_url', 'residence_file_url']);
      app.save(users);
    } catch (e) {
      if (!String(e?.message || '').includes('no rows')) throw e;
    }
  },
);
