const MIN_LENGTH = 10;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function passwordIssues(password) {
  const p = String(password || '');
  const issues = [];
  if (p.length < MIN_LENGTH) issues.push(`au moins ${MIN_LENGTH} caractères`);
  if (p.length > 72) issues.push('72 caractères maximum');
  if (!/[A-Za-zÀ-ÿ]/.test(p)) issues.push('une lettre');
  if (!/\d/.test(p)) issues.push('un chiffre');
  return issues;
}

function assertPassword(password) {
  const issues = passwordIssues(password);
  if (issues.length) {
    const err = new Error(`Mot de passe trop faible : ${issues.join(', ')}`);
    err.status = 400;
    throw err;
  }
}

function passwordScore(password) {
  const p = String(password || '');
  let score = 0;
  if (p.length >= MIN_LENGTH) score += 1;
  if (p.length >= 14) score += 1;
  if (/[A-ZÀ-Ÿ]/.test(p) && /[a-zà-ÿ]/.test(p)) score += 1;
  if (/\d/.test(p)) score += 1;
  if (/[^A-Za-z0-9]/.test(p)) score += 1;
  return Math.min(score, 4);
}

module.exports = { MIN_LENGTH, normalizeEmail, isValidEmail, passwordIssues, assertPassword, passwordScore };
