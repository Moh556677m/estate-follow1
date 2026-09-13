/// <reference path="../pb_data/types.d.ts" />

// Adds an optional PDF attachment file to marketing_campaigns.
// The file is NOT protected so external email recipients can download it
// via the generated file URL (the URL contains the unguessable record id).
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('marketing_campaigns');
    col.fields.add(
      new FileField({
        name: 'pdf_file',
        maxSelect: 1,
        maxSize: 10485760, // 10MB
        mimeTypes: ['application/pdf'],
      }),
    );
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId('marketing_campaigns');
    col.fields.removeByName('pdf_file');
    app.save(col);
  },
);
