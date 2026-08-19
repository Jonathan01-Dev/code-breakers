import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Message, Send } from 'react-iconly';
import { api } from '../api';
import AuthShell from '../AuthShell';
import AuthField from '../AuthField';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.forgotPassword(email);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell kicker="Compte" title="Réinitialiser le mot de passe">
      {done ? (
        <div className="auth-form">
          <div className="auth-form-main">
            <p className="auth-copy">
              Si un compte existe pour cette adresse, un e-mail a été envoyé (lien valable 1 heure).
              Vérifiez aussi les courriers indésirables. Sans domaine vérifié, l’expéditeur est
              {' '}<code>onboarding@resend.dev</code>.
            </p>
          </div>
          <div className="auth-form-actions">
            <Link className="auth-back" to="/login">Retour à la connexion</Link>
          </div>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form-main">
            <p className="auth-copy">
              Indiquez l’e-mail de votre compte. Vous recevrez un lien pour choisir un nouveau mot de passe.
            </p>
            <AuthField label="Email professionnel" icon={Message}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
            </AuthField>
            {error && <p className="error">{error}</p>}
          </div>
          <div className="auth-form-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Envoi…' : (
                <>
                  Envoyer le lien
                  <Send set="bold" primaryColor="currentColor" size={18} />
                </>
              )}
            </button>
            <Link className="auth-back" to="/login">Retour à la connexion</Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
