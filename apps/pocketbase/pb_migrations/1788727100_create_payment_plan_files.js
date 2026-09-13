/// <reference path="../pb_data/types.d.ts" />

// Smart Payment Plan Reader — persistent storage for the ORIGINAL uploaded
// document (PDF or image) that a plan was read from.
//
// The backend `/integrated-ai/analyze-plan` endpoint stores every uploaded
// file here first, then fetches the bytes back from PocketBase storage and
// does the real document reading server-side (PDF → page images, vision AI,
// deterministic parser). This is the "payment-plan-files" table the engine
// is bound to.
//
// Rules:
//   - viewRule: ""  → public read. The external AI vision proxy must be able
//     to fetch the file with a plain HTTP GET (no token), exactly like
//     _planReaderImages. Record ids are 15-char random ([a-z0-9]{15}) so the
//     file URL is unguessable.
//   - createRule: signed-in user only.
//   - deleteRule: signed-in user only (owner cleanup / re-analysis).
migrate(
	(app) => {
		const collection = new Collection({
			type: "base",
			name: "payment_plan_files",
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
					id: "file4019200002",
					maxSelect: 1,
					maxSize: 536870912,
					mimeTypes: [
						"application/pdf",
						"image/jpeg",
						"image/jpg",
						"image/png",
						"image/webp",
						"image/heic",
						"image/heif",
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
					// Original file name as uploaded by the user.
					hidden: false,
					id: "text4019200003",
					max: 300,
					min: 0,
					name: "file_name",
					presentable: false,
					required: false,
					system: false,
					type: "text",
				},
				{
					// "pdf" | "image" — how the backend should process it.
					hidden: false,
					id: "select4019200004",
					maxSelect: 1,
					name: "kind",
					presentable: false,
					required: false,
					system: false,
					type: "select",
					values: ["pdf", "image"],
				},
				{
					// SHA-256 of the original bytes (duplicate detection).
					hidden: false,
					id: "text4019200005",
					max: 80,
					min: 0,
					name: "file_hash",
					presentable: false,
					required: false,
					system: false,
					type: "text",
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
		const collection = app.findCollectionByNameOrId("payment_plan_files");
		app.delete(collection);
	},
);
