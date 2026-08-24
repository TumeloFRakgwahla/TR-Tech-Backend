const toSafeString = (value) => (typeof value === 'string' ? value : undefined);

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { toSafeString, escapeRegex };
