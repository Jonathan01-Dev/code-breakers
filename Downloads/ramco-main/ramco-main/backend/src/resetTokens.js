const crypto = require('crypto');
const prisma = require('./prisma');

let ready = null;

async function runEnsure() {
  try{
    await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP');
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PasswordResetToken" (id SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE, "tokenHash" TEXT NOT NULL UNIQUE, "expiresAt" TIMESTAMP NOT NULL, "usedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT NOW())`);
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId")');
    try {
      await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_idx" ON "User" (lower(email))');
    } catch (e) {
      console.warn('Index email unique (casse ignorée) :', e.message);
    }
  } catch (error) {
    console.error('Erreur lors de l’initialisation des tables dans resetTokens:', error.message);
  }
}

function ensureTables() {
  if (!ready) {
    ready = runEnsure().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function createResetToken(userId) {
  await ensureTables();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.$executeRaw`UPDATE "PasswordResetToken" SET "usedAt" = NOW() WHERE "userId" = ${userId} AND "usedAt" IS NULL`;
  await prisma.$executeRaw`
    INSERT INTO "PasswordResetToken" ("userId", "tokenHash", "expiresAt")
    VALUES (${userId}, ${tokenHash}, ${expiresAt})
  `;
  return token;
}

async function consumeResetToken(token) {
  await ensureTables();
  const tokenHash = hashToken(token);
  const rows = await prisma.$queryRaw`
    SELECT id, "userId" FROM "PasswordResetToken"
    WHERE "tokenHash" = ${tokenHash}
      AND "usedAt" IS NULL
      AND "expiresAt" > NOW()
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  await prisma.$executeRaw`UPDATE "PasswordResetToken" SET "usedAt" = NOW() WHERE id = ${row.id}`;
  return row.userId;
}

async function markPasswordChanged(userId) {
  await ensureTables();
  await prisma.$executeRaw`UPDATE "User" SET "passwordChangedAt" = NOW() WHERE id = ${userId}`;
}

async function passwordChangedAt(userId) {
  try {
    const rows = await prisma.$queryRaw`SELECT "passwordChangedAt" FROM "User" WHERE id = ${userId}`;
    return rows[0]?.passwordChangedAt || null;
  } catch {
    return null;
  }
}

module.exports = { ensureTables, createResetToken, consumeResetToken, markPasswordChanged, passwordChangedAt };
