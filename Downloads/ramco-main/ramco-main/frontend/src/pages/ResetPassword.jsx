import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import AuthShell from '../AuthShell';
import PasswordField from '../PasswordField';
import { TickSquare } from 'react-iconly';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const issues = useMemo(() => passwordIssues(password), [password]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (issues.length) {
      setError(`Mot de passe trop faible : ${issues.join(', ')}`);
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas');
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      navigate('/login?reset=1', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell kicker="Compte" title="Nouveau mot de passe">
      {!token ? (
        <div className="auth-form">
          <div className="auth-form-main">
            <p className="error">Lien incomplet. Demandez un nouvel e-mail de réinitialisation.</p>
          </div>
          <div className="auth-form-actions">
            <Link className="auth-back" to="/forgot-password">Demander un lien</Link>
          </div>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form-main">
            <p className="auth-copy">Au moins 10 caractères, une lettre et un chiffre. L’ancien mot de passe et les sessions ouvertes seront invalidés.</p>
            <PasswordField
              value={password}
              onChange={setPassword}
              required
              autoComplete="new-password"
              showMeter
              autoFocus
              label="Nouveau mot de passe"
            />
            <PasswordField
              value={confirm}
              onChange={setConfirm}
              required
              autoComplete="new-password"
              label="Confirmer"
            />
            {error && <p className="error">{error}</p>}
          </div>
          <div className="auth-form-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : (
                <>
                  Enregistrer
                  <TickSquare set="bold" primaryColor="currentColor" size={18} />
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
