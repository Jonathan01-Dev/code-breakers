// Route du Tableau de Bord (Vue 1 du cahier des charges) : agrège plusieurs
// indicateurs en une seule requête pour que le frontend n'ait qu'un seul
// appel à faire au chargement de la page.
const express = require('express');
const prisma = require('../prisma');
const { cddCumulativeYears } = require('../utils/business');
const { getSettings } = require('../settings');
const { brandWorkbook, paintHeader, styleHeaderRow, styleDataRow, sendWorkbook, BRAND } = require('../branding');

const router = express.Router();

function dayStart(queryDate) {
  if (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
    const [y, m, d] = queryDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lastContract(employee) {
  return [...(employee.contracts || [])].sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0] || null;
}

async function buildDashboard(queryDate) {
  const settings = await getSettings();
  const today = dayStart(queryDate);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);

  const [actifs, todayAttendances, leaves, sites, weekScans, employees] = await Promise.all([
    prisma.employee.findMany({ where: { status: 'ACTIF' }, select: { id: true, siteId: true } }),
    prisma.attendance.findMany({ where: { date: today, employee: { status: 'ACTIF' } } }),
    prisma.absence.findMany({
      where: { startDate: { lte: today }, endDate: { gte: today } },
      select: { employeeId: true, justified: true },
    }),
    prisma.site.findMany({ include: { employees: { where: { status: 'ACTIF' } } } }),
    prisma.attendance.findMany({
      where: { date: { gte: weekStart, lte: today }, employee: { status: 'ACTIF' } },
      select: { date: true, status: true },
    }),
    prisma.employee.findMany({
      where: { status: 'ACTIF' },
      include: { contracts: true },
    }),
  ]);

  const activeCount = actifs.length;
  const scannedIds = new Set(todayAttendances.map((a) => a.employeeId));
  const leaveIds = new Set(leaves.map((l) => l.employeeId));
  const present = todayAttendances.filter((a) => a.status === 'PRESENT').length;
  const late = todayAttendances.filter((a) => a.status === 'RETARD').length;
  const onLeave = leaves.length;
  const absent = actifs.filter((e) => !scannedIds.has(e.id) && !leaveIds.has(e.id)).length;
  const pendingLeaveRequests = leaves.filter((l) => !l.justified).length;

  const presenceBySite = sites.map((s) => {
    const presentAtSite = todayAttendances.filter((a) => a.siteName === s.name).length;
    return { site: s.name, actifs: s.employees.length, presents: presentAtSite };
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
      date: isoDay(day),
      present: dayScans.filter((s) => s.status === 'PRESENT').length,
      late: dayScans.filter((s) => s.status === 'RETARD').length,
      total: dayScans.length,
    });
  }

  const alertFrom = settings.cddMaxYears - settings.cddAlertYearsBefore;
  const cddAlerts = employees
    .map((e) => ({ employee: e, years: cddCumulativeYears(e.contracts) }))
    .filter((x) => x.years >= alertFrom)
    .map((x) => ({
      employeeId: x.employee.id,
      matricule: x.employee.matricule,
      name: `${x.employee.firstName} ${x.employee.lastName}`,
      cumulativeYears: Number(x.years.toFixed(2)),
      exceeded: x.years >= settings.cddMaxYears,
    }));

  const cdd = employees.filter((e) => lastContract(e)?.type === 'CDD').length;
  const cdi = employees.filter((e) => lastContract(e)?.type === 'CDI').length;

  return {
    date: isoDay(today),
    effectifActif: activeCount,
    tauxPresenceJour: activeCount ? Math.round(((present + late) / activeCount) * 100) : 0,
    present,
    late,
    onLeave,
    absent,
    congesEnAttente: pendingLeaveRequests,
    alertesCdd: cddAlerts,
    presenceParSite: presenceBySite,
    week,
    contracts: { cdd, cdi },
    cddMaxYears: settings.cddMaxYears,
    lateThreshold: `${String(settings.lateHour).padStart(2, '0')}:${String(settings.lateMinute).padStart(2, '0')}`,
    currency: settings.currency,
    companyName: settings.companyName,
  };
}

router.get('/', async (req, res) => {
  res.json(await buildDashboard(req.query.date));
});

router.get('/export', async (req, res) => {
  const data = await buildDashboard(req.query.date);
  const workbook = brandWorkbook(`Tableau de bord ${data.date}`);
  const synth = workbook.addWorksheet('Synthèse', { properties: { tabColor: { argb: BRAND.red } } });
  synth.columns = [{ key: 'k', width: 28 }, { key: 'v', width: 22 }, { key: 'h', width: 36 }];
  paintHeader(synth, {
    title: 'Tableau de bord RH',
    subtitle: `Situation du ${new Date(`${data.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
    lastCol: 'C',
    note: `Seuil de retard ${data.lateThreshold}  ·  ${data.companyName || 'SUPERAMCO'}`,
  });
  synth.getRow(5).values = [undefined, 'Indicateur', 'Valeur', 'Précision'];
  styleHeaderRow(synth, 5, 3);
  const kpis = [
    ['Effectif actif', data.effectifActif, `${data.contracts.cdd} CDD · ${data.contracts.cdi} CDI`],
    ['Présents', data.present, `${data.tauxPresenceJour} % de l’effectif`],
    ['Retards', data.late, `Après ${data.lateThreshold}`],
    ['Congés', data.onLeave, `${data.congesEnAttente} non justifié(s)`],
    ['Absents', data.absent, 'Non pointés, hors congé'],
    ['Alertes CDD', data.alertesCdd.length, `Limite ${data.cddMaxYears} ans`],
  ];
  kpis.forEach((row) => {
    const r = synth.addRow(row);
    styleDataRow(synth, r.number, 3);
    r.getCell(2).font = { name: 'Calibri', size: 12, bold: true, color: { argb: BRAND.red } };
  });

  const sitesSheet = workbook.addWorksheet('Sites', { properties: { tabColor: { argb: BRAND.ink } } });
  sitesSheet.columns = [{ key: 'site', width: 28 }, { key: 'actifs', width: 14 }, { key: 'presents', width: 14 }, { key: 'taux', width: 14 }];
  paintHeader(sitesSheet, {
    title: 'Présence par site',
    subtitle: `Journée du ${data.date}`,
    lastCol: 'D',
  });
  sitesSheet.getRow(5).values = [undefined, 'Site', 'Actifs', 'Présents', 'Taux'];
  styleHeaderRow(sitesSheet, 5, 4);
  data.presenceParSite.forEach((s) => {
    const r = sitesSheet.addRow([s.site, s.actifs, s.presents, s.actifs ? `${Math.round((s.presents / s.actifs) * 100)} %` : '—']);
    styleDataRow(sitesSheet, r.number, 4);
  });

  const weekSheet = workbook.addWorksheet('Semaine', { properties: { tabColor: { argb: 'FF1E8A4C' } } });
  weekSheet.columns = [{ key: 'd', width: 18 }, { key: 'p', width: 14 }, { key: 'l', width: 14 }, { key: 't', width: 14 }];
  paintHeader(weekSheet, {
    title: 'Pointages sur 7 jours',
    subtitle: `${data.week[0]?.date || ''} → ${data.week[6]?.date || ''}`,
    lastCol: 'D',
  });
  weekSheet.getRow(5).values = [undefined, 'Date', 'Présents', 'Retards', 'Total'];
  styleHeaderRow(weekSheet, 5, 4);
  data.week.forEach((d) => {
    const r = weekSheet.addRow([d.date, d.present, d.late, d.total]);
    styleDataRow(weekSheet, r.number, 4);
  });

  if (data.alertesCdd.length) {
    const alerts = workbook.addWorksheet('Alertes CDD');
    alerts.columns = [{ width: 28 }, { width: 16 }, { width: 18 }, { width: 16 }];
    paintHeader(alerts, { title: 'Alertes CDD', subtitle: `Limite légale ${data.cddMaxYears} ans`, lastCol: 'D' });
    alerts.getRow(5).values = [undefined, 'Employé', 'Matricule', 'Années cumulées', 'Statut'];
    styleHeaderRow(alerts, 5, 4);
    data.alertesCdd.forEach((a) => {
      const r = alerts.addRow([a.name, a.matricule, a.cumulativeYears, a.exceeded ? 'Limite dépassée' : 'Alerte']);
      styleDataRow(alerts, r.number, 4);
    });
  }

  return sendWorkbook(res, workbook, `tableau_bord_${data.date}.xlsx`);
});

module.exports = router;
