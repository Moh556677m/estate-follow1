import multer from 'multer';

const FILE_SIGNATURES = [
	{
		mime: 'image/jpeg',
		matches: (buffer) => buffer.length >= 3
			&& buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF,
	},
	{
		mime: 'image/png',
		matches: (buffer) => buffer.length >= 8
			&& buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
			&& buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A,
	},
	{
		mime: 'image/webp',
		matches: (buffer) => buffer.length >= 12
			&& buffer.toString('ascii', 0, 4) === 'RIFF'
			&& buffer.toString('ascii', 8, 12) === 'WEBP',
	},
	{
		mime: 'application/pdf',
		matches: (buffer) => buffer.length >= 5
			&& buffer.toString('ascii', 0, 5) === '%PDF-',
	},
	{
		// HEIC / HEIF (ISO BMFF) — ftyp box with heic/heif/mif1/msf1 brands
		mime: 'image/heic',
		matches: (buffer) => {
			if (buffer.length < 12) return false;
			if (buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
			const brand = buffer.toString('ascii', 8, 12).toLowerCase();
			return /^(heic|heif|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(brand);
		},
	},
];

const detectFileMime = (buffer) => FILE_SIGNATURES.find((sig) => sig.matches(buffer))?.mime ?? null;

/** Normalize browser-declared MIME (empty, octet-stream, heif variants). */
function normalizeDeclaredMime(mimetype = '', originalname = '') {
	const m = String(mimetype || '').toLowerCase().trim();
	const name = String(originalname || '').toLowerCase();
	if (m === 'image/jpg') return 'image/jpeg';
	if (m === 'image/heif' || m === 'image/heic-sequence' || m === 'image/heif-sequence') {
		return 'image/heic';
	}
	if (!m || m === 'application/octet-stream') {
		if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
		if (/\.png$/i.test(name)) return 'image/png';
		if (/\.webp$/i.test(name)) return 'image/webp';
		if (/\.pdf$/i.test(name)) return 'application/pdf';
		if (/\.heic$/i.test(name)) return 'image/heic';
		if (/\.heif$/i.test(name)) return 'image/heic';
	}
	return m;
}

function isMimeAllowed(mime, allowedMimeTypes) {
	if (!mime) return false;
	if (allowedMimeTypes.includes(mime)) return true;
	// Treat heif as heic when either is allowed
	if (mime === 'image/heic' || mime === 'image/heif') {
		return allowedMimeTypes.some((a) => a === 'image/heic' || a === 'image/heif');
	}
	if (mime === 'image/jpeg' && allowedMimeTypes.includes('image/jpg')) return true;
	return false;
}

export const uploadFiles = ({
	maxCount = 12,
	// Raised to match site-wide open upload policy (host/storage may still cap).
	maxSizeMB = 512,
	maxFieldSizeBytes = 2 * 1024 * 1024,
	allowedMimeTypes,
	fieldName,
	// When true, accept ANY file type/size (no magic-byte allow-list). Used by
	// the Smart Payment Plan Reader where the user may upload any PDF/image in
	// any language and any size. MIME is still normalized from magic bytes when
	// detectable, falling back to the browser-declared type.
	allowAny = false,
}) => {
	const upload = multer({
		storage: multer.memoryStorage(),
		limits: {
			fileSize: maxSizeMB * 1024 * 1024,
			fieldSize: maxFieldSizeBytes,
			files: maxCount,
		},
		fileFilter: allowAny
			? (req, file, cb) => {
					const declared = normalizeDeclaredMime(file.mimetype, file.originalname);
					file.mimetype = declared || file.mimetype;
					cb(null, true);
				}
			: (req, file, cb) => {
					const declared = normalizeDeclaredMime(file.mimetype, file.originalname);
					file.mimetype = declared || file.mimetype;
					if (isMimeAllowed(declared, allowedMimeTypes) || isMimeAllowed(file.mimetype, allowedMimeTypes)) {
						cb(null, true);
					} else {
						// Empty MIME from some mobile browsers — allow and re-check via magic bytes
						if (!declared || declared === 'application/octet-stream') {
							cb(null, true);
							return;
						}
						cb(new Error(`Invalid file type. Only ${allowedMimeTypes.join(', ')} are allowed.`));
					}
				},
	});

	const runMulter = upload.array(fieldName, maxCount);

	return (req, res, next) => {
		runMulter(req, res, (err) => {
			if (err) {
				next(err);
				return;
			}

			try {
				if (allowAny) {
					// Light normalization only: set mimetype from magic bytes when
					// detectable, else keep the declared type. No type rejection.
					for (const file of req.files ?? []) {
						const detectedMime = detectFileMime(file.buffer);
						if (detectedMime) file.mimetype = detectedMime;
					}
					next();
				} else {
					validateFileContents({ files: req.files, allowedMimeTypes });
					next();
				}
			} catch (validationError) {
				next(validationError);
			}
		});
	};
};

function validateFileContents({ files, allowedMimeTypes }) {
	for (const file of files ?? []) {
		const detectedMime = detectFileMime(file.buffer);
		const declared = normalizeDeclaredMime(file.mimetype, file.originalname);

		// Prefer magic-byte detection; fall back to declared MIME when magic is unknown
		// (e.g. some HEIC variants / progressive formats).
		const effective = detectedMime || declared;

		if (!isMimeAllowed(effective, allowedMimeTypes)) {
			throw new Error(`Invalid file content. Only ${allowedMimeTypes.join(', ')} are allowed.`);
		}

		// Normalize mimetype on the file object for downstream consumers
		if (detectedMime) {
			file.mimetype = detectedMime === 'image/heic' && declared === 'image/heif'
				? 'image/heic'
				: detectedMime;
		} else if (declared) {
			file.mimetype = declared;
		}
	}
}
