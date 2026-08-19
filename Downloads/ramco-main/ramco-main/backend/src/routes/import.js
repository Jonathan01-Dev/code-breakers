// Import Excel en masse : permet d'ajouter d'un coup une liste d'employés
// depuis un fichier .xlsx, plutôt qu'un par un via le formulaire.
// Deux routes : /template (télécharge un fichier vierge avec les bonnes
// colonnes) et / (traite le fichier envoyé par l'utilisateur).
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs'); // lecture/écriture de fichiers .xlsx (préféré à `xlsx` qui a des failles de sécurité connues)
const crypto = require('crypto');
const prisma = require('../prisma');
const { validateDateOrder, exceedsCddLimit } = require('../utils/business');
const { getSettings } = require('../settings');
const { logAudit } = require('../middleware/audit');
const { brandWorkbook, paintHeader, styleHeaderRow, styleDataRow, sendWorkbook, fill, BRAND } = require('../branding');

const router = express.Router();
// multer gère la réception du fichier envoyé en multipart/form-data depuis
// le frontend. memoryStorage = le fichier reste en RAM (Buffer), on n'a pas
// besoin de l'écrire sur disque puisqu'on ne fait que le lire une fois.
// limits.fileSize évite qu'un fichier énorme ne sature le serveur.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Colonnes attendues dans le fichier Excel, dans cet ordre précis pour le
// modèle généré (mais l'import lui-même retrouve chaque colonne par son nom
// d'en-tête, donc l'ordre n'a pas d'importance pour un fichier fourni par l'utilisateur).
const HEADERS = ['Matricule', 'Prenom', 'Nom', 'Poste', 'Site', 'DateEmbauche', 'TypeContrat', 'Salaire', 'DateFin'];

// GET /api/employees/import/template — génère à la volée un fichier .xlsx
// vierge avec les bons en-têtes + 2 lignes d'exemple, pour que l'utilisateur
// sache exactement quoi remplir.
router.get('/template', async (req, res) => {
  const sites = await prisma.site.findMany({ orderBy: { name: 'asc' } });
  const workbook = brandWorkbook('Modèle import employés');
  const sheet = workbook.addWorksheet('Employés', { properties: { tabColor: { argb: BRAND.red } } });
  sheet.columns = HEADERS.map((h) => ({ key: h, width: h === 'DateEmbauche' || h === 'TypeContrat' ? 16 : 18 }));

  const headerRowNum = paintHeader(sheet, {
    title: 'Modèle d’import des employés',
    subtitle: 'Remplissez à partir de la ligne 6. Les deux lignes grises sont des exemples à remplacer.',
    lastCol: 'I',
    note: 'Colonnes obligatoires : Matricule, Prenom, Nom, Site, DateEmbauche, TypeContrat, Salaire. DateFin est requise pour un CDD.',
  });

  HEADERS.forEach((h, i) => {
    sheet.getRow(headerRowNum).getCell(i + 1).value = h;
  });
  styleHeaderRow(sheet, headerRowNum, HEADERS.length);

  const examples = [
    { Matricule: 'EMP-100', Prenom: 'Kossi', Nom: 'Example', Poste: 'Comptable', Site: sites[0]?.name || 'Agence Assivito', DateEmbauche: '2024-01-15', TypeContrat: 'CDI', Salaire: 200000, DateFin: '' },
    { Matricule: 'EMP-101', Prenom: 'Ama', Nom: 'Sample', Poste: 'Technicien', Site: sites[1]?.name || sites[0]?.name || 'Kara', DateEmbauche: '2025-03-01', TypeContrat: 'CDD', Salaire: 150000, DateFin: '2026-09-01' },
  ];
  examples.forEach((ex, i) => {
    const row = sheet.addRow(ex);
    styleDataRow(sheet, row.number, HEADERS.length, { example: true });
    if (i === 1) row.getCell('DateFin').fill = fill('FFFFF3E0');
  });

  sheet.dataValidations.add('G6:G500', {
    type: 'list',
    allowBlank: false,
    formulae: ['"CDI,CDD"'],
    showErrorMessage: true,
    errorTitle: 'Type de contrat',
    error: 'Valeur autorisée : CDI ou CDD',
  });
  if (sites.length) {
    const list = `"${sites.map((s) => s.name.replace(/"/g, '')).join(',')}"`;
    if (list.length < 250) {
      sheet.dataValidations.add('E6:E500', {
        type: 'list',
        allowBlank: false,
        formulae: [list],
        showErrorMessage: true,
        errorTitle: 'Site',
        error: 'Choisissez un site existant',
      });
    }
  }

  const guide = workbook.addWorksheet('Guide', { properties: { tabColor: { argb: BRAND.ink } } });
  guide.columns = [{ width: 22 }, { width: 62 }];
  paintHeader(guide, {
    title: 'Guide de remplissage',
    subtitle: 'Une ligne = un employé. Le site doit exister déjà dans l’application.',
    lastCol: 'B',
  });
  const guideHeaders = ['Colonne', 'Règle'];
  guide.getRow(5).values = [undefined, ...guideHeaders];
  styleHeaderRow(guide, 5, 2);
  const rules = [
    ['Matricule', 'Identifiant unique (ex. EMP-102). Refusé s’il existe déjà.'],
    ['Prenom / Nom', 'Obligatoires.'],
    ['Poste', 'Optionnel. « Non spécifié » si vide.'],
    ['Site', `Doit correspondre à un site existant${sites.length ? ` : ${sites.map((s) => s.name).join(', ')}` : ''}.`],
    ['DateEmbauche', 'Format AAAA-MM-JJ (ex. 2024-01-15).'],
    ['TypeContrat', 'CDI ou CDD uniquement (liste déroulante).'],
    ['Salaire', 'Montant mensuel brut, nombre positif.'],
    ['DateFin', 'Obligatoire pour un CDD. Laisser vide pour un CDI.'],
  ];
  rules.forEach((r, i) => {
    const row = guide.addRow(r);
    styleDataRow(guide, row.number, 2);
    if (i === 7) row.getCell(2).font = { name: 'Calibri', size: 10, color: { argb: BRAND.amber }, italic: true };
  });

  return sendWorkbook(res, workbook, 'modele-import-employes.xlsx');
});

// POST /api/employees/import — reçoit le fichier rempli et l'importe.
// upload.single('file') = middleware multer qui extrait le fichier envoyé
// sous le nom de champ "file" et le place dans req.file.
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Fichier Excel invalide ou corrompu" });
  }

  const sheet = workbook.worksheets.find((s) => s.name.toLowerCase() !== 'guide') || workbook.worksheets[0];
  if (!sheet) return res.status(400).json({ error: 'Le fichier ne contient aucune feuille' });

  // On cherche la ligne d'en-têtes même si un bandeau SUPERAMCO occupe le haut
  // du modèle (lignes 1–4). `.slice(1)` car ExcelJS indexe à partir de 1.
  let headerRowNum = 1;
  for (let r = 1; r <= Math.min(sheet.rowCount, 12); r++) {
    const labels = sheet.getRow(r).values.slice(1).map((v) => String(v || '').trim().toLowerCase());
    if (labels.includes('matricule') && labels.includes('prenom')) {
      headerRowNum = r;
      break;
    }
  }
  const headerRow = sheet.getRow(headerRowNum).values.slice(1).map((v) => String(v || '').trim());
  const colIndex = {};
  HEADERS.forEach((h) => {
    const idx = headerRow.findIndex((v) => v.toLowerCase() === h.toLowerCase());
    colIndex[h] = idx;
  });
  // DateFin est la seule colonne optionnelle (les CDI n'en ont pas besoin).
  const missingCols = HEADERS.filter((h) => colIndex[h] === -1 && h !== 'DateFin');
  if (missingCols.length) {
    return res.status(400).json({ error: `Colonnes manquantes : ${missingCols.join(', ')}` });
  }

  // On précharge en mémoire la liste des sites et des matricules déjà
  // utilisés, pour valider chaque ligne sans faire une requête SQL par ligne
  // (ce qui serait très lent sur un fichier de centaines de lignes).
  const sites = await prisma.site.findMany();
  const siteByName = new Map(sites.map((s) => [s.name.toLowerCase(), s]));
  const existingMatricules = new Set((await prisma.employee.findMany({ select: { matricule: true } })).map((e) => e.matricule));

  const settings = await getSettings();
  const results = { success: 0, errors: [] };
  const seenInFile = new Set(); // détecte aussi les doublons À L'INTÉRIEUR du même fichier

  // On parcourt chaque ligne de données (rowNum = 2 car la ligne 1 = en-têtes).
  for (let rowNum = headerRowNum + 1; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    if (row.values.length <= 1) continue; // ligne vide, on l'ignore silencieusement

    // Petite fonction locale pour lire la valeur d'une colonne par son nom
    // logique (ex: get('Matricule')) plutôt que par son index numérique brut.
    const get = (h) => {
      const idx = colIndex[h];
      if (idx === -1) return '';
      const v = row.values[idx + 1]; // +1 car ExcelJS indexe les colonnes à partir de 1
      if (v == null) return '';
      if (v instanceof Date) return v; // Excel stocke parfois les dates comme de vraies dates, pas du texte
      return String(v).trim();
    };

    const matricule = get('Matricule');
    const firstName = get('Prenom');
    const lastName = get('Nom');
    const position = get('Poste');
    const siteName = get('Site');
    const hireDateRaw = get('DateEmbauche');
    const contractType = String(get('TypeContrat')).toUpperCase();
    const salary = get('Salaire');
    const endDateRaw = get('DateFin');

    // Chaque validation ci-dessous suit le même schéma : si ça échoue, on
    // pousse une erreur avec le numéro de ligne dans results.errors et on
    // passe à la ligne suivante avec `continue` (on n'arrête pas tout
    // l'import pour une seule ligne invalide).
    if (!matricule || !firstName || !lastName || !siteName || !hireDateRaw) {
      results.errors.push({ row: rowNum, message: 'Champs obligatoires manquants (Matricule, Prénom, Nom, Site, DateEmbauche)' });
      continue;
    }
    if (existingMatricules.has(matricule) || seenInFile.has(matricule)) {
      results.errors.push({ row: rowNum, message: `Matricule ${matricule} déjà utilisé` });
      continue;
    }
    const site = siteByName.get(String(siteName).toLowerCase());
    if (!site) {
      results.errors.push({ row: rowNum, message: `Site "${siteName}" introuvable` });
      continue;
    }
    const hireDate = new Date(hireDateRaw);
    if (isNaN(hireDate)) {
      results.errors.push({ row: rowNum, message: `Date d'embauche invalide : ${hireDateRaw}` });
      continue;
    }
    if (!['CDI', 'CDD'].includes(contractType)) {
      results.errors.push({ row: rowNum, message: `Type de contrat invalide : ${contractType} (attendu CDI ou CDD)` });
      continue;
    }
    let endDate = null;
    if (endDateRaw) {
      endDate = new Date(endDateRaw);
      if (isNaN(endDate)) {
        results.errors.push({ row: rowNum, message: `Date de fin invalide : ${endDateRaw}` });
        continue;
      }
      // Même règle métier "date de fin >= date de début" que pour un contrat saisi manuellement.
      try {
        validateDateOrder(hireDate, endDate, 'contrat');
      } catch (e) {
        results.errors.push({ row: rowNum, message: e.message });
        continue;
      }
    }
    // Même règle métier "limite CDD 4 ans" que pour un contrat saisi manuellement
    // (tableau vide en premier argument car c'est un nouvel employé, sans contrat antérieur).
    if (contractType === 'CDD' && exceedsCddLimit([], { type: 'CDD', startDate: hireDate, endDate }, settings.cddMaxYears)) {
      results.errors.push({ row: rowNum, message: `Durée du CDD supérieure à ${settings.cddMaxYears} ans` });
      continue;
    }
    const salaryNum = Number(salary);
    if (!salary || isNaN(salaryNum) || salaryNum <= 0) {
      results.errors.push({ row: rowNum, message: `Salaire invalide : ${salary}` });
      continue;
    }

    // Toutes les validations sont passées : on crée l'employé ET son
    // contrat initial en une seule opération Prisma imbriquée (l'écriture
    // "contracts: { create: {...} }" crée les deux lignes ensemble).
    try {
      await prisma.employee.create({
        data: {
          matricule,
          firstName,
          lastName,
          position: position || 'Non spécifié',
          siteId: site.id,
          hireDate,
          qrToken: crypto.randomUUID(),
          contracts: {
            create: { type: contractType, startDate: hireDate, endDate, salary: salaryNum },
          },
          leaveBalances: {
            create: {
              year: hireDate.getFullYear(),
              totalDays: settings.defaultAnnualLeaveDays,
              usedDays: 0,
            },
          },
        },
      });
      seenInFile.add(matricule);
      results.success++;
    } catch (e) {
      results.errors.push({ row: rowNum, message: `Erreur d'insertion : ${e.message}` });
    }
  }

  await logAudit(req.user.id, 'IMPORT', 'Employee', null, null, { success: results.success, errors: results.errors.length });
  res.json(results); // le frontend affiche results.success et la liste results.errors
});

module.exports = router;
