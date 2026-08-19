// Paramètres RH configurables. Une seule ligne en base (HrSetting id=1),
// fusionnée avec ces valeurs par défaut : un champ ajouté dans DEFAULTS
// est donc pris en compte immédiatement, même sans nouvelle migration.
// Accès SQL brut pour rester compatible si le client Prisma n'a pas encore
// été régénéré (fichier query_engine parfois verrouillé par nodemon).

const prisma = require('./prisma');

const DEFAULTS = {
  companyName: 'SUPERAMCO',
  currency: 'FCFA',

  lateHour: 8,
  lateMinute: 30,

  cddMaxYears: 4,
  cddAlertYearsBefore: 0.5,

  defaultAnnualLeaveDays: 30,
  salaryDaysPerMonth: 30,

  indemnityRateDemission: 0,
  indemnityRateFinCdd: 0.25,
  indemnityRateRetraite: 0.5,
  indemnityRateLicenciement: 0.25,

  noticeDaysDemission: 30,
  noticeDaysFinCdd: 0,
  noticeDaysRetraite: 90,
  noticeDaysLicenciement: 30,

  retirementAge: 60,
};

const TEST_FROM = 'SUPERAMCO RH <onboarding@' + 'resend.dev>';

const INDEMNITY_KEY = {
  DEMISSION: 'indemnityRateDemission',
  FIN_CDD: 'indemnityRateFinCdd',
  RETRAITE: 'indemnityRateRetraite',
  LICENCIEMENT: 'indemnityRateLicenciement',
};

const NOTICE_KEY = {
  DEMISSION: 'noticeDaysDemission',
  FIN_CDD: 'noticeDaysFinCdd',
  RETRAITE: 'noticeDaysRetraite',
  LICENCIEMENT: 'noticeDaysLicenciement',
};

function mergeSettings(stored) {
  return { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) };
}

async function getSettings() {
  const rows = await prisma.$queryRaw`SELECT data FROM "HrSetting" WHERE id = 1`;
  return mergeSettings(rows[0]?.data);
}

function sanitizeSettings(input, current = {}, { updateMail = false } = {}) {
  const next = mergeSettings({ ...current, ...input });
  const numbers = [
    'lateHour',
    'lateMinute',
    'cddMaxYears',
    'cddAlertYearsBefore',
    'defaultAnnualLeaveDays',
    'salaryDaysPerMonth',
    'indemnityRateDemission',
    'indemnityRateFinCdd',
    'indemnityRateRetraite',
    'indemnityRateLicenciement',
    'noticeDaysDemission',
    'noticeDaysFinCdd',
    'noticeDaysRetraite',
    'noticeDaysLicenciement',
    'retirementAge',
  ];
  for (const key of numbers) {
    const n = Number(next[key]);
    if (Number.isNaN(n) || n < 0) {
      throw new Error(`Valeur invalide pour ${key}`);
    }
    next[key] = n;
  }
  if (next.lateHour > 23) throw new Error('L\'heure limite de pointage doit être entre 0 et 23');
  if (next.lateMinute > 59) throw new Error('Les minutes de pointage doivent être entre 0 et 59');
  if (next.cddMaxYears < 0.5) throw new Error('La durée maximale des CDD doit être au moins 0,5 an');
  if (next.salaryDaysPerMonth < 1) throw new Error('Le nombre de jours de salaire par mois doit être au moins 1');
  next.companyName = String(next.companyName || DEFAULTS.companyName).trim() || DEFAULTS.companyName;
  next.currency = String(next.currency || DEFAULTS.currency).trim() || DEFAULTS.currency;
  if (!updateMail) {
    next.mailFrom = String(current.mailFrom || '');
    next.appUrl = String(current.appUrl || '');
    next.resendApiKey = String(current.resendApiKey || '');
    return next;
  }
  next.mailFrom = String(next.mailFrom || '').trim();
  next.appUrl = String(next.appUrl || '').trim().replace(/\/$/, '');
  const incomingKey = String(next.resendApiKey || '').trim();
  const keepPrevious = !incomingKey || incomingKey.includes('•');
  next.resendApiKey = keepPrevious ? String(current.resendApiKey || '') : incomingKey;
  return next;
}

async function saveSettings(input, userId, options = {}) {
  const current = await getSettings();
  const data = sanitizeSettings(input, current, options);
  const payload = JSON.stringify(data);
  const user = userId || null;
  await prisma.$executeRaw`
    INSERT INTO "HrSetting" (id, data, "updatedAt", "updatedBy")
    VALUES (1, ${payload}::jsonb, NOW(), ${user})
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      "updatedAt" = NOW(),
      "updatedBy" = EXCLUDED."updatedBy"
  `;
  return data;
}

function publicSettings(settings) {
  const key = String(settings.resendApiKey || '').trim();
  const envKey = String(process.env.RESEND_API_KEY || '').trim();
  return {
    ...settings,
    resendApiKey: '',
    resendConfigured: Boolean(key || envKey),
    mailFrom: settings.mailFrom || process.env.MAIL_FROM || TEST_FROM,
    appUrl: settings.appUrl || process.env.APP_URL || 'http://localhost:5173',
  };
}

function redactSettings(settings) {
  const copy = { ...settings };
  if (copy.resendApiKey) copy.resendApiKey = '[enregistrée]';
  return copy;
}

async function getMailConfig() {
  const settings = await getSettings();
  return {
    apiKey: String(settings.resendApiKey || process.env.RESEND_API_KEY || '').trim(),
    from: String(settings.mailFrom || process.env.MAIL_FROM || TEST_FROM).trim(),
    appUrl: String(settings.appUrl || process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  };
}

function indemnityRateFor(reason, settings) {
  const key = INDEMNITY_KEY[reason] || INDEMNITY_KEY.DEMISSION;
  return Number(settings[key] || 0);
}

function noticeDaysFor(reason, settings) {
  const key = NOTICE_KEY[reason] || NOTICE_KEY.DEMISSION;
  return Number(settings[key] || 0);
}

function formatLateThreshold(settings) {
  const h = String(settings.lateHour).padStart(2, '0');
  const m = String(settings.lateMinute).padStart(2, '0');
  return `${h}:${m}`;
}

module.exports = {
  DEFAULTS,
  getSettings,
  saveSettings,
  publicSettings,
  redactSettings,
  getMailConfig,
  indemnityRateFor,
  noticeDaysFor,
  formatLateThreshold,
};
