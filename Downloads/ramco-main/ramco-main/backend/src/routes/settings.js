const express = require('express');
const { getSettings, saveSettings, DEFAULTS, publicSettings, redactSettings } = require('../settings');
const { logAudit } = require('../middleware/audit');
const { sendTestEmail } = require('../mail');

const router = express.Router();

router.get('/', async (req, res) => {
  const settings = publicSettings(await getSettings());
  res.json({ settings, defaults: DEFAULTS });
});

router.put('/', async (req, res) => {
  try {
    const before = await getSettings();
    const saved = await saveSettings(req.body || {}, req.user.id, { updateMail: false });
    await logAudit(req.user.id, 'UPDATE', 'HrSetting', 1, redactSettings(before), redactSettings(saved));
    res.json({ settings: publicSettings(saved) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/mail', async (req, res) => {
  if (String(req.body?.confirm || '').trim() !== 'DEV') {
    return res.status(403).json({ error: 'Saisie développeur requise (tapez DEV) pour modifier Resend' });
  }
  try {
    const before = await getSettings();
    const saved = await saveSettings(req.body || {}, req.user.id, { updateMail: true });
    await logAudit(req.user.id, 'UPDATE', 'HrSettingMail', 1, redactSettings(before), redactSettings(saved));
    res.json({ settings: publicSettings(saved) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/test-mail', async (req, res) => {
  try {
    await sendTestEmail({ to: req.user.email, name: req.user.name });
    res.json({ ok: true, to: req.user.email });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Envoi impossible' });
  }
});

module.exports = router;
