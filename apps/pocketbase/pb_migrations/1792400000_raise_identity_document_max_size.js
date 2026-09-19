/// <reference path="../pb_data/types.d.ts" />

// Real root cause of "تعذر رفع الملف، حاول مرة أخرى" on passport/residence
// PDF uploads: every identity-document file field was created with
// maxSize: 10485760 (10 MB) — a real scanned passport/residence PDF
// (multi-page, high-DPI) routinely exceeds that. PocketBase rejects the
// request (its router computes the allowed request body size per
// collection from the sum of that collection's file fields' maxSize, and
// rejects anything over it) before the file is ever stored — the frontend
// then shows its fixed, deliberately generic failure message (see
// IdentityDocumentsSection.jsx's UploadStatus — by design it never shows
// the real per-request reason to the end user), which is exactly what was
// reported. Not a Cloudinary/legacy-endpoint issue: this whole upload path
// already goes straight to PocketBase's own file storage (see
// uploadClient.js) with no Cloudinary involvement anywhere in it.
//
// Raises every owner identity-document field to 100 MB. Nothing else about
// these fields changes (still `protected: true` — private, token-gated
// access only; same allowed mime types: PDF/JPG/JPEG/PNG, plus the
// pre-existing webp).
migrate(
  (app) => {
    const NEW_MAX_SIZE = 100 * 1024 * 1024; // 100 MB

    const raise = (collectionName, fieldName) => {
      const collection = app.findCollectionByNameOrId(collectionName);
      const field = collection.fields.getByName(fieldName);
      if (!field) return;
      field.maxSize = NEW_MAX_SIZE;
      app.save(collection);
    };

    raise('users', 'passport_file');
    raise('users', 'residence_file');
    raise('users', 'document_file');
    raise('user_additional_documents', 'file');
  },
  (app) => {
    const OLD_MAX_SIZE = 10 * 1024 * 1024;

    const revert = (collectionName, fieldName) => {
      const collection = app.findCollectionByNameOrId(collectionName);
      const field = collection.fields.getByName(fieldName);
      if (!field) return;
      field.maxSize = OLD_MAX_SIZE;
      app.save(collection);
    };

    revert('users', 'passport_file');
    revert('users', 'residence_file');
    revert('users', 'document_file');
    revert('user_additional_documents', 'file');
  },
);
