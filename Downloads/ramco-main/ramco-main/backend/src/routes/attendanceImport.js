const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const prisma = require('../prisma');
const { attendanceStatusFromTime } = require('../utils/business');
const { getSettings } = require('../settings');
const { logAudit } = require('../middleware/audit');
const { brandWorkbook, paintHeader, styleHeaderRow, styleDataRow, sendWorkbook, BRAND } = require('../branding');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const HEADERS = ['Matricule', 'Date', 'Heure', 'Site'];

function parseDay(value) {
  if (value instanceof Date && !isNaN(value)) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (value && typeof value === 'object' && value.text) return parseDay(value.text);
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const serial = Number(s);
  if (serial > 20000 && serial < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
    return new Date(epoch.getUTCFullYear(), epoch.getUTCMonth(), epoch.getUTCDate());
  }
  const d = new Date(s);
  if (!isNaN(d)) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return null;
}

function parseTimeOnDay(day, value) {
  if (value instanceof Date && !isNaN(value)) {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), value.getHours(), value.getMinutes(), value.getSeconds());
  }
  if (value && typeof value === 'object' && value.text) return parseTimeOnDay(day, value.text);
  const s = String(value || '').trim();
  const hm = s.match(/^(\d{1,2})[:hH](\d{2})(?::(\d{2}))?/);
  if (hm) {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(hm[1]), Number(hm[2]), Number(hm[3] || 0));
  }
  const n = Number(s);
  if (n > 0 && n < 1) {
    const minutes = Math.round(n * 24 * 60);
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
  }
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8, 0, 0);
}

router.get('/template', async (req, res) => {
  const sites = await prisma.site.findMany({ orderBy: { name: 'asc' } });
  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIF' },
    take: 2,
    orderBy: { matricule: 'asc' },
    include: { site: true },
  });

  const workbook = brandWorkbook('Modèle import présences');
  const sheet = workbook.addWorksheet('Présences', { properties: { tabColor: { argb: BRAND.red } } });
  sheet.columns = HEADERS.map((h) => ({ key: h, width: 16 }));

  const headerRowNum = paintHeader(sheet, {
    title: 'Modèle d’import des présences',
    subtitle: 'Une ligne = un pointage. Remplacez les exemples à partir de la ligne 6.',
    lastCol: 'D',
    note: 'Colonnes : Matricule, Date (AAAA-MM-JJ), Heure (HH:MM), Site (optionnel, sinon le site de l’employé). Un employé ne peut être pointé qu’une fois par jour.',
  });

  HEADERS.forEach((h, i) => {
    sheet.getRow(headerRowNum).getCell(i + 1).value = h;
  });
  styleHeaderRow(sheet, headerRowNum, HEADERS.length);

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const examples = (employees.length ? employees : [
    { matricule: 'EMP-001', site: { name: sites[0]?.name || 'Agence Assivito' } },
    { matricule: 'EMP-002', site: { name: sites[1]?.name || sites[0]?.name || 'Kara' } },
  ]).map((e, i) => ({
    Matricule: e.matricule,
    Date: iso,
    Heure: i === 0 ? '07:55' : '08:42',
    Site: e.site?.name || '',
  }));
  examples.forEach((ex) => {
    const row = sheet.addRow(ex);
    styleDataRow(sheet, row.number, HEADERS.length, { example: true });
  });

  sheet.dataValidations.add('B6:B500', {
    type: 'date',
    operator: 'greaterThan',
    formulae: [new Date(2000, 0, 1)],
    allowBlank: false,
    showErrorMessage: true,
    errorTitle: 'Date',
    error: 'Indiquez une date valide',
  });
  if (sites.length) {
    const list = `"${sites.map((s) => s.name.replace(/"/g, '')).join(',')}"`;
    if (list.length < 250) {
      sheet.dataValidations.add('D6:D500', {
        type: 'list',
        allowBlank: true,
        formulae: [list],
        showErrorMessage: true,
        errorTitle: 'Site',
        error: 'Choisissez un site existant, ou laissez vide',
      });
    }
  }

  const guide = workbook.addWorksheet('Guide', { properties: { tabColor: { argb: BRAND.ink } } });
  guide.columns = [{ width: 18 }, { width: 68 }];
  paintHeader(guide, {
    title: 'Guide de remplissage',
    subtitle: 'L’assistant RH reporte ici le suivi quotidien des sites (option 2 du CDC).',
    lastCol: 'B',
  });
  guide.getRow(5).values = [undefined, 'Colonne', 'Règle'];
  styleHeaderRow(guide, 5, 2);
  const rules = [
    ['Matricule', 'Doit correspondre à un employé ACTIF déjà créé.'],
    ['Date', 'Jour du pointage, format AAAA-MM-JJ.'],
    ['Heure', 'Heure d’arrivée HH:MM. Vide = 08:00. Le retard est calculé selon le seuil RH.'],
    ['Site', 'Optionnel. Sinon le site rattaché à l’employé. Doit exister dans l’application.'],
    ['Doublon', 'Un matricule ne peut pas être importé deux fois pour le même jour (déjà scanné ou déjà dans le fichier).'],
    ['Congé', 'Un employé en congé justifié ce jour-là est refusé.'],
  ];
  rules.forEach((r) => {
    const row = guide.addRow(r);
    styleDataRow(guide, row.number, 2);
  });

  return sendWorkbook(res, workbook, 'modele-import-presences.xlsx');
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file.buffer);
  } catch {
    return res.status(400).json({ error: 'Fichier Excel invalide ou corrompu' });
  }

  const sheet = workbook.worksheets.find((s) => s.name.toLowerCase() !== 'guide') || workbook.worksheets[0];
  if (!sheet) return res.status(400).json({ error: 'Le fichier ne contient aucune feuille' });

  let headerRowNum = 1;
  for (let r = 1; r <= Math.min(sheet.rowCount, 12); r++) {
    const labels = sheet.getRow(r).values.slice(1).map((v) => String(v || '').trim().toLowerCase());
    if (labels.includes('matricule') && labels.includes('date')) {
      headerRowNum = r;
      break;
    }
  }
  const headerRow = sheet.getRow(headerRowNum).values.slice(1).map((v) => String(v || '').trim());
  const colIndex = {};
  HEADERS.forEach((h) => {
    colIndex[h] = headerRow.findIndex((v) => v.toLowerCase() === h.toLowerCase());
  });
  if (colIndex.Matricule === -1 || colIndex.Date === -1) {
    return res.status(400).json({ error: 'Colonnes obligatoires manquantes : Matricule, Date' });
  }

  const [sites, employees, settings, existingRows, absences] = await Promise.all([
    prisma.site.findMany(),
    prisma.employee.findMany({ include: { site: true } }),
    getSettings(),
    prisma.attendance.findMany({ select: { employeeId: true, date: true } }),
    prisma.absence.findMany({ where: { justified: true }, select: { employeeId: true, startDate: true, endDate: true } }),
  ]);
  const siteByName = new Map(sites.map((s) => [s.name.toLowerCase(), s]));
  const employeeByMat = new Map(employees.map((e) => [e.matricule.toLowerCase(), e]));
  const existSet = new Set(existingRows.map((a) => {
    const d = new Date(a.date);
    return `${a.employeeId}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));

  const results = { success: 0, skipped: 0, errors: [] };
  const seen = new Set();

  for (let rowNum = headerRowNum + 1; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    if (row.values.length <= 1) continue;

    const get = (h) => {
      const idx = colIndex[h];
      if (idx === -1) return '';
      const v = row.values[idx + 1];
      if (v == null) return '';
      return v;
    };

    const matriculeRaw = get('Matricule');
    const matricule = String(matriculeRaw == null ? '' : matriculeRaw).trim();
    const dateRaw = get('Date');
    const timeRaw = get('Heure');
    const siteRaw = get('Site');
    if (!matricule && !dateRaw) continue;
    if (!matricule || !dateRaw) {
      results.errors.push({ row: rowNum, message: 'Matricule et Date sont obligatoires' });
      continue;
    }

    const employee = employeeByMat.get(matricule.toLowerCase());
    if (!employee) {
      results.errors.push({ row: rowNum, message: `Matricule ${matricule} introuvable` });
      continue;
    }
    if (employee.status !== 'ACTIF' || !employee.qrActive) {
      results.errors.push({ row: rowNum, message: `${matricule} n’est plus actif (badge désactivé)` });
      continue;
    }

    const dateOnly = parseDay(dateRaw);
    if (!dateOnly) {
      results.errors.push({ row: rowNum, message: `Date invalide : ${dateRaw}` });
      continue;
    }

    const key = `${employee.id}|${dateOnly.getFullYear()}-${dateOnly.getMonth()}-${dateOnly.getDate()}`;
    if (seen.has(key)) {
      results.errors.push({ row: rowNum, message: `${matricule} déjà présent dans le fichier pour cette date` });
      continue;
    }

    let siteName = employee.site.name;
    const siteLabel = String(siteRaw || '').trim();
    if (siteLabel) {
      const site = siteByName.get(siteLabel.toLowerCase());
      if (!site) {
        results.errors.push({ row: rowNum, message: `Site « ${siteLabel} » introuvable` });
        continue;
      }
      siteName = site.name;
    }

    const onLeave = absences.some((a) => {
      if (a.employeeId !== employee.id) return false;
      const start = new Date(a.startDate);
      const end = new Date(a.endDate);
      return start <= dateOnly && end >= dateOnly;
    });
    if (onLeave) {
      results.errors.push({ row: rowNum, message: `${matricule} est en congé justifié ce jour-là` });
      continue;
    }

    if (existSet.has(key)) {
      results.skipped++;
      results.errors.push({ row: rowNum, message: `${matricule} déjà pointé le ${dateOnly.toLocaleDateString('fr-FR')}` });
      continue;
    }

    const time = parseTimeOnDay(dateOnly, timeRaw);
    const status = attendanceStatusFromTime(time, settings.lateHour, settings.lateMinute);

    try {
      await prisma.attendance.create({
        data: {
          employeeId: employee.id,
          date: dateOnly,
          time,
          siteName,
          status,
          method: 'MANUEL',
          scannedById: req.user.id,
        },
      });
      seen.add(key);
      existSet.add(key);
      results.success++;
    } catch (e) {
      results.errors.push({ row: rowNum, message: `Insertion impossible : ${e.message}` });
    }
  }

  await logAudit(req.user.id, 'IMPORT', 'Attendance', null, null, {
    success: results.success,
    skipped: results.skipped,
    errors: results.errors.length,
  });
  res.json(results);
});

module.exports = router;
