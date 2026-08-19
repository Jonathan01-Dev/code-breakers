const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  const siteAssivito = await prisma.site.upsert({
    where: { name: 'Agence Assivito' },
    update: {},
    create: { name: 'Agence Assivito' },
  });
  const siteKara = await prisma.site.upsert({
    where: { name: 'Kara' },
    update: {},
    create: { name: 'Kara' },
  });

  const rhPasswordHash = await bcrypt.hash('rh123456', 10);
  await prisma.user.upsert({
    where: { email: 'rh@entreprise.tg' },
    update: {},
    create: { email: 'rh@entreprise.tg', passwordHash: rhPasswordHash, name: 'Responsable RH', role: 'RH' },
  });

  const managerPasswordHash = await bcrypt.hash('manager123', 10);
  await prisma.user.upsert({
    where: { email: 'manager@entreprise.tg' },
    update: {},
    create: {
      email: 'manager@entreprise.tg',
      passwordHash: managerPasswordHash,
      name: 'Manager Assivito',
      role: 'MANAGER',
      siteId: siteAssivito.id,
    },
  });

  const employee = await prisma.employee.upsert({
    where: { matricule: 'EMP-001' },
    update: {},
    create: {
      matricule: 'EMP-001',
      firstName: 'Ama',
      lastName: 'Kodjo',
      position: 'Comptable',
      siteId: siteAssivito.id,
      hireDate: new Date('2022-03-01'),
      qrToken: crypto.randomUUID(),
    },
  });

  const existingContract = await prisma.contract.findFirst({ where: { employeeId: employee.id } });
  if (!existingContract) {
    await prisma.contract.create({
      data: {
        employeeId: employee.id,
        type: 'CDI',
        startDate: new Date('2022-03-01'),
        salary: 250000,
      },
    });
  }

  // --- Employés supplémentaires ---
  const newEmployees = [
    {
      matricule: 'EMP-002',
      firstName: 'Komi',
      lastName: 'Mensah',
      position: 'Chargé de clientèle',
      siteId: siteKara.id,
      hireDate: new Date('2021-06-15'),
      contract: { type: 'CDI', startDate: '2021-06-15', endDate: null, salary: 220000 },
      leaveBalance: { year: 2026, totalDays: 30, usedDays: 8 },
      attendanceToday: { time: setTodayTime(8, 5), site: 'Kara', status: 'PRESENT' },
    },
    {
      matricule: 'EMP-003',
      firstName: 'Afi',
      lastName: 'Adjovi',
      position: 'Agent administratif',
      siteId: siteAssivito.id,
      hireDate: new Date('2022-11-01'),
      contract: { type: 'CDD', startDate: '2022-11-01', endDate: null, salary: 180000 },
      leaveBalance: { year: 2026, totalDays: 30, usedDays: 15 },
    },
    {
      matricule: 'EMP-004',
      firstName: 'Yao',
      lastName: 'Tossou',
      position: 'Chef de site',
      siteId: siteKara.id,
      hireDate: new Date('2019-01-10'),
      contract: { type: 'CDI', startDate: '2019-01-10', endDate: null, salary: 350000 },
      careerMove: {
        date: '2023-03-01',
        fromPosition: 'Agent de terrain',
        toPosition: 'Chef de site',
        fromSite: 'Kara',
        toSite: 'Kara',
        notes: 'Promotion suite à évaluation annuelle',
      },
      leaveBalance: { year: 2026, totalDays: 30, usedDays: 3 },
      attendanceToday: { time: setTodayTime(7, 55), site: 'Kara', status: 'PRESENT' },
    },
    {
      matricule: 'EMP-005',
      firstName: 'Essi',
      lastName: 'Adjei',
      position: 'Assistante RH',
      siteId: siteAssivito.id,
      hireDate: new Date('2023-05-01'),
      contract: { type: 'CDI', startDate: '2023-05-01', endDate: null, salary: 200000 },
      leaveBalance: { year: 2026, totalDays: 30, usedDays: 20 },
      absence: { startDate: 'today', days: 3, type: 'Congé maladie', justified: true },
    },
    {
      matricule: 'EMP-006',
      firstName: 'Koffi',
      lastName: 'Agbeko',
      position: 'Technicien',
      siteId: siteKara.id,
      hireDate: new Date('2025-01-01'),
      contract: { type: 'CDD', startDate: '2025-01-01', endDate: '2026-12-31', salary: 150000 },
      leaveBalance: { year: 2026, totalDays: 30, usedDays: 5 },
      absence: { startDate: 'tomorrow', days: 5, type: 'Congé annuel', justified: false },
    },
  ];

  for (const def of newEmployees) {
    const emp = await prisma.employee.upsert({
      where: { matricule: def.matricule },
      update: {},
      create: {
        matricule: def.matricule,
        firstName: def.firstName,
        lastName: def.lastName,
        position: def.position,
        siteId: def.siteId,
        hireDate: def.hireDate,
        qrToken: crypto.randomUUID(),
      },
    });

    const hasContract = await prisma.contract.findFirst({ where: { employeeId: emp.id } });
    if (!hasContract && def.contract) {
      await prisma.contract.create({
        data: {
          employeeId: emp.id,
          type: def.contract.type,
          startDate: new Date(def.contract.startDate),
          endDate: def.contract.endDate ? new Date(def.contract.endDate) : null,
          salary: def.contract.salary,
        },
      });
    }

    if (def.careerMove) {
      const hasMove = await prisma.careerMove.findFirst({ where: { employeeId: emp.id } });
      if (!hasMove) {
        await prisma.careerMove.create({
          data: {
            employeeId: emp.id,
            date: new Date(def.careerMove.date),
            fromPosition: def.careerMove.fromPosition,
            toPosition: def.careerMove.toPosition,
            fromSite: def.careerMove.fromSite,
            toSite: def.careerMove.toSite,
            notes: def.careerMove.notes,
          },
        });
      }
    }

    if (def.leaveBalance) {
      await prisma.leaveBalance.upsert({
        where: { employeeId_year: { employeeId: emp.id, year: def.leaveBalance.year } },
        update: {},
        create: {
          employeeId: emp.id,
          year: def.leaveBalance.year,
          totalDays: def.leaveBalance.totalDays,
          usedDays: def.leaveBalance.usedDays,
        },
      });
    }

    if (def.absence) {
      const hasAbsence = await prisma.absence.findFirst({ where: { employeeId: emp.id } });
      if (!hasAbsence) {
        const start = def.absence.startDate === 'tomorrow' ? addDays(startOfToday(), 1) : startOfToday();
        const end = addDays(start, def.absence.days);
        await prisma.absence.create({
          data: {
            employeeId: emp.id,
            startDate: start,
            endDate: end,
            type: def.absence.type,
            justified: def.absence.justified,
          },
        });
      }
    }

    if (def.attendanceToday) {
      const dateOnly = startOfToday();
      const existingAttendance = await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: emp.id, date: dateOnly } },
      });
      if (!existingAttendance) {
        await prisma.attendance.create({
          data: {
            employeeId: emp.id,
            date: dateOnly,
            time: def.attendanceToday.time,
            siteName: def.attendanceToday.site,
            status: def.attendanceToday.status,
            method: 'QR',
          },
        });
      }
    }
  }

  console.log('Seed terminé.');
  console.log('RH login: rh@entreprise.tg / rh123456');
  console.log('Manager login: manager@entreprise.tg / manager123');
  console.log(`QR token employé test (${employee.matricule}): ${employee.qrToken}`);
  console.log('Employés ajoutés : EMP-002 à EMP-006');
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function setTodayTime(hours, minutes) {
  const d = startOfToday();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
