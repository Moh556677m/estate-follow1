/// <reference path="../pb_data/types.d.ts" />

// PocketBase content-sniffs uploaded files (Go http.DetectContentType) and
// rejects any whose first 512 bytes don't read as application/pdf, even when
// the browser reports the file as a PDF and the extension is .pdf. Many
// real-world PDFs (portal downloads, scanned docs, re-saved exports) fail
// this sniff, which blocked property creation entirely because the PDF file
// fields are required. Drop the strict mimeTypes restriction — the frontend
// still guides users with accept="application/pdf", and the files remain
// protected (owner/admin only via the token hook).

const PDF_FIELDS = [
  "passport_pdf",
  "residence_pdf",
  "title_deed_pdf",
  "tenant_document",
  "lease_contract",
];

migrate(
  (app) => {
    const properties = app.findCollectionByNameOrId("properties");
    PDF_FIELDS.forEach((name) => {
      const field = properties.fields.getByName(name);
      if (field) {
        // Empty slice = no MIME validation.
        field.mimeTypes = [];
      }
    });
    app.save(properties);
  },
  (app) => {
    const properties = app.findCollectionByNameOrId("properties");
    PDF_FIELDS.forEach((name) => {
      const field = properties.fields.getByName(name);
      if (field) {
        field.mimeTypes = ["application/pdf"];
      }
    });
    app.save(properties);
  },
);
