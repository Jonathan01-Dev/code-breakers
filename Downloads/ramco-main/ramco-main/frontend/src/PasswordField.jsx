import { useState } from 'react';
import { Lock, Show, Hide } from 'react-iconly';
import { passwordIssues, passwordLabel, passwordScore } from './password';

export default function PasswordField({
  value,
  onChange,
  required,
  autoComplete = 'current-password',
  placeholder,
  showMeter = false,
  autoFocus = false,
  label = 'Mot de passe',
}) {
  const [visible, setVisible] = useState(false);
  const score = passwordScore(value);
  const issues = passwordIssues(value);

  return (
    <label className="pw-field auth-field">
      {label}
      <div className="auth-field-wrap">
        <span className="auth-field-ico" aria-hidden="true">
          <Lock set="light" primaryColor="currentColor" stroke="regular" size={18} />
        </span>
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
          minLength={showMeter && required ? 10 : undefined}
        />
        <button
          type="button"
          className="pw-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible
            ? <Hide set="light" primaryColor="currentColor" size={18} />
            : <Show set="light" primaryColor="currentColor" size={18} />}
        </button>
      </div>
      {showMeter && value && (
        <div className="pw-meter" data-score={score}>
          <span /><span /><span /><span />
          <p>
            {passwordLabel(score)}
            {issues.length ? ` — il manque ${issues.join(', ')}` : ' — conforme'}
          </p>
        </div>
      )}
    </label>
  );
}
