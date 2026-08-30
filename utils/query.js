// Ensures a value is a string before using it in a Mongoose query filter.
// Prevents type coercion attacks where non-string values are passed as filters.
const toSafeString = (value) => (typeof value === 'string' ? value : undefined);

// Escapes special regex characters in a string to prevent ReDoS and unintended pattern matching.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { toSafeString, escapeRegex };
