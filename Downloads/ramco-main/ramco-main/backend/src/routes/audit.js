const express = require('express');
const prisma = require('../prisma');
const { describeAudit } = require('../auditCopy');

const router = express.Router();

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'VALIDATE', 'IMPORT'];

router.get('/', async (req, res) => {
  const take = Math.min(Math.max(Number(req.query.take) || 80, 1), 200);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const action = String(req.query.action || '').toUpperCase();
  const entityType = String(req.query.entityType || '').trim();
  const q = String(req.query.q || '').trim();

  const where = {};
  if (ACTIONS.includes(action)) where.action = action;
  if (entityType) where.entityType = entityType;

  if (q) {
    where.OR = [
      { entityType: { contains: q, mode: 'insensitive' } },
      { action: { contains: q, mode: 'insensitive' } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
    ];
    const asId = Number(q);
    if (Number.isInteger(asId) && asId > 0) {
      where.OR.push({ entityId: asId });
    }
  }

  const [total, rows, typeRows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.auditLog.findMany({
      select: { entityType: true },
      distinct: ['entityType'],
    }),
  ]);

  const employeeIds = [...new Set(rows.map((r) => Number(r.after?.employeeId || r.before?.employeeId)).filter((id) => id > 0))];
  const employees = employeeIds.length
    ? await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true, matricule: true },
    })
    : [];
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  function withEmployee(payload) {
    if (!payload || typeof payload !== 'object' || !payload.employeeId) return payload;
    const emp = employeeById.get(Number(payload.employeeId));
    if (!emp) return payload;
    return { ...payload, firstName: emp.firstName, lastName: emp.lastName, matricule: emp.matricule };
  }

  res.json({
    total,
    take,
    skip,
    entityTypes: [...new Set(typeRows.map((t) => t.entityType).filter(Boolean))].sort(),
    items: rows.map((r) => {
      const before = withEmployee(r.before);
      const after = withEmployee(r.after);
      return {
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        before,
        after,
        createdAt: r.createdAt,
        summary: describeAudit({ ...r, before, after }),
        user: r.user ? { id: r.user.id, name: r.user.name, email: r.user.email, role: r.user.role } : null,
      };
    }),
  });
});

module.exports = router;
