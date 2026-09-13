// Thin safety wrapper around the platform integratedAiClient.
// The platform client does `images.forEach(...)` without a default, which
// throws "undefined is not a function" when images is omitted. This wrapper
// always supplies a real array so document extraction never crashes the form.
// Also appends optional `language` for Estate AI (platform client only sends message).
import { integratedAiClient as rawClient } from '@/lib/integratedAiClient';

const API_SERVER_URL = '/hcgi/api';

function getPocketbaseToken() {
  try {
    const pocketbaseToken = localStorage.getItem('pocketbase_auth');
    if (!pocketbaseToken) return undefined;
    const bytes = new TextEncoder().encode(pocketbaseToken);
    const binary = String.fromCharCode(...bytes);
    return btoa(binary);
  } catch {
    return undefined;
  }
}

export const integratedAiClient = {
  fetch: (...args) => rawClient.fetch(...args),
  stream: async (path, opts = {}) => {
    const images = Array.isArray(opts.images) ? opts.images : [];
    const language = opts.body?.language || opts.language;

    // Estate AI needs language on the multipart body; platform client only
    // appends message + images. Use a local FormData path when language is set.
    if (language && path && String(path).includes('estate-ai')) {
      const pocketbaseToken = getPocketbaseToken();
      const headers = {
        Accept: 'text/event-stream',
        ...(pocketbaseToken && { Authorization: `Bearer ${pocketbaseToken}` }),
      };
      const formData = new FormData();
      formData.append('message', JSON.stringify(opts.body?.message ?? []));
      formData.append('language', String(language));
      images.forEach((image) => {
        formData.append('images', image);
      });
      const response = await window.fetch(API_SERVER_URL + path, {
        method: 'POST',
        headers,
        body: formData,
        signal: opts.signal,
      });
      if (!response.ok) {
        const errorBody = await response.text();
        let message;
        try {
          const parsed = JSON.parse(errorBody);
          message = parsed?.error?.message || parsed?.message;
        } catch {
          message = errorBody;
        }
        const error = new Error(message || `Request failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      if (!response.body) throw new Error('No response body');
      return response;
    }

    return rawClient.stream(path, { ...opts, images });
  },
};

export default integratedAiClient;
