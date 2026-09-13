/// <reference path="../pb_data/types.d.ts" />
/**
 * Raise every FileField maxSize to 512MB so the app no longer rejects
 * legitimate large PDFs/images at the PocketBase schema layer.
 * Type / MIME checks stay unchanged. Host reverse-proxy may still apply
 * its own body limit — that surfaces as HTTP 413 to the client.
 */
migrate(
  (app) => {
    const NEW_MAX = 512 * 1024 * 1024; // 512 MB
    const cols = app.findAllCollections();
    for (let i = 0; i < cols.length; i++) {
      const collection = cols[i];
      let changed = false;
      const fields = collection.fields;
      if (!fields || !fields.length) continue;
      for (let j = 0; j < fields.length; j++) {
        const field = fields[j];
        // field.type is a method in PB JSVM
        let t = '';
        try {
          t = typeof field.type === 'function' ? field.type() : field.type;
        } catch (_) {
          t = '';
        }
        if (t !== 'file') continue;
        if (typeof field.maxSize === 'number' && field.maxSize < NEW_MAX) {
          field.maxSize = NEW_MAX;
          changed = true;
        } else if (!field.maxSize || field.maxSize === 0) {
          field.maxSize = NEW_MAX;
          changed = true;
        }
      }
      if (changed) {
        app.save(collection);
      }
    }
  },
  (app) => {
    // Soft rollback: leave raised limits in place (safe); no-op down.
  },
);
