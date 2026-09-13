/**
 * In-memory cache for section / document AI extraction results.
 * Keyed by section + file identity (name/size/mtime) or text hash.
 * Avoids re-uploading / re-analyzing the same file when the user reopens AI.
 */

const MAX_ENTRIES = 40;
const store = new Map();

function touch(key, entry) {
  store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function fileIdentity(file) {
  if (!file) return '';
  return `${file.name || 'file'}|${file.size || 0}|${file.lastModified || 0}|${file.type || ''}`;
}

export function textIdentity(text) {
  const s = String(text || '');
  // Fast non-crypto fingerprint
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `t:${s.length}:${h}`;
}

export function cacheKey(parts) {
  return (Array.isArray(parts) ? parts : [parts]).filter(Boolean).join('::');
}

export function getAiCache(key) {
  if (!key || !store.has(key)) return null;
  const entry = store.get(key);
  touch(key, entry);
  return entry?.value ?? null;
}

export function setAiCache(key, value) {
  if (!key || value == null) return;
  touch(key, { value, at: Date.now() });
}

export function getPdfTextCache(file) {
  const key = cacheKey(['pdf-text', fileIdentity(file)]);
  return getAiCache(key);
}

export function setPdfTextCache(file, text) {
  setAiCache(cacheKey(['pdf-text', fileIdentity(file)]), text);
}

export default {
  fileIdentity,
  textIdentity,
  cacheKey,
  getAiCache,
  setAiCache,
  getPdfTextCache,
  setPdfTextCache,
};
