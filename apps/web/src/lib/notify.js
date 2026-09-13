// Unified notification helper for Estate Follow.
//
// Every user-facing alert (success, error, reminder, info) goes through this
// module so the look & feel is identical across the whole site: a Toast/Banner
// pinned to the top-center of the screen with a short title + a one-line
// description, auto-dismissing after a few seconds and dismissible manually.
//
// Backed by `sonner` (already installed). The <Toaster /> is mounted once in
// App.jsx with position="top-center", richColors and a close button.
//
// Usage:
//   import { notify } from '@/lib/notify';
//   notify.success(t('saved'), t('property_saved_desc'));
//   notify.error(t('something_wrong'), err.message);
//   notify.info(t('new_notification'), body);
//   notify.warning(t('plan_mismatch'), t('plan_mismatch_hint'));

import { toast } from 'sonner';

// Durations (ms). Errors stay longer because they need reading + action.
const SUCCESS_MS = 3500;
const INFO_MS = 4500;
const WARNING_MS = 5500;
const ERROR_MS = 7000;

function call(variant, title, description, opts = {}) {
  const duration = opts.duration ?? (
    variant === 'error' ? ERROR_MS
      : variant === 'warning' ? WARNING_MS
        : variant === 'info' ? INFO_MS
          : SUCCESS_MS
  );
  // sonner accepts a string or a node as the first arg; we pass the title and
  // attach the description separately so it renders under the title.
  return toast[variant](title, {
    description,
    duration,
    // Keep the manual close button on every toast.
    closeButton: true,
    ...opts,
  });
}

export const notify = {
  success: (title, description, opts) => call('success', title, description, opts),
  error: (title, description, opts) => call('error', title, description, opts),
  info: (title, description, opts) => call('info', title, description, opts),
  warning: (title, description, opts) => call('warning', title, description, opts),
  // Generic message (no variant color) — kept for callers that only have text.
  message: (title, description, opts) => toast(title, { description, closeButton: true, duration: opts?.duration ?? INFO_MS, ...opts }),
};

export default notify;
