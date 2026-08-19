// Routes de gestion des comptes utilisateurs (page "Utilisateurs" du
// frontend). Accessible uniquement aux RH/Assistants RH (voir index.js).
// Ce sont des comptes de connexion à l'application (User), à ne pas
// confondre avec les Employee (fiches du personnel de l'entreprise) —
// un manager de site a un compte User pour se connecter, mais n'a pas
// forcément de fiche Employee.
const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const { logAudit } = require('../middleware/audit');
const { normalizeEmail, isValidEmail, assertPassword } = require('../password');
const { markPasswordChanged } = require('../resetTokens');

const router = express.Router();

const ACTION_LABELS = {
  CREATE: 'création',
  UPDATE: 'modification',
  DELETE: 'suppression',
};

function packAction(log) {
  if (!log) return null;
  return {
    action: log.action,
    label: ACTION_LABELS[log.action] || log.action.toLowerCase(),
    by: log.user?.name || 'Compte retiré',
    at: log.createdAt,
  };
}

function publicUser(u, lastAction) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    site: u.site,
    createdAt: u.createdAt,
    lastAction: lastAction || null,
  };
}

// GET /api/users — liste tous les comptes, avec le site rattaché (pour les managers).
router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({
    include: { site: true },
    orderBy: { name: 'asc' },
  });
  const ids = users.map((u) => u.id);
  const [logs, lastGlobal] = await Promise.all([
    ids.length
      ? prisma.auditLog.findMany({
          where: { entityType: 'User', entityId: { in: ids } },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : [],
    prisma.auditLog.findFirst({
      where: { entityType: 'User' },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const latestByEntity = new Map();
  for (const log of logs) {
    if (!latestByEntity.has(log.entityId)) latestByEntity.set(log.entityId, packAction(log));
  }
  res.json({
    users: users.map((u) => publicUser(u, latestByEntity.get(u.id))),
    lastAction: packAction(lastGlobal),
  });
});

// POST /api/users — création d'un compte RH, Assistant RH ou Manager de site.
router.post('/', async (req, res) => {
  const { name, password, role, siteId } = req.body || {};
  const email = normalizeEmail(req.body?.email);
  if (!email || !name || !password || !role) {
    return res.status(400).json({ error: 'Email, nom, mot de passe et rôle sont requis' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Adresse e-mail invalide' });
  }
  if (!['RH', 'RH_ASSISTANT', 'MANAGER'].includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }
  if (role === 'MANAGER' && !siteId) {
    return res.status(400).json({ error: 'Un manager doit être rattaché à un site' });
  }
  try {
    assertPassword(password);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (existing) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      name: String(name).trim(),
      passwordHash,
      role,
      siteId: role === 'MANAGER' ? Number(siteId) : null,
    },
  });

  await logAudit(req.user.id, 'CREATE', 'User', user.id, null, { email, name, role });
  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role, siteId: user.siteId });
});

// PUT /api/users/:id — modification d'un compte existant (nom, rôle, site,
// et éventuellement mot de passe). Chaque champ n'est mis à jour que s'il
// est fourni dans la requête (permet des mises à jour partielles).
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, role, siteId, password } = req.body || {};
  const email = req.body?.email != null ? normalizeEmail(req.body.email) : '';

  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ error: 'Compte introuvable' });

  const data = {};
  if (name) data.name = String(name).trim();
  if (email && email !== current.email.toLowerCase()) {
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Adresse e-mail invalide' });
    }
    const taken = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, NOT: { id } },
    });
    if (taken) return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    data.email = email;
  }
  if (role) {
    if (!['RH', 'RH_ASSISTANT', 'MANAGER'].includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' });
    }
    data.role = role;
    data.siteId = role === 'MANAGER' ? (siteId ? Number(siteId) : current.siteId) : null;
    if (role === 'MANAGER' && !data.siteId) {
      return res.status(400).json({ error: 'Un manager doit être rattaché à un site' });
    }
  }
  if (password) {
    try {
      assertPassword(password);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    data.passwordHash = await bcrypt.hash(password, 12);
  }

  const user = await prisma.user.update({ where: { id }, data });
  if (password) await markPasswordChanged(id);
  await logAudit(req.user.id, 'UPDATE', 'User', id, { name: current.name, email: current.email, role: current.role }, {
    name: user.name,
    email: user.email,
    role: user.role,
    siteId: user.siteId,
  });
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role, siteId: user.siteId });
});

// DELETE /api/users/:id — suppression d'un compte.
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  // On empêche un utilisateur de supprimer son propre compte (sinon il se
  // déconnecterait sans pouvoir revenir en arrière).
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }
  const existing = await prisma.user.findUnique({ where: { id }, include: { site: true } });
  if (!existing) return res.status(404).json({ error: 'Compte introuvable' });
  try {
    // La suppression peut échouer si ce compte est référencé ailleurs en
    // base (ex: Attendance.scannedById ou AuditLog.userId) : PostgreSQL
    // refuse de casser cette référence (contrainte de clé étrangère).
    await prisma.user.delete({ where: { id } });
  } catch {
    return res.status(409).json({ error: 'Ce compte a déjà des pointages/actions associés et ne peut pas être supprimé' });
  }
  await logAudit(req.user.id, 'DELETE', 'User', id, { email: existing.email, name: existing.name, role: existing.role }, null);
  res.status(204).end(); // 204 = succès, pas de contenu à renvoyer
});

module.exports = router;
