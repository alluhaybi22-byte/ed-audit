const path = require('node:path');

const APP_URL = 'audit://app/index.html';
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "form-action 'none'",
].join('; ');

function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'audit:' && url.hostname === 'app' &&
      !url.port && !url.username && !url.password;
  } catch {
    return false;
  }
}

function assetPath(root, value) {
  if (!isAppUrl(value)) return null;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    if (pathname.includes('\0') || pathname.includes('\\')) return null;
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    return file.startsWith(path.resolve(root) + path.sep) ? file : null;
  } catch {
    return null;
  }
}

function isLocalRequest(value) {
  return isAppUrl(value) || value.startsWith('blob:audit://app/') ||
    value.startsWith('data:image/');
}

function downloadName(value) {
  const name = path.win32.basename(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  return name && name !== '.' && name !== '..' ? name : 'ED-Audit-Export';
}

module.exports = { APP_URL, CONTENT_SECURITY_POLICY, isAppUrl, assetPath, isLocalRequest, downloadName };
