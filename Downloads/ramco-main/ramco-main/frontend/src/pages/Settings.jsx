import { useEffect, useState } from 'react';
import { Clock3, FileSignature, Palmtree, Wallet, Building2, MapPin, RotateCcw, Save, Send, Lock, Unlock } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import PageHeader from '../PageHeader';

function pad(n) {
  return String(n).padStart(2, '0');
}

function Field({ label, hint, suffix, children }) {
  return (
    <label className="settings-field">
      <span className="settings-field-label">{label}</span>
      <div className="settings-field-control">
        {children}
        {suffix && <span className="settings-suffix">{suffix}</span>}
      </div>
      {hint && <span className="settings-hint">{hint}</span>}
    </label>
  );
}

export default function Settings() {
  const { auth } = useAuth();
  const [form, setForm] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [sites, setSites] = useState([]);
  const [siteName, setSiteName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [mailUnlocked, setMailUnlocked] = useState(false);
  const [mailConfirm, setMailConfirm] = useState('');
  const [mailSaving, setMailSaving] = useState(false);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSuccess('');
  }

  useEffect(() => {
    api.settings(auth.token).then(({ settings, defaults: d }) => {
      setForm(settings);
      setDefaults(d);
    }).catch((e) => setError(e.message));
    api.sites(auth.token).then(setSites).catch(() => {});
  }, [auth.token]);

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { resendApiKey, mailFrom, appUrl, resendConfigured, ...hr } = form;
      const res = await api.saveSettings(auth.token, hr);
      setForm((f) => ({
        ...res.settings,
        resendApiKey: '',
        mailFrom: f.mailFrom,
        appUrl: f.appUrl,
        resendConfigured: f.resendConfigured,
      }));
      setSuccess('Réglages enregistrés. Ils s’appliquent immédiatement aux pointages, CDD et STC.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestMail() {
    setError('');
    setSuccess('');
    setTestingMail(true);
    try {
      const res = await api.testMail(auth.token);
      setSuccess(`E-mail de test envoyé à ${res.to}. Vérifiez aussi les indésirables.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setTestingMail(false);
    }
  }

  async function handleSaveMail(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (mailConfirm.trim() !== 'DEV') {
      setError('Pour enregistrer Resend, tapez DEV dans le champ de confirmation.');
      return;
    }
    setMailSaving(true);
    try {
      const res = await api.saveMailSettings(auth.token, {
        mailFrom: form.mailFrom,
        appUrl: form.appUrl,
        resendApiKey: form.resendApiKey,
        confirm: mailConfirm.trim(),
      });
      setForm((f) => ({ ...f, ...res.settings, resendApiKey: '' }));
      setMailConfirm('');
      setMailUnlocked(false);
      setSuccess('Configuration e-mail enregistrée.');
    } catch (err) {
      setError(err.message);
    } finally {
      setMailSaving(false);
    }
  }

  function lockMail() {
    setMailUnlocked(false);
    setMailConfirm('');
    api.settings(auth.token).then(({ settings }) => {
      setForm((f) => ({
        ...f,
        mailFrom: settings.mailFrom,
        appUrl: settings.appUrl,
        resendApiKey: '',
        resendConfigured: settings.resendConfigured,
      }));
    }).catch(() => {});
  }

  async function handleAddSite(e) {
    e?.preventDefault();
    if (!siteName.trim()) return;
    try {
      const site = await api.createSite(auth.token, siteName.trim());
      setSites((s) => [...s, site].sort((a, b) => a.name.localeCompare(b.name)));
      setSiteName('');
    } catch (err) {
      setError(err.message);
    }
  }

  if (!form) {
    return (
      <div>
      <PageHeader title="Réglages" subtitle="Barèmes, durées et seuils de l’application" />
        {error && <p className="error">{error}</p>}
        <div className="kpi-row">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 180, flex: 1 }} />
          ))}
        </div>
      </div>
    );
  }

  const late = `${pad(form.lateHour)}:${pad(form.lateMinute)}`;

  return (
    <div>
      <PageHeader title="Réglages" subtitle="Barèmes, durées et seuils de l’application" />

      <form onSubmit={handleSave}>
        <section className="settings-card">
          <div className="settings-card-head">
            <Building2 size={18} strokeWidth={2.2} />
            <div>
              <h3>Entreprise</h3>
              <p>Identité affichée sur les documents et montants.</p>
            </div>
          </div>
          <div className="settings-grid">
            <Field label="Raison sociale" hint="Apparaît en en-tête du reçu STC.">
              <input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} required />
            </Field>
            <Field label="Devise" hint="Utilisée pour les salaires et indemnités.">
              <input value={form.currency} onChange={(e) => set('currency', e.target.value)} required />
            </Field>
            <Field label="Âge de la retraite" suffix="ans" hint="Alerte si un départ en retraite est trop tôt.">
              <input type="number" min={40} max={80} value={form.retirementAge} onChange={(e) => set('retirementAge', e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <MapPin size={18} strokeWidth={2.2} />
            <div>
              <h3>Sites / agences</h3>
              <p>Utilisés pour rattacher les employés et les managers.</p>
            </div>
          </div>
          <ul className="settings-sites">
            {sites.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
          <div className="settings-site-form">
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSite(); } }}
              placeholder="Nouveau site"
            />
            <button type="button" className="toolbar-btn active" onClick={handleAddSite}>Ajouter</button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <Clock3 size={18} strokeWidth={2.2} />
            <div>
              <h3>Pointage & horaires</h3>
              <p>Seuil unique pour marquer un arrivée comme retard.</p>
            </div>
          </div>
          <div className="settings-grid">
            <Field label="Heure limite" suffix="h" hint="Heure à partir de laquelle un scan devient un retard.">
              <input type="number" min={0} max={23} value={form.lateHour} onChange={(e) => set('lateHour', e.target.value)} />
            </Field>
            <Field label="Minutes" suffix="min">
              <input type="number" min={0} max={59} value={form.lateMinute} onChange={(e) => set('lateMinute', e.target.value)} />
            </Field>
          </div>
          <div className="settings-formula">
            Un pointage après <strong>{late}</strong> est enregistré comme <strong>retard</strong>. Avant ou à {late}, il est <strong>présent</strong>.
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <FileSignature size={18} strokeWidth={2.2} />
            <div>
              <h3>Contrats CDD</h3>
              <p>Limite légale de cumul et seuil d’alerte du tableau de bord.</p>
            </div>
          </div>
          <div className="settings-grid">
            <Field label="Durée maximale cumulée" suffix="ans" hint="Un nouveau CDD qui dépasse ce total est bloqué.">
              <input type="number" min={0.5} step={0.5} value={form.cddMaxYears} onChange={(e) => set('cddMaxYears', e.target.value)} />
            </Field>
            <Field label="Alerter avant la limite" suffix="ans" hint="Les CDD apparaissent au dashboard à partir de (max − cette valeur).">
              <input type="number" min={0} step={0.1} value={form.cddAlertYearsBefore} onChange={(e) => set('cddAlertYearsBefore', e.target.value)} />
            </Field>
          </div>
          <div className="settings-formula">
            Alerte dès <strong>{Math.max(0, Number(form.cddMaxYears) - Number(form.cddAlertYearsBefore)).toFixed(1)} ans</strong> de CDD cumulés. Blocage au-delà de <strong>{form.cddMaxYears} ans</strong>.
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <Palmtree size={18} strokeWidth={2.2} />
            <div>
              <h3>Congés</h3>
              <p>Solde attribué automatiquement à chaque nouvel employé.</p>
            </div>
          </div>
          <div className="settings-grid">
            <Field label="Congés annuels par défaut" suffix="jours" hint="Créé pour l’année d’embauche (ajout manuel et import Excel).">
              <input type="number" min={0} step={0.5} value={form.defaultAnnualLeaveDays} onChange={(e) => set('defaultAnnualLeaveDays', e.target.value)} />
            </Field>
            <Field label="Jours de salaire / mois" suffix="j" hint="Diviseur pour le taux journalier du STC (souvent 30).">
              <input type="number" min={1} max={31} value={form.salaryDaysPerMonth} onChange={(e) => set('salaryDaysPerMonth', e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <Wallet size={18} strokeWidth={2.2} />
            <div>
              <h3>Indemnités de départ</h3>
              <p>Mois de salaire par année d’ancienneté, selon le motif. 0 = pas d’indemnité.</p>
            </div>
          </div>
          <div className="settings-grid">
            <Field label="Démission" suffix="mois / an">
              <input type="number" min={0} step={0.05} value={form.indemnityRateDemission} onChange={(e) => set('indemnityRateDemission', e.target.value)} />
            </Field>
            <Field label="Fin de CDD" suffix="mois / an">
              <input type="number" min={0} step={0.05} value={form.indemnityRateFinCdd} onChange={(e) => set('indemnityRateFinCdd', e.target.value)} />
            </Field>
            <Field label="Retraite" suffix="mois / an">
              <input type="number" min={0} step={0.05} value={form.indemnityRateRetraite} onChange={(e) => set('indemnityRateRetraite', e.target.value)} />
            </Field>
            <Field label="Licenciement" suffix="mois / an">
              <input type="number" min={0} step={0.05} value={form.indemnityRateLicenciement} onChange={(e) => set('indemnityRateLicenciement', e.target.value)} />
            </Field>
          </div>
          <div className="settings-formula">
            Indemnité = dernier salaire × taux × ancienneté en années. Les congés non pris sont payés au taux journalier (salaire ÷ {form.salaryDaysPerMonth} j).
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <Clock3 size={18} strokeWidth={2.2} />
            <div>
              <h3>Préavis</h3>
              <p>Durée affichée sur le reçu STC, selon le motif de départ.</p>
            </div>
          </div>
          <div className="settings-grid">
            <Field label="Démission" suffix="jours">
              <input type="number" min={0} value={form.noticeDaysDemission} onChange={(e) => set('noticeDaysDemission', e.target.value)} />
            </Field>
            <Field label="Fin de CDD" suffix="jours">
              <input type="number" min={0} value={form.noticeDaysFinCdd} onChange={(e) => set('noticeDaysFinCdd', e.target.value)} />
            </Field>
            <Field label="Retraite" suffix="jours">
              <input type="number" min={0} value={form.noticeDaysRetraite} onChange={(e) => set('noticeDaysRetraite', e.target.value)} />
            </Field>
            <Field label="Licenciement" suffix="jours">
              <input type="number" min={0} value={form.noticeDaysLicenciement} onChange={(e) => set('noticeDaysLicenciement', e.target.value)} />
            </Field>
          </div>
        </section>

        {error && !mailUnlocked && <p className="error">{error}</p>}
        {success && !mailUnlocked && <p className="scan-result success" style={{ maxWidth: 'none', margin: '0 0 1rem' }}>{success}</p>}

        <div className="settings-actions">
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => {
              setForm((f) => ({
                ...defaults,
                mailFrom: f.mailFrom,
                appUrl: f.appUrl,
                resendApiKey: '',
                resendConfigured: f.resendConfigured,
              }));
              setSuccess('');
            }}
            disabled={!defaults}
          >
            <RotateCcw size={15} strokeWidth={2.2} />
            Réinitialiser les valeurs d’origine
          </button>
          <button type="submit" className="primary-btn" disabled={saving}>
            <Save size={15} strokeWidth={2.2} />
            {saving ? 'Enregistrement…' : 'Enregistrer les réglages'}
          </button>
        </div>
      </form>

      <form className={`settings-card settings-dev-card${mailUnlocked ? ' is-open' : ''}`} onSubmit={handleSaveMail}>
        <div className="settings-card-head">
          <Lock size={18} strokeWidth={2.2} />
          <div>
            <h3>E-mails (Resend)</h3>
            <p>Réservé au développeur. Ne pas modifier depuis le quotidien RH.</p>
          </div>
          <span className="settings-dev-badge">DEV</span>
        </div>
        <p className="settings-dev-warn">
          Une mauvaise clé ou un mauvais expéditeur coupe les e-mails de mot de passe oublié.
          {form.resendConfigured ? ' Envoi actuellement actif.' : ' Envoi non configuré.'}
        </p>
        {!mailUnlocked ? (
          <div className="settings-actions" style={{ margin: '0.5rem 0 0' }}>
            <button type="button" className="toolbar-btn" onClick={() => { setMailUnlocked(true); setError(''); setSuccess(''); }}>
              <Unlock size={15} strokeWidth={2.2} />
              Déverrouiller (développeur)
            </button>
            <button type="button" className="toolbar-btn" onClick={handleTestMail} disabled={testingMail || !form.resendConfigured}>
              <Send size={15} strokeWidth={2.2} />
              {testingMail ? 'Envoi…' : 'Tester l’envoi'}
            </button>
          </div>
        ) : (
          <>
            <div className="settings-grid">
              <Field
                label="Clé API Resend"
                hint={form.resendConfigured
                  ? 'Une clé est déjà enregistrée. Laissez vide pour la conserver.'
                  : 'Dashboard Resend → API Keys. Jamais réaffichée ensuite.'}
              >
                <input
                  type="password"
                  autoComplete="off"
                  value={form.resendApiKey || ''}
                  onChange={(e) => set('resendApiKey', e.target.value)}
                  placeholder={form.resendConfigured ? '••••••••••••' : 're_…'}
                />
              </Field>
              <Field
                label="Expéditeur"
                hint="Sans domaine vérifié : SUPERAMCO RH <onboarding@resend.dev>."
              >
                <input
                  value={form.mailFrom || ''}
                  onChange={(e) => set('mailFrom', e.target.value)}
                  placeholder="SUPERAMCO RH <onboarding@resend.dev>"
                />
              </Field>
              <Field
                label="URL de l’application"
                hint="Base des liens dans les e-mails. En local : http://localhost:5173"
              >
                <input
                  value={form.appUrl || ''}
                  onChange={(e) => set('appUrl', e.target.value)}
                  placeholder="http://localhost:5173"
                />
              </Field>
              <Field
                label="Confirmation développeur"
                hint="Tapez DEV en majuscules pour autoriser l’enregistrement."
              >
                <input
                  value={mailConfirm}
                  onChange={(e) => setMailConfirm(e.target.value)}
                  placeholder="DEV"
                  autoComplete="off"
                />
              </Field>
            </div>
            {error && <p className="error" style={{ marginTop: '1rem' }}>{error}</p>}
            {success && <p className="scan-result success" style={{ maxWidth: 'none', margin: '1rem 0 0' }}>{success}</p>}
            <div className="settings-actions" style={{ margin: '1rem 0 0' }}>
              <button type="button" className="toolbar-btn" onClick={lockMail}>Annuler</button>
              <button type="button" className="toolbar-btn" onClick={handleTestMail} disabled={testingMail || !form.resendConfigured}>
                <Send size={15} strokeWidth={2.2} />
                {testingMail ? 'Envoi…' : 'Tester l’envoi'}
              </button>
              <button type="submit" className="danger-btn" disabled={mailSaving || mailConfirm.trim() !== 'DEV'}>
                <Save size={15} strokeWidth={2.2} />
                {mailSaving ? 'Enregistrement…' : 'Enregistrer Resend'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
