export function normalizeRelativePath(input = '') {
  if (!input) return '';

  const normalized = input
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(segment => segment && segment !== '.' && segment !== '..')
    .join('/');

  return normalized;
}

export default {
  normalizeRelativePath
};
