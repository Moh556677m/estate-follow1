import { Buffer } from 'node:buffer';
import Pocketbase from 'pocketbase';

function unauthorizedError(message) {
	const error = new Error(message);
	error.status = 401;
	return error;
}

function forbiddenError(message) {
	const error = new Error(message);
	error.status = 403;
	return error;
}

export async function pocketbaseAuth(req, res, next) {
	const token = req.headers.authorization?.split(' ')?.[1];

	// Auth is enforced by default. To allow public (anonymous) access, remove this
	// middleware from the route (apps/api/src/routes/integrated-ai.js).
	if (!token) {
		return next(unauthorizedError('Please sign in or create an account to use the chat.'));
	}

	try {
		const base64Decoded = Buffer.from(token, 'base64').toString('utf-8');
		const tokenData = JSON.parse(base64Decoded);

		if (!tokenData?.token || !tokenData?.record) {
			return next(unauthorizedError('Your session has expired. Please sign in again.'));
		}

		// by refreshing token we verify that it was not intercepted by a malicious user
		const pocketbaseClient = new Pocketbase(process.env.POCKETBASE_URL || 'http://localhost:8090');
		pocketbaseClient.authStore.save(tokenData.token, tokenData.record);
		const newToken = await pocketbaseClient.collection(tokenData.record.collectionName).authRefresh();

		if (!newToken.record.verified) {
			return next(forbiddenError('Please verify your email to use the chat. Check your inbox for the verification link.'));
		}

		req.pocketbaseUserId = newToken.record.id;

		return next();
	} catch {
		return next(unauthorizedError('Your session has expired. Please sign in again.'));
	}
}
