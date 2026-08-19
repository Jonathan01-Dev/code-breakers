import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Message, Login as LoginIcon } from 'react-iconly';
import { api } from '../api';
import { rememberedEmail, useAuth } from '../AuthContext';
import AuthShell from '../AuthShell';
import AuthField from '../AuthField';
import PasswordField from '../PasswordField';

export default function Login() {
  const savedEmail = rememberedEmail();
  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(Boolean(savedEmail));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();
  const resetOk = params.get('reset') === '1';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api.login(email, password, remember);
      login(token, user, remember);
      navigate(user.role === 'MANAGER' ? '/scan' : '/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell kicker="Connexion" title="Accéder à votre espace">
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-form-main">
          {resetOk && <p className="auth-ok">Mot de passe mis à jour. Connectez-vous avec le nouveau.</p>}
          <AuthField label="Email professionnel" icon={Message}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={!savedEmail}
              autoComplete="username"
              placeholder="prenom.nom@entreprise.tg"
            />
          </AuthField>
          <PasswordField
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
            autoFocus={Boolean(savedEmail)}
          />
          <div className="auth-row">
            <label className="auth-remember">
              <input
                type="checkbox"
                role="switch"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="auth-remember-box" aria-hidden="true" />
              <span>Se souvenir de moi</span>
            </label>
            <Link to="/forgot-password">Mot de passe oublié ?</Link>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
        <div className="auth-form-actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Connexion…' : (
              <>
                Se connecter
                <LoginIcon set="bold" primaryColor="currentColor" size={18} />
              </>
            )}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
