// Route Départs & Solde de Tout Compte (Vue 5) : calcule automatiquement
// l'ancienneté et les indemnités d'un employé qui part, génère le reçu PDF,
// et fait basculer son statut (ce qui désactive son QR Code, voir scan.js).
const express = require('express');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const prisma = require('../prisma');
const { calcSeniority, validateDateOrder, computeIndemnities } = require('../utils/business');
const { getSettings, noticeDaysFor } = require('../settings');
const { logAudit } = require('../middleware/audit');
const { drawPdfHeader, drawPdfFooter, PDF } = require('../branding');

const router = express.Router();
const PDF_DIR = path.join(__dirname, '..', '..', 'generated-pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const REASON_LABELS = {
  DEMISSION: 'Démission',
  FIN_CDD: 'Fin de CDD',
  RETRAITE: 'Retraite',
  LICENCIEMENT: 'Licenciement',
};

async function buildStcPreview(employeeId, departureDate, reason) {
  const settings = await getSettings();
  const employee = await prisma.employee.findUnique({
    where: { id: Number(employeeId) },
    include: { contracts: { orderBy: { startDate: 'desc' } }, leaveBalances: true, site: true },
  });
  if (!employee) {
    const err = new Error('Employé introuvable');
    err.status = 404;
    throw err;
  }

  try {
    validateDateOrder(employee.hireDate, departureDate, 'STC');
  } catch (e) {
    e.status = 400;
    throw e;
  }

  const seniority = calcSeniority(new Date(employee.hireDate), new Date(departureDate));
  const lastContract = employee.contracts[0];
  const lastSalary = lastContract ? lastContract.salary : 0;
  const currentYear = new Date(departureDate).getFullYear();
  const balance = employee.leaveBalances.find((b) => b.year === currentYear);
  const remainingLeaveDays = balance ? Number(balance.totalDays) - Number(balance.usedDays) : 0;
  const calc = computeIndemnities(lastSalary, seniority, remainingLeaveDays, reason, settings);
  const hire = new Date(employee.hireDate);
  const ageAtDeparture = new Date(departureDate).getFullYear() - hire.getFullYear();

  return {
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      matricule: employee.matricule,
      position: employee.position,
      site: employee.site?.name,
      hireDate: employee.hireDate,
    },
    lastSalary: Number(lastSalary),
    seniority,
    remainingLeaveDays: calc.remainingLeaveDays,
    indemniteDepart: calc.indemniteDepart,
    indemniteConges: calc.indemniteConges,
    totalAmount: calc.totalAmount,
    dailyRate: Math.round(calc.dailyRate),
    indemnityRate: calc.rate,
    noticeDays: noticeDaysFor(reason, settings),
    currency: settings.currency,
    companyName: settings.companyName,
    retirementAge: settings.retirementAge,
    belowRetirementAge: reason === 'RETRAITE' && ageAtDeparture < settings.retirementAge,
    formula: {
      salaryDaysPerMonth: settings.salaryDaysPerMonth,
      rateLabel: `${calc.rate} mois de salaire par année d'ancienneté`,
    },
  };
}

router.get('/', async (req, res) => {
  const rows = await prisma.sTC.findMany({
    include: { employee: { include: { site: true } } },
    orderBy: { validatedAt: 'desc' },
  });
  let notesById = new Map();
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "STC" ADD COLUMN IF NOT EXISTS "notes" TEXT');
    const extra = await prisma.$queryRaw`SELECT id, notes FROM "STC"`;
    notesById = new Map(extra.map((r) => [r.id, r.notes]));
  } catch {
    notesById = new Map();
  }
  res.json(
    rows.map((s) => ({
      id: s.id,
      employeeId: s.employeeId,
      employeeName: `${s.employee.firstName} ${s.employee.lastName}`,
      matricule: s.employee.matricule,
      site: s.employee.site?.name,
      departureDate: s.departureDate,
      reason: s.reason,
      seniorityYears: s.seniorityYears,
      seniorityMonths: s.seniorityMonths,
      seniorityDays: s.seniorityDays,
      indemniteDepart: s.indemniteDepart,
      indemniteConges: s.indemniteConges,
      totalAmount: s.totalAmount,
      validatedAt: s.validatedAt,
      hasPdf: Boolean(s.pdfPath),
      notes: s.notes || notesById.get(s.id) || null,
    }))
  );
});

router.post('/preview', async (req, res) => {
  const { employeeId, departureDate, reason } = req.body || {};
  if (!employeeId || !departureDate || !reason) {
    return res.status(400).json({ error: 'Employé, date et motif sont requis' });
  }
  try {
    const preview = await buildStcPreview(employeeId, departureDate, reason);
    res.json(preview);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const { employeeId, departureDate, reason, notes } = req.body || {};
  if (!employeeId || !departureDate || !reason) {
    return res.status(400).json({ error: 'Employé, date et motif sont requis' });
  }

  let preview;
  try {
    preview = await buildStcPreview(employeeId, departureDate, reason);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }

  const seniority = preview.seniority;
  const stc = await prisma.sTC.upsert({
    where: { employeeId: Number(employeeId) },
    update: {
      departureDate: new Date(departureDate),
      reason,
      seniorityYears: seniority.years,
      seniorityMonths: seniority.months,
      seniorityDays: seniority.days,
      indemniteDepart: preview.indemniteDepart,
      indemniteConges: preview.indemniteConges,
      totalAmount: preview.totalAmount,
    },
    create: {
      employeeId: Number(employeeId),
      departureDate: new Date(departureDate),
      reason,
      seniorityYears: seniority.years,
      seniorityMonths: seniority.months,
      seniorityDays: seniority.days,
      indemniteDepart: preview.indemniteDepart,
      indemniteConges: preview.indemniteConges,
      totalAmount: preview.totalAmount,
    },
  });

  const newStatus = reason === 'RETRAITE' ? 'RETRAITE' : 'QUITTE';
  await prisma.employee.update({
    where: { id: Number(employeeId) },
    data: { status: newStatus, qrActive: false },
  });

  const employee = await prisma.employee.findUnique({
    where: { id: Number(employeeId) },
    include: { site: true },
  });
  const comment = typeof notes === 'string' ? notes.trim() : '';
  const pdfPath = await generateStcPdf(employee, { ...stc, notes: comment, siteName: employee.site?.name }, seniority, preview);
  await prisma.sTC.update({ where: { id: stc.id }, data: { pdfPath } });
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "STC" ADD COLUMN IF NOT EXISTS "notes" TEXT');
    await prisma.$executeRaw`UPDATE "STC" SET notes = ${comment || null} WHERE id = ${stc.id}`;
  } catch {
    /* le PDF contient le commentaire même si la colonne n'est pas encore migrée */
  }

  await logAudit(req.user.id, 'VALIDATE', 'STC', stc.id, null, stc);

  res.status(201).json({
    ...stc,
    pdfPath,
    employeeStatus: newStatus,
    remainingLeaveDays: preview.remainingLeaveDays,
    noticeDays: preview.noticeDays,
    currency: preview.currency,
    indemnityRate: preview.indemnityRate,
    notes: comment,
  });
});

router.get('/:employeeId/pdf', async (req, res) => {
  const stc = await prisma.sTC.findUnique({ where: { employeeId: Number(req.params.employeeId) } });
  if (!stc || !stc.pdfPath || !fs.existsSync(stc.pdfPath)) {
    return res.status(404).json({ error: 'Document STC introuvable' });
  }
  res.download(stc.pdfPath);
});

function generateStcPdf(employee, stc, seniority, preview) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(PDF_DIR, `stc_${employee.matricule}.pdf`);
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const currency = preview.currency || 'FCFA';
    // On n'utilise volontairement PAS `toLocaleString('fr-FR')` : cette
    // locale insère une espace fine insécable (caractère Unicode spécial)
    // comme séparateur de milliers, que la police standard de pdfkit
    // (Helvetica/WinAnsi) ne sait pas afficher — elle apparaissait comme
    // un "/". Un espace normal donne le même rendu visuel sans ce problème.
    const money = (n) => {
      const rounded = Math.round(Number(n));
      return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${currency}`;
    };
    const pageW = doc.page.width;
    const innerW = pageW - 96;

    // Le logo et la barre de marque sont dessinés par drawPdfHeader (voir
    // branding.js) : c'est le même en-tête que pour les autres documents
    // générés par l'application (exports Excel, futurs PDF), pas la peine
    // de le redessiner ici.
    const headerBottom = drawPdfHeader(doc, {
      title: 'REÇU DE SOLDE DE TOUT COMPTE',
      subtitle: "Ce document atteste du règlement des sommes dues à l'employé au terme de son contrat de travail.",
      meta: [`N° dossier : STC-${employee.matricule}`, `Émis le ${new Date().toLocaleDateString('fr-FR')}`],
    });

    let y = headerBottom + 8;
    // Un seul encadré fusionnant infos employé + infos du départ : nom en
    // gros, matricule/poste/site en ligne fine, puis départ/motif en dessous.
    doc.roundedRect(48, y, innerW, 82, 8).fill(PDF.paper);
    doc.fillColor(PDF.ink).font('Helvetica-Bold').fontSize(14);
    doc.text(`${employee.firstName} ${employee.lastName}`, 64, y + 16);
    doc.font('Helvetica').fontSize(9).fillColor(PDF.faint);
    doc.text(`${employee.matricule}  ·  ${employee.position || ''}  ·  ${stc.siteName || preview.employee?.site || ''}`, 64, y + 36);
    doc.fillColor(PDF.ink).fontSize(10);
    doc.text(`Départ le ${new Date(stc.departureDate).toLocaleDateString('fr-FR')}`, 64, y + 54);
    doc.text(`Motif : ${REASON_LABELS[stc.reason] || stc.reason}`, 280, y + 54);

    y += 102;
    const meta = [
      ['Ancienneté', `${seniority.years} an(s)  ${seniority.months} mois  ${seniority.days} j`],
      ['Préavis', `${preview.noticeDays} jour(s)`],
      ['Congés restants', `${preview.remainingLeaveDays} jour(s)`],
      ['Taux indemnité', `${preview.indemnityRate} mois / an`],
    ];
    const colW = innerW / 2 - 6;
    meta.forEach((item, i) => {
      const x = 48 + (i % 2) * (colW + 12);
      const rowY = y + Math.floor(i / 2) * 40;
      doc.roundedRect(x, rowY, colW, 34, 6).strokeColor('#ECECEF').lineWidth(1).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(PDF.faint).text(item[0], x + 12, rowY + 7, { width: colW - 24 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF.ink).text(item[1], x + 12, rowY + 18, { width: colW - 24 });
    });

    y += 96;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF.ink).text('Détail du règlement', 48, y);
    y += 20;
    // Ligne d'en-tête du tableau (fond sombre, même traitement que les
    // tableaux du reste de l'application) : sans elle, les lignes du
    // dessous ressemblaient à une simple liste plutôt qu'à un vrai tableau.
    doc.rect(48, y, innerW, 24).fill(PDF.ink);
    doc.fillColor(PDF.white).font('Helvetica-Bold').fontSize(9);
    doc.text('DÉSIGNATION', 64, y + 8);
    doc.text('MONTANT', 48, y + 8, { width: innerW - 16, align: 'right' });
    y += 24;
    const lines = [
      ['Indemnité de départ', money(stc.indemniteDepart)],
      ['Indemnité de congés restants', money(stc.indemniteConges)],
    ];
    lines.forEach((line, i) => {
      const rowY = y + i * 28;
      if (i % 2 === 0) doc.rect(48, rowY, innerW, 28).fill(PDF.paper);
      doc.fillColor(PDF.ink).font('Helvetica').fontSize(10).text(line[0], 64, rowY + 8);
      doc.text(line[1], 48, rowY + 8, { width: innerW - 16, align: 'right' });
    });
    y += lines.length * 28;
    doc.rect(48, y, innerW, 36).fill(PDF.red);
    doc.fillColor(PDF.white).font('Helvetica-Bold').fontSize(12).text('Total à payer', 64, y + 11);
    doc.text(money(stc.totalAmount), 48, y + 11, { width: innerW - 16, align: 'right' });

    y += 52;
    if (stc.notes) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF.ink).text('Commentaire', 48, y);
      y += 18;
      doc.roundedRect(48, y, innerW, 64, 6).fill(PDF.paper);
      doc.font('Helvetica').fontSize(10).fillColor(PDF.ink).text(stc.notes, 60, y + 10, { width: innerW - 24, height: 48 });
      y += 80;
    }

    y = Math.max(y, 620);
    doc.font('Helvetica').fontSize(8).fillColor(PDF.faint).text('Signatures', 48, y);
    y += 14;
    const sigW = (innerW - 16) / 2;
    ['L’employeur', 'Le salarié'].forEach((label, i) => {
      const x = 48 + i * (sigW + 16);
      doc.moveTo(x, y + 48).lineTo(x + sigW, y + 48).strokeColor('#C9CAD1').stroke();
      doc.font('Helvetica').fontSize(9).fillColor(PDF.faint).text(label, x, y + 54, { width: sigW, align: 'center' });
    });

    drawPdfFooter(doc);
    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

module.exports = router;
