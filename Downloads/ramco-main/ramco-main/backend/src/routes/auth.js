const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { normalizeEmail, isValidEmail, assertPassword } = require('../password');
const { createResetToken, consumeResetToken, markPasswordChanged } = require('../resetTokens');
const { getMailConfig } = require('../settings');
const { sendResetEmail } = require('../mail');

const router = express.Router();

// Hash figé uniquement pour égaliser le temps de réponse quand l'email n'existe pas
// (évite de révéler qu'un compte est absent par la durée de bcrypt.compare).
const DUMMY_HASH = '$2b$10$jdpA81D4DgdT8zZ4xzVWIOfcE3OE3YfEaM9jqwFvVgOmtLawpkfe2';

function signUser(user, rememberMe) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET manquant ou trop court');
  }
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name, siteId: user.siteId },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? '7d' : '12h' }
  );
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, siteId: user.siteId };
}

router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    const hash = user?.passwordHash || DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const rememberMe = Boolean(req.body?.rememberMe);
    res.json({ token: signUser(user, rememberMe), user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const generic = { ok: true, message: 'Si un compte existe, un e-mail a été envoyé.' };
  if (!isValidEmail(email)) return res.json(generic);

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  if (!user) return res.json(generic);

  try {
    const token = await createResetToken(user.id);
    const { appUrl } = await getMailConfig();
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    await sendResetEmail({ to: user.email, resetUrl, name: user.name });
  } catch (e) {
    console.error('[mail] échec reset :', e.resend || e.message || e);
  }
  res.json(generic);
});

router.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '');
  if (!token) return res.status(400).json({ error: 'Lien invalide ou expiré' });
  try {
    assertPassword(password);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const userId = await consumeResetToken(token);
  if (!userId) return res.status(400).json({ error: 'Lien invalide ou expiré' });

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await markPasswordChanged(userId);
  res.json({ ok: true });
});

module.exports = router;
