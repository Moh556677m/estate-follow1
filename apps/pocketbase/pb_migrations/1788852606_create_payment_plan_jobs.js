/// <reference path="../pb_data/types.d.ts" />

// Smart Payment Plan Reader — asynchronous background job queue.
//
// The `/integrated-ai/analyze-plan` endpoint used to call the Anthropic
// Claude API synchronously inside the HTTP request. Large PDFs / many
// images took longer than the platform reverse-proxy gateway timeout,
// producing a 504 (PLAN_HTTP_504) before Claude finished — the user was
// billed for the call but never received the result.
//
// This collection persists each analysis as a durable job:
//   - POST /analyze-plan  → creates a job (status=pending), kicks off the
//     Claude call in the background, and returns { jobId } immediately.
//   - GET  /plan-jobs/:id → lightweight poll; returns status/stage/progress
//     and, when finished, the full extracted installment list.
//   - GET  /plan-jobs/active → the owner's current pending/processing job
//     (so the UI can resume after a reload / connection drop).
//
// The result is written to PocketBase BEFORE the UI is notified, so a
// dropped connection never loses a paid-for extraction. Only one active
// job is allowed per owner (duplicate-run prevention).
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId("users");

		const collection = new Collection({
			type: "base",
			name: "payment_plan_jobs",
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
					name: "stage",
					type: "text",
					max: 60,
				},
				{
					name: "progress",
					type: "number",
					min: 0,
					max: 100,
				},
				{
					// Full extraction payload — installments, validation,
					// currency, sourceFiles, needsReviewCount, failedFiles, etc.
					name: "result",
					type: "json",
					maxSize: 5000000,
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
					// SHA-256 hashes of the uploaded files (audit / dedupe).
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
				"CREATE INDEX idx_ppj_owner ON payment_plan_jobs (owner)",
				"CREATE INDEX idx_ppj_status ON payment_plan_jobs (status)",
			],
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId("payment_plan_jobs");
		app.delete(collection);
	},
);
