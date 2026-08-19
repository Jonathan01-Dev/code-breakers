function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

async function sendWithResend({ to, subject, html }) {
  const { getMailConfig } = require('./settings');
  const { apiKey, from } = await getMailConfig();
  if (!apiKey) {
    const err = new Error('Clé Resend absente. Renseignez-la dans Réglages.');
    err.status = 400;
    throw err;
  }
  const { Resend } = require('resend');
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    console.error('[mail] Resend a refusé l’envoi :', error);
    const err = new Error(error.message || 'Envoi Resend impossible');
    err.resend = error;
    throw err;
  }
  console.info(`[mail] envoyé à ${to} (${subject})`);
  return { ok: true };
}

async function sendResetEmail({ to, resetUrl, name }) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A">
      <div style="background:#1A1A1A;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
        <strong>SUPER<span style="color:#E31E2B">AMCO</span></strong>
      </div>
      <div style="border:1px solid #ECECEF;border-top:none;padding:22px;border-radius:0 0 12px 12px">
        <p>Bonjour ${safeName},</p>
        <p>Une demande de réinitialisation de mot de passe a été faite pour votre compte RH.</p>
        <p><a href="${safeUrl}" style="display:inline-block;background:#E31E2B;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Choisir un nouveau mot de passe</a></p>
        <p style="color:#8A8B92;font-size:13px">Ce lien expire dans 1 heure. Si vous n’êtes pas à l’origine de la demande, ignorez ce message.</p>
      </div>
    </div>
  `;
  try {
    return await sendWithResend({
      to,
      subject: 'Réinitialisation de votre mot de passe SUPERAMCO',
      html,
    });
  } catch (e) {
    if (e.status === 400) {
      console.info(`[mail] RESEND_API_KEY absente — lien de reset pour ${to} : ${resetUrl}`);
      return { ok: true, mocked: true };
    }
    throw e;
  }
}

async function sendTestEmail({ to, name }) {
  const safeName = escapeHtml(name);
  return sendWithResend({
    to,
    subject: 'Test e-mail SUPERAMCO',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A">
        <div style="background:#1A1A1A;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
          <strong>SUPER<span style="color:#E31E2B">AMCO</span></strong>
        </div>
        <div style="border:1px solid #ECECEF;border-top:none;padding:22px;border-radius:0 0 12px 12px">
          <p>Bonjour ${safeName || ''},</p>
          <p>Ceci est un e-mail de test depuis les Réglages RH. L’envoi Resend fonctionne.</p>
        </div>
      </div>
    `,
  });
}

module.exports = { sendResetEmail, sendTestEmail };
