import crypto from 'node:crypto';

// AES-256-GCM encryption for payment-gateway secrets at rest.
// Shared by the payment-gateways admin route and the Stripe webhook so both
// use the exact same key derivation. The key is derived from a dedicated env
// var, falling back to the superuser password (stable + required for the API
// server to boot).
const RAW_KEY =
	process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY ||
	process.env.PB_SUPERUSER_PASSWORD ||
	'estatefollow-payment-gateways-fallback';
const ENC_KEY = crypto.createHash('sha256').update(RAW_KEY).digest(); // 32 bytes

export function encrypt(plaintext) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
	const ct = Buffer.concat([
		cipher.update(String(plaintext), 'utf8'),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return {
		iv: iv.toString('base64'),
		ct: ct.toString('base64'),
		tag: tag.toString('base64'),
	};
}

export function decrypt(blob) {
	try {
		const iv = Buffer.from(blob.iv, 'base64');
		const ct = Buffer.from(blob.ct, 'base64');
		const tag = Buffer.from(blob.tag, 'base64');
		const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
		decipher.setAuthTag(tag);
		const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
		return plain.toString('utf8');
	} catch {
		return null;
	}
}

export default { encrypt, decrypt };
