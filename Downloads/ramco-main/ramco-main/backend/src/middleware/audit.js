// Petite fonction utilitaire pour la traçabilité (exigée par le cahier des
// charges : "chaque insertion/modification/suppression doit être tracée").
// On l'appelle manuellement à la fin des routes qui créent/modifient des
// données sensibles (contrat, pointage, STC, compte utilisateur...).
const prisma = require('../prisma');

// userId       : qui a fait l'action (req.user.id)
// action       : 'CREATE' | 'UPDATE' | 'DELETE' | 'VALIDATE' | 'IMPORT'...
// entityType   : nom du modèle concerné, ex: 'Employee', 'Contract'
// entityId     : id de la ligne concernée (peut être null, ex: import en masse)
// before/after : snapshot JSON de la donnée avant/après (avant souvent null ici)
async function logAudit(userId, action, entityType, entityId, before, after) {
  await prisma.auditLog.create({
    data: { userId, action, entityType, entityId, before, after },
  });
}

module.exports = { logAudit };
