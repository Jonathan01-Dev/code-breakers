// Règles métier du cahier des charges, centralisées ici pour être réutilisées
// par plusieurs routes (employees.js, scan.js, stc.js, import.js...) sans
// dupliquer la logique. Ce sont de simples fonctions pures (pas d'accès à la
// base de données ici) : elles prennent des données en entrée et renvoient
// un résultat, ce qui les rend faciles à tester.

const { indemnityRateFor } = require('../settings');

// Calcule une ancienneté "humaine" (X ans, Y mois, Z jours) entre deux dates,
// utilisée pour l'affichage du dossier employé et le calcul du STC.
function calcSeniority(startDate, endDate) {
  let years = endDate.getFullYear() - startDate.getFullYear();
  let months = endDate.getMonth() - startDate.getMonth();
  let days = endDate.getDate() - startDate.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

function seniorityYearsDecimal(seniority) {
  return seniority.years + seniority.months / 12 + seniority.days / 365;
}

function cddCumulativeYears(contracts) {
  const totalDays = contracts
    .filter((c) => c.type === 'CDD')
    .reduce((sum, c) => {
      const end = c.endDate ? new Date(c.endDate) : new Date();
      const start = new Date(c.startDate);
      return sum + Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
    }, 0);
  return totalDays / 365;
}

function exceedsCddLimit(contracts, newContract, maxYears) {
  const projected = [...contracts, newContract];
  return cddCumulativeYears(projected.filter((c) => c.type === 'CDD')) > maxYears;
}

function attendanceStatusFromTime(date, lateHour, lateMinute) {
  const h = date.getHours();
  const m = date.getMinutes();
  return h > lateHour || (h === lateHour && m > lateMinute) ? 'RETARD' : 'PRESENT';
}

function validateDateOrder(startDate, endDate, label = 'date') {
  if (endDate && new Date(endDate) < new Date(startDate)) {
    throw new Error(`La date de fin (${label}) ne peut pas être antérieure à la date de début`);
  }
}

function computeIndemnities(lastSalary, seniority, remainingLeaveDays, reason, settings) {
  const daysPerMonth = Number(settings.salaryDaysPerMonth) || 30;
  const dailyRate = Number(lastSalary) / daysPerMonth;
  const years = seniorityYearsDecimal(seniority);
  const rate = indemnityRateFor(reason, settings);
  const indemniteDepart = Math.round(dailyRate * daysPerMonth * rate * years);
  const indemniteConges = Math.round(dailyRate * Math.max(0, remainingLeaveDays));
  return {
    indemniteDepart,
    indemniteConges,
    totalAmount: indemniteDepart + indemniteConges,
    dailyRate,
    rate,
    remainingLeaveDays: Math.max(0, remainingLeaveDays),
    seniorityYearsDecimal: years,
  };
}

module.exports = {
  calcSeniority,
  seniorityYearsDecimal,
  cddCumulativeYears,
  exceedsCddLimit,
  attendanceStatusFromTime,
  validateDateOrder,
  computeIndemnities,
};
