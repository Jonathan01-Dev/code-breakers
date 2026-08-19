import { useEffect, useState } from 'react';
import Logo from './Logo';

function phoneClock() {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

export default function AuthShell({ kicker, title, children }) {
  const [clock, setClock] = useState(phoneClock);

  useEffect(() => {
    const id = window.setInterval(() => setClock(phoneClock()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <span className="auth-scan" aria-hidden="true" />
        <div className="auth-brand-inner">
          <Logo height={92} onDark animate />
          <p className="auth-kicker">Espace RH SUPERAMCO</p>
          <h1>Présences, contrats et départs — au même endroit.</h1>
          <ul className="auth-points">
            <li>Pointage QR par site, sans double scan</li>
            <li>Dossiers salariés, congés et STC</li>
            <li>Comptes nominatifs, actions tracées</li>
          </ul>
          <p className="auth-foot">Accès réservé aux équipes RH et aux managers de site.</p>
        </div>
      </aside>
      <section className="auth-stage">
        <div className="auth-phone">
          <span className="auth-phone-btn auth-phone-btn-vol" aria-hidden="true" />
          <span className="auth-phone-btn auth-phone-btn-pwr" aria-hidden="true" />
          <div className="auth-phone-screen">
            <div className="auth-phone-status" aria-hidden="true">
              <span>{clock}</span>
              <i className="auth-phone-island" />
              <span>RH</span>
            </div>
            <div className="auth-panel">
              <header className="auth-panel-head">
                <Logo height={40} />
                {kicker && <p className="page-kicker">{kicker}</p>}
                {title && <h2>{title}</h2>}
              </header>
              <div className="auth-panel-body">
                {children}
              </div>
            </div>
            <i className="auth-phone-home" aria-hidden="true" />
          </div>
        </div>
      </section>
    </div>
  );
}
