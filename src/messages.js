// Centralized message resources (Italian + English)
// Extend as needed; locale fallback order: requested -> 'en'

const fs = require('fs');
const path = require('path');

// Built-in English fallback (authoritative keys)
const EN_MESSAGES = {
  ERR_ANON_DISABLED: 'Anonymous access disabled',
  ERR_INVALID_CREDENTIALS: 'Invalid credentials',
  ERR_DIR_NOT_FOUND: 'Directory not found',
  ERR_ACCESS_DENIED: 'Access denied',
  ERR_DIR_NOT_READABLE: 'Directory not readable',
  ERR_FILE_NOT_FOUND: 'File not found',
  ERR_INVALID_PATH: 'Invalid path',
  ERR_PERMISSION_DENIED_RO: 'Permission denied (read-only)',
  ERR_SHARE_QUOTA_EXCEEDED: 'Share quota exceeded',
  ERR_UPLOAD_LIMIT_EXCEEDED: 'File exceeds upload limit',
  ERR_CREATE_DIR_ROOT: 'Create a directory inside an existing share',
  ERR_RENAME_CROSS_SHARE: 'Rename supported only within the same share',
  ERR_CHMOD_UNSUPPORTED: 'CHMOD not supported in virtual file system',
  ERR_DELETE_FAILED: 'Delete failed'
};

// Dynamic cache of loaded locales (excluding 'en')
const EXTRA = {};

function loadLocale(loc) {
  if (loc === 'en') return EN_MESSAGES;
  if (EXTRA[loc]) return EXTRA[loc];
  const candidates = [
    path.resolve(process.cwd(), 'config', `messages.${loc}.json`),
    path.resolve(__dirname, `messages.${loc}.json`)
  ];
  let loaded = null;
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        loaded = JSON.parse(raw);
        break;
      }
    } catch (e) {
      console.warn(`[i18n] Failed reading ${file}: ${e.message}`);
    }
  }
  if (loaded) {
    EXTRA[loc] = loaded;
    return EXTRA[loc];
  }
  try {
    const fallbackFile = path.resolve(__dirname, `messages.${loc}.json`);
    const raw = fs.readFileSync(fallbackFile, 'utf8');
    EXTRA[loc] = JSON.parse(raw);
  } catch (e) {
    console.warn(`[i18n] Locale file not found or invalid for '${loc}': ${e.message}`);
    EXTRA[loc] = null; // cache miss
  }
  return EXTRA[loc] || EN_MESSAGES;
}

function listLocales() {
  const dirs = [path.resolve(process.cwd(), 'config'), __dirname];
  const seen = new Set();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/^messages\.[a-z0-9_-]+\.json$/i.test(f)) {
        const code = f.replace(/^messages\.|\.json$/g, '');
        if (code && code !== 'en') seen.add(code);
      }
    }
  }
  return ['en', ...[...seen].sort()];
}

function preloadLocales() {
  const all = listLocales();
  for (const loc of all) {
    loadLocale(loc); // caching side-effect
  }
  return all;
}

let FALLBACK_LOCALE = 'en';

function setFallbackLocale(loc) {
  if (loc === 'en' || loadLocale(loc) !== EN_MESSAGES) {
    FALLBACK_LOCALE = loc;
  } else {
    console.warn(`[i18n] Fallback locale '${loc}' not available, using 'en'`);
    FALLBACK_LOCALE = 'en';
  }
}

function msg(locale, key) {
  const primary = loadLocale(locale);
  if (primary && Object.prototype.hasOwnProperty.call(primary, key)) return primary[key];
  const fb = loadLocale(FALLBACK_LOCALE);
  if (fb && Object.prototype.hasOwnProperty.call(fb, key)) return fb[key];
  return EN_MESSAGES[key] || key;
}

module.exports = { msg, setFallbackLocale, listLocales, loadLocale, preloadLocales };
