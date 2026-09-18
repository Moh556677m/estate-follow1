// Super-Admin-only diagnostic endpoint: reports whether Supabase is
// reachable and working, WITHOUT ever exposing SUPABASE_SECRET_KEY (or any
// other secret) in the response, logs, or error messages.
//
// WHY THIS EXISTS: the sandbox this project was developed in has no
// outbound network access to *.supabase.co (blocked by that environment's
// own egress policy), so a live connection/auth/database/storage test
// could not be executed there. This endpoint lets a Super Admin run that
// exact test for real, once deployed somewhere with normal internet access
// (e.g. Hostinger) — call it once, read the JSON result, then feel free to
// remove this route if you don't want a standing diagnostics endpoint.
//
// Nothing here is destructive: it only creates/reads/deletes rows in a
// dedicated `connection_test` table (never touches any other table), and
// only lists storage buckets (never uploads/deletes a real file).
import { Router } from 'express';
import { pocketbaseAuth } from '../middleware/pocketbase-auth.js';
import pocketbaseClient from '../utils/pocketbaseClient.js';
import { supabaseAdmin, isSupabaseConfigured, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../utils/supabaseClient.js';

const router = Router();

const SUPER_ADMIN_EMAIL = 'admin@estatefollow.com';

router.use(pocketbaseAuth);

async function requireSuperAdmin(req) {
	const userId = req.pocketbaseUserId;
	if (!userId) {
		const e = new Error('FORBIDDEN');
		e.status = 403;
		throw e;
	}
	let record;
	try {
		record = await pocketbaseClient.collection('users').getOne(userId);
	} catch {
		const e = new Error('FORBIDDEN');
		e.status = 403;
		throw e;
	}
	const isSuper =
		!!record.is_super_admin || String(record.email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
	if (!isSuper) {
		const e = new Error('FORBIDDEN');
		e.status = 403;
		throw e;
	}
}

// Never leak raw error internals (which, for a misconfigured client, can
// sometimes echo back parts of the request including headers/keys).
function safeErrorMessage(err) {
	const msg = String(err?.message || 'unknown error');
	// Strip anything that looks like it could be a key/token fragment.
	return msg.replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]');
}

router.get('/', async (req, res) => {
	try {
		await requireSuperAdmin(req);
	} catch (e) {
		return res.status(e.status || 403).json({ message: 'Forbidden' });
	}

	const result = {
		envVariablesDetected: {
			SUPABASE_URL: !!process.env.SUPABASE_URL,
			SUPABASE_PUBLISHABLE_KEY: !!process.env.SUPABASE_PUBLISHABLE_KEY,
			SUPABASE_SECRET_KEY: !!process.env.SUPABASE_SECRET_KEY,
		},
		supabaseConnection: 'FAIL',
		authConnection: 'FAIL',
		databaseRead: 'FAIL',
		databaseWrite: 'FAIL',
		storage: 'NOT_CONFIGURED',
	};

	if (!isSupabaseConfigured) {
		result.supabaseConnection = 'FAIL';
		result.note = 'SUPABASE_URL and/or SUPABASE_SECRET_KEY not set on this server.';
		return res.json(result);
	}

	// Use the already-cleaned/origin-only values (see utils/supabaseClient.js)
	// rather than re-reading process.env raw here — a diagnostics endpoint
	// testing a DIFFERENT, unsanitized copy of the same two vars than the one
	// supabaseAdmin actually uses could report PASS/FAIL that doesn't match
	// reality (e.g. failing here on an invisible character that supabaseAdmin
	// itself already strips, or vice versa).
	const baseUrl = SUPABASE_URL;
	const publishableKey = SUPABASE_PUBLISHABLE_KEY;

	// 1) Auth connection — hits the public auth settings endpoint with the
	//    publishable key. Requires no user to exist; just proves the URL +
	//    key are valid and the Auth service is reachable.
	try {
		const r = await fetch(`${baseUrl}/auth/v1/settings`, {
			headers: { apikey: publishableKey },
		});
		if (r.ok) {
			result.authConnection = 'PASS';
			result.supabaseConnection = 'PASS';
		} else {
			result.authConnection = `FAIL (HTTP ${r.status})`;
		}
	} catch (err) {
		result.authConnection = `FAIL (${safeErrorMessage(err)})`;
	}

	// 2) Database read/write — uses a dedicated `connection_test` table.
	//    If that table doesn't exist yet, this is reported as NOT_CONFIGURED
	//    rather than FAIL (it's an expected state before the schema exists),
	//    with the one-line SQL to create it.
	const TABLE_MISSING_HINT =
		"create table if not exists public.connection_test (id bigint generated always as identity primary key, note text, created_at timestamptz not null default now());";
	try {
		const { data: readData, error: readErr } = await supabaseAdmin
			.from('connection_test')
			.select('id')
			.limit(1);
		if (readErr) {
			if (String(readErr.code) === '42P01' || /does not exist/i.test(readErr.message || '')) {
				result.databaseRead = 'NOT_CONFIGURED';
				result.databaseWrite = 'NOT_CONFIGURED';
				result.databaseHint = `Table "connection_test" does not exist yet. Create it once via the Supabase SQL editor: ${TABLE_MISSING_HINT}`;
			} else {
				result.databaseRead = `FAIL (${safeErrorMessage(readErr)})`;
			}
		} else {
			result.databaseRead = 'PASS';
			result.supabaseConnection = 'PASS';

			// Only attempt the write test if read succeeded (table exists).
			const marker = `diagnostic-${Date.now()}`;
			const { data: inserted, error: writeErr } = await supabaseAdmin
				.from('connection_test')
				.insert({ note: marker })
				.select('id')
				.single();
			if (writeErr) {
				result.databaseWrite = `FAIL (${safeErrorMessage(writeErr)})`;
			} else {
				result.databaseWrite = 'PASS';
				// Clean up the row we just wrote — this endpoint must never
				// leave test data behind.
				if (inserted?.id) {
					await supabaseAdmin.from('connection_test').delete().eq('id', inserted.id);
				}
			}
		}
	} catch (err) {
		result.databaseRead = `FAIL (${safeErrorMessage(err)})`;
	}

	// 3) Storage — lists buckets only (never uploads/deletes a real file).
	try {
		const { data: buckets, error: storageErr } = await supabaseAdmin.storage.listBuckets();
		if (storageErr) {
			result.storage = `FAIL (${safeErrorMessage(storageErr)})`;
		} else {
			result.storage = Array.isArray(buckets) && buckets.length > 0 ? 'PASS' : 'NOT_CONFIGURED';
			result.storageBuckets = (buckets || []).map((b) => b.name);
		}
	} catch (err) {
		result.storage = `FAIL (${safeErrorMessage(err)})`;
	}

	return res.json(result);
});

export default router;
