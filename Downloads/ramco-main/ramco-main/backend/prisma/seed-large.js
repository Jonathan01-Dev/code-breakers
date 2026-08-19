const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { calcSeniority } = require('../src/utils/business');

const prisma = new PrismaClient();

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

const SITE_NAMES = ['Siège Lomé', 'Agence Assivito', 'Kara', 'Sokodé', 'Atakpamé', 'Dapaong'];

const FIRST_NAMES_M = [
  'Komi', 'Yao', 'Kossi', 'Koffi', 'Kodjo', 'Ayi', 'Edem', 'Sitsofe', 'Dela', 'Fiacre',
  'Mawuli', 'Kokou', 'Kwami', 'Elom', 'Foli', 'Kuami', 'Sena', 'Selom', 'Amétépé', 'Bawa',
];
const FIRST_NAMES_F = [
  'Ama', 'Afi', 'Essi', 'Adjo', 'Akossiwa', 'Abra', 'Dede', 'Yawa', 'Senam', 'Mawusi',
  'Enam', 'Ablavi', 'Akou', 'Ayélé', 'Delali', 'Edoh', 'Fafa', 'Kafui', 'Nunana', 'Sedem',
];
const LAST_NAMES = [
  'Kodjo', 'Mensah', 'Tossou', 'Adjei', 'Agbeko', 'Amegan', 'Amewou', 'Kpogli', 'Dogbe', 'Sossou',
  'Gbedema', 'Ahiable', 'Atsu', 'Fiawoo', 'Kponton', 'Sogbossi', 'Adjovi', 'Bakonde', 'Kolani', 'Djobo',
  'Alaza', 'Tchagou', 'Tchamdja', 'Nabede', 'Bassowa', 'Lawson', 'Amouzou', 'Klutsé', 'Agbenyega', 'Djidonou',
];
const POSITIONS = [
  'Comptable', 'Chargé de clientèle', 'Agent administratif', 'Chef de site', 'Assistant(e) RH',
  'Technicien', 'Commercial', 'Chauffeur', 'Gardien', 'Responsable logistique', 'Caissier(ère)',
  'Analyste financier', 'Développeur', 'Responsable marketing', 'Agent de sécurité', 'Superviseur',
  'Réceptionniste', 'Contrôleur de gestion', 'Magasinier', 'Infirmier(ère) d\'entreprise',
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randChoice(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function randDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

async function main() {
  const sites = {};
  for (const name of SITE_NAMES) {
    sites[name] = await prisma.site.upsert({ where: { name }, update: {}, create: { name } });
  }
  const siteList = Object.values(sites);

  const rhUser = await prisma.user.findUnique({ where: { email: 'rh@entreprise.tg' } });

  const existingCount = await prisma.employee.count();
  const startIndex = existingCount + 1;
  const N = 75;

  console.log(`Génération de ${N} employés (à partir de EMP-${String(startIndex).padStart(3, '0')})...`);

  const employees = [];
  for (let i = 0; i < N; i++) {
    const matricule = `EMP-${String(startIndex + i).padStart(3, '0')}`;
    const gender = Math.random() < 0.5 ? 'M' : 'F';
    const firstName = randChoice(gender === 'M' ? FIRST_NAMES_M : FIRST_NAMES_F);
    const lastName = randChoice(LAST_NAMES);
    const site = randChoice(siteList);
    const position = randChoice(POSITIONS);
    const hireDate = randDate(new Date('2015-01-01'), new Date('2025-06-01'));

    // ~7% des employés ont quitté l'entreprise (RETRAITE ou QUITTE)
    const roll = Math.random();
    const status = roll < 0.03 ? 'RETRAITE' : roll < 0.07 ? 'QUITTE' : 'ACTIF';

    const emp = await prisma.employee.upsert({
      where: { matricule },
      update: {},
      create: {
        matricule,
        firstName,
        lastName,
        position,
        siteId: site.id,
        hireDate,
        status,
        qrToken: crypto.randomUUID(),
        qrActive: status === 'ACTIF',
      },
    });
    employees.push({ ...emp, siteName: site.name });
  }

  console.log('Employés créés. Génération des contrats, congés, absences, carrières...');

  const contractsData = [];
  const leaveBalanceData = [];
  const absenceData = [];
  const careerMoveData = [];
  const attendanceData = [];
  const stcUpdates = [];

  // Quelques employés délibérément proches / au-delà de la limite légale CDD (4 ans)
  const cddAlertIndexes = new Set();
  while (cddAlertIndexes.size < 4) {
    cddAlertIndexes.add(randInt(0, employees.length - 1));
  }

  for (let idx = 0; idx < employees.length; idx++) {
    const emp = employees[idx];
    const hasExistingContract = await prisma.contract.findFirst({ where: { employeeId: emp.id } });
    if (hasExistingContract) continue;

    const salary = randInt(120, 450) * 1000;
    let type = Math.random() < 0.7 ? 'CDI' : 'CDD';
    let startDate = emp.hireDate;
    let endDate = null;

    if (cddAlertIndexes.has(idx) && emp.status === 'ACTIF') {
      type = 'CDD';
      const yearsBack = 3.5 + Math.random() * 1.1; // 3.5 -> 4.6 ans
      startDate = addDays(TODAY, -Math.round(yearsBack * 365));
      endDate = null;
    } else if (type === 'CDD') {
      const durationDays = randInt(180, 700);
      if (emp.status === 'ACTIF') {
        endDate = addDays(startDate, durationDays);
        if (endDate < TODAY) {
          // Contrat renouvelé : la période "en cours" démarre récemment,
          // sinon on obtient un CDD artificiellement étiré sur des années.
          startDate = addDays(TODAY, -randInt(30, 400));
          endDate = addDays(startDate, durationDays);
        }
      } else {
        endDate = null;
      }
    }

    if (emp.status !== 'ACTIF') {
      const departureDate = randDate(startDate, TODAY);
      endDate = type === 'CDD' ? departureDate : null;
      stcUpdates.push({ emp, startDate, departureDate });
    }

    contractsData.push({
      employeeId: emp.id,
      type,
      startDate,
      endDate,
      salary,
    });

    if (emp.status === 'ACTIF') {
      leaveBalanceData.push({
        employeeId: emp.id,
        year: 2026,
        totalDays: 30,
        usedDays: randInt(0, 26),
      });

      if (Math.random() < 0.18) {
        const offset = randInt(-10, 15);
        const absStart = addDays(TODAY, offset);
        const absDuration = randInt(1, 7);
        absenceData.push({
          employeeId: emp.id,
          startDate: absStart,
          endDate: addDays(absStart, absDuration),
          type: randChoice(['Congé maladie', 'Congé annuel', 'Congé maternité/paternité', 'Absence non justifiée']),
          justified: Math.random() < 0.7,
        });
      }

      if (Math.random() < 0.2 && emp.hireDate < new Date('2022-01-01')) {
        const moveDate = randDate(addDays(emp.hireDate, 365), TODAY);
        careerMoveData.push({
          employeeId: emp.id,
          date: moveDate,
          fromPosition: randChoice(POSITIONS),
          toPosition: emp.position,
          fromSite: emp.siteName,
          toSite: emp.siteName,
          notes: 'Évolution de poste',
        });
      }

      // Historique de pointage sur les 15 derniers jours ouvrés
      for (let d = 1; d <= 21; d++) {
        const day = addDays(TODAY, -d);
        if (isWeekend(day)) continue;
        if (Math.random() < 0.12) continue; // absent ce jour-là

        const late = Math.random() < 0.15;
        const time = new Date(day);
        time.setHours(late ? randInt(9, 10) : randInt(7, 8), randInt(0, 59), 0, 0);

        attendanceData.push({
          employeeId: emp.id,
          date: day,
          time,
          siteName: emp.siteName,
          status: late ? 'RETARD' : 'PRESENT',
          method: Math.random() < 0.1 ? 'MANUEL' : 'QR',
          scannedById: rhUser ? rhUser.id : null,
        });
      }

      // Pointage du jour (pour peupler le Dashboard / Suivi en temps réel)
      if (Math.random() < 0.75) {
        const late = Math.random() < 0.15;
        const time = new Date(TODAY);
        time.setHours(late ? randInt(9, 10) : randInt(7, 8), randInt(0, 59), 0, 0);
        attendanceData.push({
          employeeId: emp.id,
          date: TODAY,
          time,
          siteName: emp.siteName,
          status: late ? 'RETARD' : 'PRESENT',
          method: 'QR',
          scannedById: rhUser ? rhUser.id : null,
        });
      }
    }
  }

  if (contractsData.length) await prisma.contract.createMany({ data: contractsData });
  if (leaveBalanceData.length) await prisma.leaveBalance.createMany({ data: leaveBalanceData, skipDuplicates: true });
  if (absenceData.length) await prisma.absence.createMany({ data: absenceData });
  if (careerMoveData.length) await prisma.careerMove.createMany({ data: careerMoveData });
  if (attendanceData.length) await prisma.attendance.createMany({ data: attendanceData, skipDuplicates: true });

  console.log(`Contrats: ${contractsData.length}, Congés: ${leaveBalanceData.length}, Absences: ${absenceData.length}, Mutations: ${careerMoveData.length}, Pointages: ${attendanceData.length}`);

  // STC pour les employés partis
  for (const { emp, startDate, departureDate } of stcUpdates) {
    const seniority = calcSeniority(new Date(startDate), new Date(departureDate));
    const dailyRate = randInt(120, 450) * 1000 / 30;
    const indemniteDepart = Math.round(dailyRate * 30 * 0.25 * (seniority.years + seniority.months / 12));
    const indemniteConges = Math.round(dailyRate * randInt(0, 25));
    await prisma.sTC.upsert({
      where: { employeeId: emp.id },
      update: {},
      create: {
        employeeId: emp.id,
        departureDate,
        reason: emp.status === 'RETRAITE' ? 'RETRAITE' : randChoice(['DEMISSION', 'FIN_CDD', 'LICENCIEMENT']),
        seniorityYears: seniority.years,
        seniorityMonths: seniority.months,
        seniorityDays: seniority.days,
        indemniteDepart,
        indemniteConges,
        totalAmount: indemniteDepart + indemniteConges,
      },
    });
  }
  console.log(`STC générés pour ${stcUpdates.length} employé(s) parti(s)/retraité(s).`);

  const totalEmployees = await prisma.employee.count();
  console.log(`Total employés en base : ${totalEmployees} sur ${SITE_NAMES.length} sites.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
