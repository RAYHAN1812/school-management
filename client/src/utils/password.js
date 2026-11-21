// Mirrors the server's password policy for instant feedback.
export const PASSWORD_CHECKS = [
  { id: 'length', label: '8+ characters', test: (v) => v.length >= 8 && v.length <= 72 },
  { id: 'upper', label: 'Uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'Lowercase letter', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'Number', test: (v) => /\d/.test(v) },
  { id: 'symbol', label: 'Symbol', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export const isStrongPassword = (v = '') => PASSWORD_CHECKS.every((c) => c.test(v));
