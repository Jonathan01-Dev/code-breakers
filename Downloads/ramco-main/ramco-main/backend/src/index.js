// Point d'entrée du serveur backend.
// Ce fichier assemble l'application Express : middlewares globaux, puis
// branchement de chaque groupe de routes ("routers") sur son préfixe d'URL.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { authenticate, requireRole } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const scanRoutes = require('./routes/scan');
const employeesRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const attendanceImportRoutes = require('./routes/attendanceImport');
const stcRoutes = require('./routes/stc');
const sitesRoutes = require('./routes/sites');
const usersRoutes = require('./routes/users');
const importRoutes = require('./routes/import');
const settingsRoutes = require('./routes/settings');
const auditRoutes = require('./routes/audit');
const { ensureTables } = require('./resetTokens');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET manquant ou trop court (16 caractères minimum).');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: false,
}));
app.use(express.json({ limit: '200kb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

const RH_ROLES = ['RH', 'RH_ASSISTANT'];

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authLimiter, authRoutes);

app.use('/api', apiLimiter);
app.use('/api/dashboard', authenticate, requireRole(...RH_ROLES), dashboardRoutes);
app.use('/api/scan', authenticate, requireRole(...RH_ROLES, 'MANAGER'), scanRoutes);
app.use('/api/employees/import', authenticate, requireRole(...RH_ROLES), importRoutes);
app.use('/api/employees', authenticate, requireRole(...RH_ROLES), employeesRoutes);
app.use('/api/attendance/import', authenticate, requireRole(...RH_ROLES), attendanceImportRoutes);
app.use('/api/attendance', authenticate, requireRole(...RH_ROLES), attendanceRoutes);
app.use('/api/stc', authenticate, requireRole(...RH_ROLES), stcRoutes);
app.use('/api/sites', authenticate, requireRole(...RH_ROLES), sitesRoutes);
app.use('/api/users', authenticate, requireRole(...RH_ROLES), usersRoutes);
app.use('/api/settings', authenticate, requireRole(...RH_ROLES), settingsRoutes);
app.use('/api/audit', authenticate, requireRole(...RH_ROLES), auditRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  ensureTables().catch((e) => console.error('Init tables auth:', e.message));
  console.log(`Backend RH démarré sur http://localhost:${PORT}`);
});

