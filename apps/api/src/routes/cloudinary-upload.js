import { Router } from 'express';
import crypto from 'node:crypto';
import { pocketbaseAuth } from '../middleware/pocketbase-auth.js';
import { uploadFiles } from '../middleware/file-upload.js';
import { isIntegrationConfigured, respondNotConfigured } from '../utils/integrationConfig.js';

const router = Router();

// All upload endpoints require an authenticated PocketBase user.
router.use(pocketbaseAuth);

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

function configured() {
	return isIntegrationConfigured(
		'CLOUDINARY_CLOUD_NAME',
		'CLOUDINARY_API_KEY',
		'CLOUDINARY_API_SECRET',
	);
}

// GET /cloudinary/status — lets the frontend know whether Cloudinary is set up.
router.get('/status', (req, res) => {
	res.json({ configured: configured() });
});

// Build the Cloudinary signed-upload signature.
// Cloudinary requires params sorted alphabetically, joined as `key=value`,
// with the API secret appended, then SHA-1 hex.
function signParams(params, secret) {
	const serialized = Object.keys(params)
		.filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
		.sort()
		.map((k) => `${k}=${params[k]}`)
		.join('&');
	return crypto.createHash('sha1').update(serialized + secret).digest('hex');
}

// POST /cloudinary/upload — multipart `file` field.
// Uploads to Cloudinary with a signed request (api_key + signature + timestamp)
// so the API secret never reaches the browser. Returns the secure URL.
router.post(
	'/upload',
	uploadFiles({
		fieldName: 'file',
		maxCount: 1,
		maxSizeMB: 512,
		allowAny: true,
	}),
	async (req, res) => {
		if (!configured()) {
			return respondNotConfigured(res, {
				integration: 'Cloudinary',
				envKeys: [
					'CLOUDINARY_CLOUD_NAME',
					'CLOUDINARY_API_KEY',
					'CLOUDINARY_API_SECRET',
				],
			});
		}

		const file = req.files?.[0];
		if (!file) {
			return res.status(422).json({ error: 'file field is required' });
		}

		// Scope uploads under the authenticated user's folder.
		const userId = req.user?.id || 'anonymous';
		const folder = `estatefollow/${userId}`;
		const timestamp = Math.floor(Date.now() / 1000);

		// Use resource_type=auto so PDFs, images, and other docs all work.
		const signParamsObj = {
			folder,
			timestamp,
		};
		const signature = signParams(signParamsObj, API_SECRET);

		const form = new FormData();
		form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
		form.append('api_key', API_KEY);
		form.append('timestamp', String(timestamp));
		form.append('folder', folder);
		form.append('signature', signature);

		const upstream = await fetch(
			`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
			{ method: 'POST', body: form },
		);

		if (!upstream.ok) {
			const body = await upstream.text().catch(() => '');
			throw new Error(
				`cloudinary upload failed: ${upstream.status} ${upstream.statusText} ${body.slice(0, 300)}`,
			);
		}

		const data = await upstream.json();
		if (!data?.secure_url) {
			throw new Error(`cloudinary upload returned no secure_url: ${JSON.stringify(data).slice(0, 300)}`);
		}

		res.json({
			url: data.secure_url,
			public_id: data.public_id || '',
			name: file.originalname,
			format: data.format || '',
			bytes: data.bytes || 0,
			resource_type: data.resource_type || '',
		});
	},
);

export default router;
