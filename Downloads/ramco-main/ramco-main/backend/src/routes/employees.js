// Routes des Dossiers Employés (Vue 3) : listing/recherche, fiche détail,
// création d'employé, et ajout de contrats/mutations/absences depuis le
// dossier. Chaque route correspond à un besoin précis de l'écran React.
const express = require('express');
const crypto = require('crypto');
const prisma = require('../prisma');
const { validateDateOrder, exceedsCddLimit } = require('../utils/business');
const { getSettings } = require('../settings');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

// GET /api/employees?q=xxx — liste/recherche pour le tableau de gauche.
// Sans "q", renvoie tous les employés. Avec "q", filtre sur prénom, nom OU
// matricule (mode: 'insensitive' = recherche insensible à la casse, propre à PostgreSQL/Prisma).
router.get('/', async (req, res) => {
  const { q } = req.query;
  const where = q
    ? {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { matricule: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};
  const employees = await prisma.employee.findMany({
    where,
    include: { site: true, contracts: { orderBy: { startDate: 'desc' }, take: 1 } },
    orderBy: { lastName: 'asc' },
  });
  res.json(employees);
});

// GET /api/employees/:id — fiche détail complète d'un employé, avec toutes
// ses relations (include) : c'est ce qui alimente le panneau de droite
// (Contrats & Carrière, Compteurs & Absences) en un seul appel.
router.get('/:id', async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      site: true,
      contracts: { orderBy: { startDate: 'desc' } },
      careerMoves: { orderBy: { date: 'desc' } },
      leaveBalances: true,
      absences: { orderBy: { startDate: 'desc' } },
    },
  });
  if (!employee) return res.status(404).json({ error: 'Employé introuvable' });
  res.json(employee);
});

// POST /api/employees — création manuelle d'un employé depuis le formulaire
// "Ajouter un employé". Le contrat initial n'est PAS créé ici : il faut
// ensuite l'ajouter via POST /:id/contracts (ou passer par l'import Excel,
// qui lui crée employé + contrat en une seule opération).
router.post('/', async (req, res) => {
  const { matricule, firstName, lastName, position, siteId, hireDate, contractType, salary, endDate } = req.body || {};
  if (!matricule || !firstName || !lastName || !siteId || !hireDate) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  const settings = await getSettings();
  const year = new Date(hireDate).getFullYear();

  if (contractType && salary) {
    try {
      validateDateOrder(hireDate, endDate, 'contrat');
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (contractType === 'CDD' && exceedsCddLimit([], { type: 'CDD', startDate: hireDate, endDate }, settings.cddMaxYears)) {
      return res.status(400).json({ error: `Durée cumulée des CDD supérieure à ${settings.cddMaxYears} ans : contrat bloqué` });
    }
  }

  const employee = await prisma.employee.create({
    data: {
      matricule,
      firstName,
      lastName,
      position: position || 'Non spécifié',
      siteId: Number(siteId),
      hireDate: new Date(hireDate),
      qrToken: crypto.randomUUID(),
      leaveBalances: {
        create: { year, totalDays: settings.defaultAnnualLeaveDays, usedDays: 0 },
      },
      ...(contractType && salary
        ? {
            contracts: {
              create: {
                type: contractType,
                startDate: new Date(hireDate),
                endDate: endDate ? new Date(endDate) : null,
                salary: Number(salary),
              },
            },
          }
        : {}),
    },
  });

  await logAudit(req.user.id, 'CREATE', 'Employee', employee.id, null, employee);
  res.status(201).json(employee);
});

// POST /api/employees/:id/contracts — ajoute un contrat (CDI ou CDD) à un
// employé existant. Deux règles métier sont vérifiées AVANT l'écriture en base :
router.post('/:id/contracts', async (req, res) => {
  const employeeId = Number(req.params.id);
  const { type, startDate, endDate, salary } = req.body || {};

  // 1. Cohérence des dates (date de fin >= date de début).
  try {
    validateDateOrder(startDate, endDate, 'contrat');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // 2. Limite légale de cumul des CDD (4 ans) : on récupère les contrats
  // existants de l'employé pour simuler l'ajout de ce nouveau contrat.
  const existingContracts = await prisma.contract.findMany({ where: { employeeId } });
  const newContract = { type, startDate, endDate };
  const settings = await getSettings();

  if (type === 'CDD' && exceedsCddLimit(existingContracts, newContract, settings.cddMaxYears)) {
    return res.status(400).json({ error: `Durée cumulée des CDD supérieure à ${settings.cddMaxYears} ans : contrat bloqué` });
  }

  const contract = await prisma.contract.create({
    data: {
      employeeId,
      type,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      salary,
    },
  });
  await logAudit(req.user.id, 'CREATE', 'Contract', contract.id, null, contract);
  res.status(201).json(contract);
});

// POST /api/employees/:id/career-moves — historise une mutation/changement
// de poste (ex: "Agent de terrain" -> "Chef de site"). Pas de règle métier
// particulière ici, c'est un simple journal chronologique.
router.post('/:id/career-moves', async (req, res) => {
  const employeeId = Number(req.params.id);
  const { date, fromPosition, toPosition, fromSite, toSite, notes } = req.body || {};
  const move = await prisma.careerMove.create({
    data: { employeeId, date: new Date(date), fromPosition, toPosition, fromSite, toSite, notes },
  });
  await logAudit(req.user.id, 'CREATE', 'CareerMove', move.id, null, move);
  res.status(201).json(move);
});

// POST /api/employees/:id/absences — enregistre une absence/congé.
// "justified" détermine si l'absence bloque un pointage QR ce jour-là
// (voir scan.js) et si elle compte dans les "congés en attente" du Dashboard.
router.post('/:id/absences', async (req, res) => {
  const employeeId = Number(req.params.id);
  const { startDate, endDate, type, justified } = req.body || {};

  try {
    validateDateOrder(startDate, endDate, 'absence');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const absence = await prisma.absence.create({
    data: { employeeId, startDate: new Date(startDate), endDate: new Date(endDate), type, justified: !!justified },
  });
  await logAudit(req.user.id, 'CREATE', 'Absence', absence.id, null, absence);
  res.status(201).json(absence);
});

// PUT /api/employees/:id/leave-balance — définit/actualise le solde de
// congés d'un employé pour une année donnée. "upsert" = update si la ligne
// (employeeId, year) existe déjà, sinon create : évite d'avoir à vérifier
// manuellement avant d'écrire.
router.put('/:id/leave-balance', async (req, res) => {
  const employeeId = Number(req.params.id);
  const { year, totalDays, usedDays } = req.body || {};
  const balance = await prisma.leaveBalance.upsert({
    where: { employeeId_year: { employeeId, year } },
    update: { totalDays, usedDays },
    create: { employeeId, year, totalDays, usedDays: usedDays || 0 },
  });
  res.json(balance);
});

module.exports = router;
