import { useEffect, useState } from 'react';
import { Search, Eye } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Avatar from '../Avatar';
import Badge from '../Badge';
import Modal from '../Modal';

const ACTION_FILTERS = [
  { value: '', label: 'Toutes les actions' },
  { value: 'CREATE', label: 'Créations' },
  { value: 'UPDATE', label: 'Modifications' },
  { value: 'DELETE', label: 'Suppressions' },
  { value: 'IMPORT', label: 'Imports' },
  { value: 'VALIDATE', label: 'Validations' },
];

function fmtWhen(d) {
  return new Date(d).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function entityLabel(type) {
  return ({
    Employee: 'Employé',
    Attendance: 'Présence',
    Contract: 'Contrat',
    CareerMove: 'Mutation',
    Absence: 'Absence',
    STC: 'STC',
    User: 'Compte',
    Site: 'Site',
    HrSetting: 'Réglages',
    HrSettingMail: 'E-mails',
  }[type] || type);
}

function snapshot(value) {
  if (value == null) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function Audit() {
  const { auth } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState(null);
  const take = 80;

  function load(nextSkip = skip) {
    const params = { take: String(take), skip: String(nextSkip) };
    if (q.trim()) params.q = q.trim();
    if (action) params.action = action;
    if (entityType) params.entityType = entityType;
    api.audit(auth.token, params).then(setData).catch((e) => setError(e.message));
  }

  useEffect(() => {
    setSkip(0);
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, action, entityType]);

  function handleSearch(e) {
    e.preventDefault();
    setSkip(0);
    load(0);
  }

  const items = data?.items || [];
  const total = data?.total || 0;
  const page = Math.floor(skip / take) + 1;
  const pages = Math.max(1, Math.ceil(total / take));

  return (
    <div className="emp-page">
      <section className="emp-table-card">
        <div className="emp-toolbar">
          <p className="page-kicker" style={{ margin: 0 }}>
            Traçabilité des créations, modifications, suppressions et imports
          </p>
          <form className="audit-filters" onSubmit={handleSearch}>
            <label className="emp-search">
              <Search size={15} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nom, e-mail, type, id…"
              />
            </label>
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTION_FILTERS.map((f) => (
                <option key={f.value || 'all'} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="">Tous les objets</option>
              {(data?.entityTypes || []).map((t) => (
                <option key={t} value={t}>{entityLabel(t)}</option>
              ))}
            </select>
          </form>
        </div>

        {error && <p className="error" style={{ margin: '0 1rem 1rem' }}>{error}</p>}

        <table className="table emp-table">
          <thead>
            <tr>
              <th>Quand</th>
              <th>Auteur</th>
              <th>Action</th>
              <th>Ce qui s’est passé</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td>{fmtWhen(r.createdAt)}</td>
                <td>
                  <div className="table-row-main">
                    <Avatar firstName={r.user?.name?.split(' ')[0] || '?'} lastName={r.user?.name?.split(' ')[1] || ''} size={30} />
                    <div>
                      <div className="emp-name">{r.user?.name || 'Système'}</div>
                      <div className="emp-sub">{r.user?.email || '—'}</div>
                    </div>
                  </div>
                </td>
                <td><Badge value={r.action} /></td>
                <td>
                  <div className="emp-name">{r.summary}</div>
                  <div className="emp-sub">{entityLabel(r.entityType)}{r.entityId != null ? ` · n° ${r.entityId}` : ''}</div>
                </td>
                <td>
                  <button type="button" className="icon-btn" title="Détail" onClick={() => setSelected(r)}>
                    <Eye size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">Aucune entrée d’audit</td>
              </tr>
            )}
          </tbody>
        </table>

        {total > take && (
          <div className="audit-pager">
            <button type="button" className="toolbar-btn" disabled={skip <= 0} onClick={() => { const n = Math.max(0, skip - take); setSkip(n); load(n); }}>
              Précédent
            </button>
            <span>Page {page} / {pages} · {total} événement(s)</span>
            <button type="button" className="toolbar-btn" disabled={skip + take >= total} onClick={() => { const n = skip + take; setSkip(n); load(n); }}>
              Suivant
            </button>
          </div>
        )}
      </section>

      {selected && (
        <Modal
          title={selected.summary}
          subtitle={`${fmtWhen(selected.createdAt)} · ${selected.user?.name || 'Système'}`}
          onClose={() => setSelected(null)}
          footer={<button type="button" className="primary-btn" onClick={() => setSelected(null)}>Fermer</button>}
        >
          <ul className="dossier">
            <li>{selected.user?.name || 'Système'} {selected.summary}</li>
            <li>Objet technique : <strong>{entityLabel(selected.entityType)}</strong> {selected.entityId != null ? `n° ${selected.entityId}` : '(opération groupée)'}</li>
          </ul>
          <p className="page-kicker">Avant</p>
          <pre className="audit-json">{snapshot(selected.before)}</pre>
          <p className="page-kicker">Après</p>
          <pre className="audit-json">{snapshot(selected.after)}</pre>
        </Modal>
      )}
    </div>
  );
}
