/// <reference path="../pb_data/types.d.ts" />
/**
 * Raise Estate AI settings default max_file_size from 10MB to 512MB.
 */
migrate(
  (app) => {
    try {
      const rows = app.findAllRecords('estate_ai_settings');
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const cur = Number(r.get('max_file_size') || 0);
        if (!cur || cur <= 10) {
          r.set('max_file_size', 512);
          app.save(r);
        }
      }
    } catch (e) {
      // collection may not exist in some environments
      throw e;
    }
  },
  (app) => {
    /* leave raised values */
  },
);
