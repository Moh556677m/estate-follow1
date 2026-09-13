/// <reference path="../pb_data/types.d.ts" />

// AI Property Creator — asynchronous background job queue with multi-batch
// PDF processing.
//
// Anthropic Claude enforces a HARD 100-page limit PER API request (across
// all document blocks, not per block). A contract PDF longer than 100 pages
// therefore cannot be sent in one request. The `/extract-property` endpoint
// now splits any PDF into ≤100-page batches and sends each batch as a
// SEPARATE Claude request, then merges every batch's JSON result into one
// final extraction (property data + the complete installment schedule from
// all pages) without fabricating any field.
//
// Because multiple sequential Claude calls can take longer than the platform
// reverse-proxy gateway timeout, the heavy work runs in the background and
// the UI polls these lightweight endpoints:
//   - POST /extract-property      → creates a job (status=pending), kicks off
//                                   background batch processing, returns
//                                   { jobId } immediately.
//   - GET  /extract-jobs/active   → the owner's current pending/processing
//                                   job (resume after reload / reconnect).
//   - GET  /extract-jobs/:id      → poll; returns status/stage/progress +
//                                   per-batch progress + final result.
//
// Per-batch progress (e.g. "جاري معالجة الصفحات 1-100 (دفعة 1/3)") is
// written to `stage` + `batch_current`/`batch_total` so the UI can show the
// user exactly which pages are being processed in real time.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");

		const collection = new Collection({
			type: "base",
			name: "property_extract_jobs",
			// Owner-only: only the user who created the job can see/poll it.
			// (The Express backend uses the superuser client, which bypasses
			// these rules, so background writes always succeed.)
			listRule: "@request.auth.id != '' && @request.auth.id = owner",
			viewRule: "@request.auth.id != '' && @request.auth.id = owner",
			createRule: "@request.auth.id != ''",
			updateRule: "@request.auth.id != '' && @request.auth.id = owner",
			deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
			fields: [
				{
					name: "owner",
					type: "relation",
					required: true,
					maxSelect: 1,
					collectionId: users.id,
					cascadeDelete: true,
				},
				{
					name: "status",
					type: "select",
					required: true,
					maxSelect: 1,
					values: ["pending", "processing", "completed", "failed"],
				},
				{
					// Human-readable current-step label, e.g. the batch being
					// processed. Shown directly to the user by the UI.
					name: "stage",
					type: "text",
					max: 200,
				},
				{
					name: "progress",
					type: "number",
					min: 0,
					max: 100,
				},
				{
					// Total number of Claude request batches the document was
					// split into (1 when no batching is needed).
					name: "batch_total",
					type: "number",
				},
				{
					// 1-based index of the batch currently being processed.
					name: "batch_current",
					type: "number",
				},
				{
					// Ordered list of per-batch labels (one per batch) so the UI
					// can render the full plan of work up front.
					name: "batch_labels",
					type: "json",
					maxSize: 200000,
				},
				{
					// Final merged extraction payload (property, fees, schedule,
					// start_points, page_errors).
					name: "result",
					type: "json",
					maxSize: 8000000,
				},
				{
					name: "error_code",
					type: "text",
					max: 80,
				},
				{
					name: "error_message_ar",
					type: "text",
					max: 1000,
				},
				{
					name: "error_message_en",
					type: "text",
					max: 1000,
				},
				{
					name: "file_hashes",
					type: "json",
					maxSize: 200000,
				},
				{
					name: "total_files",
					type: "number",
				},
				{
					name: "completed_at",
					type: "date",
				},
				{
					name: "created",
					type: "autodate",
					onCreate: true,
					onUpdate: false,
				},
				{
					name: "updated",
					type: "autodate",
					onCreate: true,
					onUpdate: true,
				},
			],
			indexes: [
				"CREATE INDEX idx_pej_owner ON property_extract_jobs (owner)",
				"CREATE INDEX idx_pej_status ON property_extract_jobs (status)",
			],
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("property_extract_jobs");
		app.delete(collection);
	},
);
