/// <reference path="../pb_data/types.d.ts" />
//
// Dedicated, PUBLIC image collection for the Smart Payment Plan Reader.
//
// Why a separate collection (not reusing _integratedAiImages):
//   _integratedAiImages stores files as `protected: true` with
//   `viewRule: "@request.auth.id != ''"`, so an external AI vision proxy
//   fetching a signed file URL through the public reverse proxy gets
//   "insufficient permissions to access the file resource" (404) — the
//   short-lived file token is not reliably honored end-to-end, which broke
//   multi-image plan analysis.
//
//   This collection stores the SAME kind of transient analysis images but
//   with `viewRule: ""` (public read) and `protected: false`, so the AI
//   proxy can fetch each image directly with a plain HTTP GET — no token,
//   no reverse-proxy auth dependency. Record ids are 15-char random
//   (`[a-z0-9]{15}`), so file URLs are unguessable (presigned-URL level
//   exposure). Records are deleted best-effort by the /analyze-plan route
//   right after the proxy has consumed them.
migrate(
	(app) => {
		const collection = new Collection({
			type: "base",
			name: "_planReaderImages",
			viewRule: "",
			createRule: "@request.auth.id != ''",
			updateRule: null,
			deleteRule: "@request.auth.id != ''",
			fields: [
				{
					autogeneratePattern: "[a-z0-9]{15}",
					hidden: false,
					id: "text3208210256",
					max: 15,
					min: 15,
					name: "id",
					pattern: "^[a-z0-9]+$",
					presentable: false,
					primaryKey: true,
					required: true,
					system: true,
					type: "text",
				},
				{
					hidden: false,
					id: "file4019200001",
					maxSelect: 1,
					maxSize: 536870912,
					mimeTypes: [
						"image/jpeg",
						"image/png",
						"image/webp",
					],
					name: "file",
					presentable: false,
					protected: false,
					required: true,
					system: false,
					thumbs: [],
					type: "file",
				},
				{
					hidden: false,
					id: "autodate3332085495",
					name: "created",
					onCreate: true,
					onUpdate: false,
					presentable: false,
					system: false,
					type: "autodate",
				},
			],
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("_planReaderImages");
		app.delete(collection);
	},
);
