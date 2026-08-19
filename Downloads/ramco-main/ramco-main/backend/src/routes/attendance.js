// Route du Registre des Présences (Vue 4 : Suivi des Pointages).
// Un seul endpoint en lecture seule, avec des filtres optionnels par date,
// site et statut — les pointages eux-mêmes sont créés par scan.js.
const express = require('express');
const prisma = require('../prisma');

const router = express.Router();

// GET /api/attendance?date=...&site=...&status=...
// Chaque filtre est optionnel et s'ajoute au `where` seulement s'il est
// fourni dans l'URL (query string), ce qui permet au frontend de combiner
// librement les filtres sans avoir à gérer plusieurs routes.
function flattenScan(a) {
  return {
    id: a.id,
    employeeName: `${a.employee.firstName} ${a.employee.lastName}`,
    matricule: a.employee.matricule,
    position: a.employee.position,
    time: a.time,
    site: a.siteName,
    status: a.status,
    method: a.method,
    date: a.date,
    scannedBy: a.scannedBy?.name || null,
  };
}

router.get('/overview', async (req, res) => {
  let dateOnly;
  if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
    const [y, m, d] = req.query.date.split('-').map(Number);
    dateOnly = new Date(y, m - 1, d);
  } else {
    const now = new Date();
    dateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const weekStart = new Date(dateOnly);
  weekStart.setDate(weekStart.getDate() - 6);

  const [actifs, scans, leaves, sites, weekScans] = await Promise.all([
    prisma.employee.findMany({ where: { status: 'ACTIF' }, include: { site: true } }),
    prisma.attendance.findMany({
      where: { date: dateOnly },
      include: { employee: true, scannedBy: true },
      orderBy: { time: 'desc' },
    }),
    prisma.absence.findMany({
      where: { startDate: { lte: dateOnly }, endDate: { gte: dateOnly } },
      include: { employee: true },
    }),
    prisma.site.findMany({ orderBy: { name: 'asc' } }),
    prisma.attendance.findMany({
      where: { date: { gte: weekStart, lte: dateOnly } },
      select: { date: true, status: true },
    }),
  ]);

  const scannedIds = new Set(scans.map((s) => s.employeeId));
  const leaveIds = new Set(leaves.map((l) => l.employeeId));
  const present = scans.filter((s) => s.status === 'PRESENT').length;
  const late = scans.filter((s) => s.status === 'RETARD').length;
  const onLeave = leaves.length;
  const absent = actifs.filter((e) => !scannedIds.has(e.id) && !leaveIds.has(e.id)).length;

  const bySite = sites.map((site) => {
    const siteActifs = actifs.filter((e) => e.siteId === site.id);
    const siteScans = scans.filter((s) => s.siteName === site.name);
    const presents = siteScans.length;
    return {
      site: site.name,
      actifs: siteActifs.length,
      presents,
      late: siteScans.filter((s) => s.status === 'RETARD').length,
      rate: siteActifs.length ? Math.round((presents / siteActifs.length) * 100) : 0,
    };
  });

  const week = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const dayScans = weekScans.filter((s) => {
      const x = new Date(s.date);
      return x.getFullYear() === day.getFullYear() && x.getMonth() === day.getMonth() && x.getDate() === day.getDate();
    });
    week.push({
      date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
      present: dayScans.filter((s) => s.status === 'PRESENT').length,
      late: dayScans.filter((s) => s.status === 'RETARD').length,
      total: dayScans.length,
    });
  }

  res.json({
    date: dateOnly,
    present,
    late,
    onLeave,
    absent,
    effectif: actifs.length,
    bySite,
    week,
    leaves: leaves.map((l) => ({
      id: l.id,
      name: `${l.employee.firstName} ${l.employee.lastName}`,
      type: l.type,
      justified: l.justified,
      endDate: l.endDate,
    })),
    scans: scans.map(flattenScan),
  });
});

router.get('/', async (req, res) => {
  const { date, site, status } = req.query;
  const where = {};
  if (date) {
    const d = new Date(date);
    where.date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (site) where.siteName = site;
  if (status) where.status = status;

  const attendances = await prisma.attendance.findMany({
    where,
    include: { employee: true, scannedBy: true },
    orderBy: { time: 'desc' },
  });

  res.json(attendances.map(flattenScan));
});

module.exports = router;
