// Client-side PDF text extraction using pdfjs-dist.
// Used to pull readable text out of an uploaded PDF so it can be sent to the
// Integrated AI model for structured field extraction. Works for text-based
// PDFs (title deeds, SPAs, payment plans, lease contracts) in Arabic and
// English. Scanned/image-only PDFs won't yield text — surfaced as an error.
import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves the worker as a URL string at build time. The `?url` suffix
// is a Vite feature, so eslint's import resolver can't see it — disable here.
// eslint-disable-next-line import/no-unresolved
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 60;
const MAX_CHARS = 80000;

/**
 * Extract concatenated text from a PDF File.
 * @param {File} file
 * @returns {Promise<string>} extracted text (page breaks as "\n\n")
 */
async function pageText(pdf, pageNum) {
  const page = await pdf.getPage(pageNum);
  try {
    const content = await page.getTextContent();
    const items = Array.isArray(content?.items) ? content.items : [];
    return items
      .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  } finally {
    try {
      page.cleanup?.();
    } catch {
      /* ignore */
    }
  }
}

export async function extractPdfText(file, opts = {}) {
  // Reuse a pre-read buffer when the caller already loaded the file once.
  const arrayBuffer =
    opts.arrayBuffer ||
    (file?._efArrayBuffer ? file._efArrayBuffer : await file.arrayBuffer());
  if (file && !file._efArrayBuffer) {
    try {
      file._efArrayBuffer = arrayBuffer;
    } catch {
      /* File may be sealed */
    }
  }
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const parts = new Array(pageCount);
  const BATCH = 4;
  for (let start = 1; start <= pageCount; start += BATCH) {
    const jobs = [];
    for (let i = start; i < start + BATCH && i <= pageCount; i += 1) {
      const idx = i - 1;
      jobs.push(
        pageText(pdf, i).then((t) => {
          parts[idx] = t || '';
        }),
      );
    }
    await Promise.all(jobs);
    // Yield so the UI can paint progress between batches.
    await new Promise((r) => setTimeout(r, 0));
  }

  await pdf.destroy();

  const full = parts.filter(Boolean).join('\n\n');
  if (!full) {
    throw new Error('NO_TEXT');
  }
  return full.length > MAX_CHARS ? full.slice(0, MAX_CHARS) : full;
}

export default extractPdfText;
