const MIN_LENGTH = 10;

export function passwordIssues(password) {
  const p = String(password || '');
  const issues = [];
  if (p.length < MIN_LENGTH) issues.push(`${MIN_LENGTH} caractères`);
  if (p.length > 72) issues.push('72 caractères max');
  if (!/[A-Za-zÀ-ÿ]/.test(p)) issues.push('une lettre');
  if (!/\d/.test(p)) issues.push('un chiffre');
  return issues;
}

export function passwordScore(password) {
  const p = String(password || '');
  let score = 0;
  if (p.length >= MIN_LENGTH) score += 1;
  if (p.length >= 14) score += 1;
  if (/[A-ZÀ-Ÿ]/.test(p) && /[a-zà-ÿ]/.test(p)) score += 1;
  if (/\d/.test(p)) score += 1;
  if (/[^A-Za-z0-9]/.test(p)) score += 1;
  return Math.min(score, 4);
}

export function passwordLabel(score) {
  return ['Trop court', 'Faible', 'Correct', 'Solide', 'Fort'][score] || 'Trop court';
}
