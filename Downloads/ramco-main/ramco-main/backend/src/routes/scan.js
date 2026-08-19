// Route de pointage (Vue 2 : Scanner une Présence). C'est ici que les
// règles métier de sécurité du scan sont appliquées : badge désactivé,
// congé validé, doublon dans la journée.
const express = require('express');
const QRCode = require('qrcode');
const prisma = require('../prisma');
const { attendanceStatusFromTime } = require('../utils/business');
const { getSettings, formatLateThreshold } = require('../settings');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// Le "code" scanné peut être le QR token de l'employé (cas normal, caméra)
// ou directement son matricule (cas de l'entrée manuelle en secours).
async function findScannableEmployee(identifier) {
  return prisma.employee.findFirst({
    where: { OR: [{ qrToken: identifier }, { matricule: identifier }] },
  });
}

// POST /api/scan — appelée à chaque lecture de QR code (ou saisie manuelle).
router.post('/', async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code requis' });

  const employee = await findScannableEmployee(code);
  if (!employee) {
    return res.status(404).json({ error: 'Employé introuvable' });
  }
  // Règle métier : "Dès qu'un STC est validé, le statut bascule et son QR
  // Code est désactivé immédiatement." On vérifie donc les deux : le statut
  // ET le flag qrActive (les deux sont mis à jour ensemble dans stc.js).
  if (employee.status !== 'ACTIF' || !employee.qrActive) {
    return res.status(409).json({ error: `Badge désactivé (statut: ${employee.status})` });
  }

  const today = new Date();
  // On construit une date "sans heure" (minuit) car Attendance.date est une
  // colonne de type Date (jour seul) — ça permet de comparer "même jour"
  // facilement et de poser une contrainte d'unicité (employeeId, date).
  const dateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Règle métier : on ne peut pas pointer un employé en congé validé aujourd'hui.
  const onLeave = await prisma.absence.findFirst({
    where: { employeeId: employee.id, startDate: { lte: dateOnly }, endDate: { gte: dateOnly }, justified: true },
  });
  if (onLeave) {
    return res.status(409).json({ error: `${employee.firstName} ${employee.lastName} est en congé validé aujourd'hui` });
  }

  // Règle métier : "Un QR Code ne peut être scanné qu'une seule fois par jour."
  // La contrainte @@unique([employeeId, date]) dans schema.prisma empêcherait
  // de toute façon un doublon en base, mais on vérifie ici en amont pour
  // renvoyer un message d'erreur clair plutôt qu'une erreur SQL brute.
  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: employee.id, date: dateOnly } },
  });
  if (existing) {
    return res.status(409).json({ error: 'Badge déjà scanné aujourd\'hui', duplicate: true });
  }

  const site = await prisma.site.findUnique({ where: { id: employee.siteId } });
  const settings = await getSettings();
  const status = attendanceStatusFromTime(today, settings.lateHour, settings.lateMinute);

  const attendance = await prisma.attendance.create({
    data: {
      employeeId: employee.id,
      date: dateOnly,
      time: today, // heure précise du scan, pour l'affichage dans le registre
      siteName: site.name,
      status,
      method: req.body.manual ? 'MANUEL' : 'QR', // le frontend passe manual:true pour la saisie clavier
      scannedById: req.user.id, // qui a fait le scan (RH ou manager)
    },
  });

  await logAudit(req.user.id, 'CREATE', 'Attendance', attendance.id, null, attendance);

  res.json({
    success: true,
    employee: { name: `${employee.firstName} ${employee.lastName}`, site: site.name, matricule: employee.matricule },
    time: today,
    status,
    lateThreshold: formatLateThreshold(settings),
  });
});

router.get('/recent', async (req, res) => {
  const now = new Date();
  const dateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const where = { date: dateOnly };
  if (req.user.role === 'MANAGER' && req.user.siteId) {
    const site = await prisma.site.findUnique({ where: { id: req.user.siteId } });
    if (site) where.siteName = site.name;
  }
  const rows = await prisma.attendance.findMany({
    where,
    include: { employee: true },
    orderBy: { time: 'desc' },
    take: 40,
  });
  res.json(
    rows.map((a) => ({
      id: a.id,
      name: `${a.employee.firstName} ${a.employee.lastName}`,
      matricule: a.employee.matricule,
      time: a.time,
      status: a.status,
      method: a.method,
      site: a.siteName,
    }))
  );
});

// GET /api/scan/qr/:employeeId — génère l'image QR Code (en data URL base64)
// à partir du token unique de l'employé, pour l'afficher/imprimer côté RH.
router.get('/qr/:employeeId', async (req, res) => {
  const employee = await prisma.employee.findUnique({ where: { id: Number(req.params.employeeId) } });
  if (!employee) return res.status(404).json({ error: 'Employé introuvable' });
  const dataUrl = await QRCode.toDataURL(employee.qrToken);
  res.json({ qrDataUrl: dataUrl, token: employee.qrToken });
});

module.exports = router;
