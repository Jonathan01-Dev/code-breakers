import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Flag,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  ListTodo,
  MoreVertical,
  Download,
  Eye,
  Plus,
  Calculator,
  FileCheck2,
  LayoutList,
  Columns3,
  Filter,
  CalendarDays,
  FileText,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Avatar from '../Avatar';
import Badge from '../Badge';
import Modal from '../Modal';
import { ACTION } from '../appActions';

const REASONS = [
  { value: 'DEMISSION', label: 'Démission', tone: 'low' },
  { value: 'FIN_CDD', label: 'Fin de CDD', tone: 'medium' },
  { value: 'RETRAITE', label: 'Retraite', tone: 'info' },
  { value: 'LICENCIEMENT', label: 'Licenciement', tone: 'high' },
];

const HORIZON_DAYS = 90;

function money(n, currency = 'FCFA') {
  return `${Number(n).toLocaleString('fr-FR')} ${currency}`;
}

function daysUntil(date) {
  const t = new Date(date);
  t.setHours(0, 0, 0, 0);
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  return Math.round((t - n) / 86400000);
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isoDay(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function lastContract(emp) {
  return emp.contracts?.[0] || null;
}

function reasonOf(value) {
  return REASONS.find((r) => r.value === value);
}

export default function Departures() {
  const { auth } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [history, setHistory] = useState([]);
  const [sites, setSites] = useState([]);
  const [q, setQ] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [showReasonFilter, setShowReasonFilter] = useState(false);
  const [showSiteFilter, setShowSiteFilter] = useState(false);
  const [view, setView] = useState('board');
  const [modal, setModal] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [employeeId, setEmployeeId] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [reason, setReason] = useState('DEMISSION');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [menuId, setMenuId] = useState(null);

  function reload() {
    api.employees(auth.token).then(setEmployees).catch(() => {});
    api.stcHistory(auth.token).then(setHistory).catch(() => {});
    api.sites(auth.token).then(setSites).catch(() => {});
  }

  useEffect(() => {
    reload();
  }, [auth.token]);

  useEffect(() => {
    if (!menuId && !showReasonFilter && !showSiteFilter) return;
    const close = () => {
      setMenuId(null);
      setShowReasonFilter(false);
      setShowSiteFilter(false);
    };
    const t = window.setTimeout(() => document.addEventListener('click', close), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('click', close);
    };
  }, [menuId, showReasonFilter, showSiteFilter]);

  useEffect(() => {
    setResult(null);
    setConfirming(false);
    setError('');
    if (modal !== 'create' || !employeeId || !departureDate || !reason) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    api
      .previewStc(auth.token, { employeeId, departureDate, reason })
      .then(setPreview)
      .catch((e) => {
        setPreview(null);
        setError(e.message);
      })
      .finally(() => setLoadingPreview(false));
  }, [auth.token, employeeId, departureDate, reason, modal]);

  async function downloadPdf(id) {
    const res = await fetch(`/api/stc/${id}/pdf`, { headers: { Authorization: `Bearer ${auth.token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stc_${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      const res = await api.createStc(auth.token, { employeeId, departureDate, reason, notes });
      setResult(res);
      setConfirming(false);
      reload();
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    }
  }

  function openCreate(prefill) {
    setEmployeeId(prefill?.employeeId ? String(prefill.employeeId) : '');
    setDepartureDate(prefill?.departureDate || '');
    setReason(prefill?.reason || 'DEMISSION');
    setNotes('');
    setPreview(null);
    setResult(null);
    setConfirming(false);
    setError('');
    setModal('create');
  }

  useEffect(() => {
    function onAction(e) {
      if (e.detail?.type === ACTION.ADD_DEPARTURE) openCreate();
    }
    window.addEventListener('rh-action', onAction);
    return () => window.removeEventListener('rh-action', onAction);
  }, []);

  const actifs = employees.filter((e) => e.status === 'ACTIF');
  const pipeline = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return actifs
      .map((e) => {
        const c = lastContract(e);
        if (!c || c.type !== 'CDD' || !c.endDate) return null;
        const end = new Date(c.endDate);
        end.setHours(0, 0, 0, 0);
        const days = daysUntil(c.endDate);
        return { employee: e, contract: c, days, overdue: end < now };
      })
      .filter(Boolean);
  }, [actifs]);

  const todo = pipeline.filter((p) => !p.overdue && p.days <= HORIZON_DAYS);
  const overdue = pipeline.filter((p) => p.overdue);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const doing = history.filter((s) => new Date(s.departureDate) >= today);
  const done = history.filter((s) => new Date(s.departureDate) < today);

  const matchQ = (name, matricule) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return `${name} ${matricule}`.toLowerCase().includes(s);
  };

  const matchSite = (site) => !siteFilter || site === siteFilter;

  const filteredHistory = (rows) =>
    rows.filter((s) => {
      if (reasonFilter && s.reason !== reasonFilter) return false;
      if (!matchSite(s.site)) return false;
      return matchQ(s.employeeName, s.matricule);
    });

  const filteredPipeline = (rows) =>
    rows.filter((p) => {
      if (reasonFilter && reasonFilter !== 'FIN_CDD') return false;
      if (!matchSite(p.employee.site?.name)) return false;
      const e = p.employee;
      return matchQ(`${e.firstName} ${e.lastName}`, e.matricule);
    });

  const year = new Date().getFullYear();
  const thisYear = history.filter((s) => new Date(s.departureDate).getFullYear() === year).length;
  const byReason = (r) => history.filter((s) => s.reason === r).length;
  const currency = preview?.currency || result?.currency || 'FCFA';

  const columns = [
    { id: 'todo', title: 'À préparer', icon: ListTodo, tone: 'todo', items: filteredPipeline(todo), kind: 'pipeline' },
    { id: 'overdue', title: 'Échéance dépassée', icon: AlertTriangle, tone: 'overdue', items: filteredPipeline(overdue), kind: 'pipeline' },
    { id: 'doing', title: 'En cours', icon: Clock3, tone: 'doing', items: filteredHistory(doing), kind: 'stc' },
    { id: 'done', title: 'Validés', icon: CheckCircle2, tone: 'done', items: filteredHistory(done), kind: 'stc' },
  ];

  const listRows = columns.flatMap((col) =>
    col.items.map((item) => ({ col, item }))
  );

  return (
    <div className="kb-page">
      <div className="emp-stats">
        <section className="emp-stats-card">
          <h3>Motifs</h3>
          <div className="emp-stages">
            <Stage icon={Flag} color="var(--green)" label="Démission" value={byReason('DEMISSION')} hint="STC enregistrés" />
            <Stage icon={Flag} color="var(--amber)" label="Fin de CDD" value={byReason('FIN_CDD')} hint="Contrats arrivés à terme" />
            <Stage icon={Flag} color="var(--red)" label="Licenciement" value={byReason('LICENCIEMENT')} hint="Ruptures employeur" />
          </div>
        </section>
        <section className="emp-stats-card">
          <h3>Suivi</h3>
          <div className="emp-stages">
            <Stage icon={FileText} color="var(--blue)" label="STC total" value={history.length} hint="Dossiers validés" />
            <Stage icon={CheckCircle2} color="var(--green)" label={`Clôturés ${year}`} value={thisYear} hint="Départs de l’année" />
            <Stage icon={AlertTriangle} color="var(--red)" label="Échéances CDD" value={overdue.length} hint="Contrats déjà expirés" />
          </div>
        </section>
      </div>

      <section className="kb-board-wrap">
        <div className="emp-toolbar kb-toolbar">
          <div className="emp-search">
            <Search size={15} />
            <input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="view-toggle">
            <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label="Vue liste">
              <LayoutList size={15} />
            </button>
            <button type="button" className={view === 'board' ? 'on' : ''} onClick={() => setView('board')} aria-label="Vue Kanban">
              <Columns3 size={15} />
            </button>
          </div>
          <div className="emp-toolbar-actions">
            <div className="filter-wrap" onClick={(e) => e.stopPropagation()}>
              <button type="button" className={`toolbar-btn${reasonFilter ? ' active' : ''}`} onClick={() => { setShowReasonFilter((v) => !v); setShowSiteFilter(false); }}>
                Motif{reasonFilter ? ` · ${reasonOf(reasonFilter)?.label}` : ''}
              </button>
              {showReasonFilter && (
                <div className="filter-pop">
                  <button type="button" className={!reasonFilter ? 'on' : ''} onClick={() => { setReasonFilter(''); setShowReasonFilter(false); }}>Tous les motifs</button>
                  {REASONS.map((r) => (
                    <button key={r.value} type="button" className={reasonFilter === r.value ? 'on' : ''} onClick={() => { setReasonFilter(r.value); setShowReasonFilter(false); }}>
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="filter-wrap" onClick={(e) => e.stopPropagation()}>
              <button type="button" className={`toolbar-btn${siteFilter ? ' active' : ''}`} onClick={() => { setShowSiteFilter((v) => !v); setShowReasonFilter(false); }}>
                <Filter size={14} />
                {siteFilter || 'Filtrer'}
              </button>
              {showSiteFilter && (
                <div className="filter-pop">
                  <button type="button" className={!siteFilter ? 'on' : ''} onClick={() => { setSiteFilter(''); setShowSiteFilter(false); }}>Tous les sites</button>
                  {sites.map((s) => (
                    <button key={s.id} type="button" className={siteFilter === s.name ? 'on' : ''} onClick={() => { setSiteFilter(s.name); setShowSiteFilter(false); }}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="primary-btn emp-add" onClick={() => openCreate()}>
              <Plus size={15} /> Nouveau départ
            </button>
          </div>
        </div>

        {view === 'board' ? (
          <div className="kb-board">
            {columns.map((col) => {
              const Icon = col.icon;
              return (
                <section key={col.id} className="kb-col">
                  <header className="kb-col-head">
                    <span className={`kb-col-pill ${col.tone}`}>
                      <Icon size={14} />
                      {col.title}
                    </span>
                    <em>{col.items.length}</em>
                  </header>
                  <div className="kb-col-body">
                    {col.items.map((item) =>
                      col.kind === 'pipeline' ? (
                        <PipelineCard
                          key={item.employee.id}
                          item={item}
                          menuId={menuId}
                          setMenuId={setMenuId}
                          onCreate={() =>
                            openCreate({
                              employeeId: item.employee.id,
                              departureDate: isoDay(item.contract.endDate),
                              reason: 'FIN_CDD',
                            })
                          }
                        />
                      ) : (
                        <StcCard
                          key={item.id}
                          item={item}
                          menuId={menuId}
                          setMenuId={setMenuId}
                          onView={() => { setViewItem(item); setModal('view'); }}
                          onPdf={() => downloadPdf(item.employeeId)}
                        />
                      )
                    )}
                    {col.items.length === 0 && <p className="kb-empty">Aucune carte</p>}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <table className="table emp-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Étape</th>
                <th>Motif</th>
                <th>Site</th>
                <th>Date</th>
                <th>Détail</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listRows.map(({ col, item }) => {
                const isPipe = col.kind === 'pipeline';
                const e = isPipe ? item.employee : null;
                const name = isPipe ? `${e.firstName} ${e.lastName}` : item.employeeName;
                const matricule = isPipe ? e.matricule : item.matricule;
                const site = isPipe ? e.site?.name : item.site;
                const motif = isPipe ? 'FIN_CDD' : item.reason;
                const date = isPipe ? item.contract.endDate : item.departureDate;
                return (
                  <tr key={isPipe ? `p-${e.id}` : `s-${item.id}`}>
                    <td>
                      <div className="emp-name">{name}</div>
                      <div className="emp-sub">{matricule}</div>
                    </td>
                    <td><span className={`kb-col-pill ${col.tone}`}>{col.title}</span></td>
                    <td><Badge value={motif}>{reasonOf(motif)?.label}</Badge></td>
                    <td>{site || '—'}</td>
                    <td>{fmtDate(date)}</td>
                    <td>
                      {isPipe
                        ? (item.overdue ? `${Math.abs(item.days)} j de retard` : `${item.days} j restants`)
                        : money(item.totalAmount, currency)}
                    </td>
                    <td>
                      <div className="row-actions">
                        {isPipe ? (
                          <button type="button" className="icon-btn" title="Préparer le STC" onClick={() => openCreate({ employeeId: e.id, departureDate: isoDay(item.contract.endDate), reason: 'FIN_CDD' })}>
                            <Plus size={15} />
                          </button>
                        ) : (
                          <>
                            <button type="button" className="icon-btn" title="Voir" onClick={() => { setViewItem(item); setModal('view'); }}>
                              <Eye size={15} />
                            </button>
                            {item.hasPdf && (
                              <button type="button" className="icon-btn" title="PDF" onClick={() => downloadPdf(item.employeeId)}>
                                <Download size={15} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {listRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="kb-empty">Aucun dossier</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      {modal === 'create' && (
        <Modal
          wide
          title={result ? 'Solde de tout compte validé' : 'Nouveau départ'}
          subtitle="Prévisualisation du barème, puis validation"
          onClose={() => setModal(null)}
        >
          {!result && (
            <form className="modal-grid-form" onSubmit={handleSubmit}>
              <label>
                Employé
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                  <option value="">— Sélectionner —</option>
                  {actifs.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName} ({e.matricule})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date de départ
                <input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} required />
              </label>
              <label>
                Motif
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Commentaire
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contexte du départ, pièces, accord… (apparaît sur le PDF)"
                />
              </label>
              {error && <p className="error">{error}</p>}
              {loadingPreview && <p className="loading-text">Calcul du solde…</p>}
              {preview && (
                <div className="stc-mini" style={{ gridColumn: '1 / -1' }}>
                  <p>
                    <Calculator size={14} /> Ancienneté {preview.seniority.years} a {preview.seniority.months} m · Préavis {preview.noticeDays} j
                  </p>
                  <p>Indemnité départ : {money(preview.indemniteDepart, currency)}</p>
                  <p>Congés : {money(preview.indemniteConges, currency)}</p>
                  <p className="stc-total">Total {money(preview.totalAmount, currency)}</p>
                </div>
              )}
              <div className="modal-form-actions">
                <button type="button" className="toolbar-btn" onClick={() => setModal(null)}>Annuler</button>
                <button type="submit" className={confirming ? 'danger-btn' : 'primary-btn'}>
                  {confirming ? 'Confirmer (irréversible)' : 'Valider le départ'}
                </button>
              </div>
            </form>
          )}
          {result && (
            <div>
              <h3><FileCheck2 size={18} /> STC calculé</h3>
              <p>Ancienneté : {result.seniorityYears} a / {result.seniorityMonths} m / {result.seniorityDays} j</p>
              <p>Total : {money(result.totalAmount, currency)}</p>
              {result.notes && <p>Commentaire : {result.notes}</p>}
              <p>Statut : {result.employeeStatus}</p>
              <div className="modal-form-actions">
                <button type="button" className="toolbar-btn" onClick={() => downloadPdf(result.employeeId)}>
                  <Download size={14} /> PDF
                </button>
                <button type="button" className="primary-btn" onClick={() => setModal(null)}>Fermer</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {modal === 'view' && viewItem && (
        <Modal
          title={viewItem.employeeName}
          subtitle={`${viewItem.matricule} · ${reasonOf(viewItem.reason)?.label}`}
          onClose={() => { setModal(null); setViewItem(null); }}
          footer={
            <>
              {viewItem.hasPdf && (
                <button type="button" className="toolbar-btn" onClick={() => downloadPdf(viewItem.employeeId)}>
                  <Download size={14} /> PDF
                </button>
              )}
              <button type="button" className="primary-btn" onClick={() => { setModal(null); setViewItem(null); }}>Fermer</button>
            </>
          }
        >
          <ul className="dossier">
            <li>Date de départ : <strong>{fmtDate(viewItem.departureDate)}</strong></li>
            <li>Site : {viewItem.site || '—'}</li>
            <li>Ancienneté : {viewItem.seniorityYears} a {viewItem.seniorityMonths} m {viewItem.seniorityDays} j</li>
            <li>Indemnité départ : {money(viewItem.indemniteDepart, currency)}</li>
            <li>Indemnité congés : {money(viewItem.indemniteConges, currency)}</li>
            <li>Total : <strong>{money(viewItem.totalAmount, currency)}</strong></li>
            {viewItem.notes && <li>Commentaire : {viewItem.notes}</li>}
          </ul>
        </Modal>
      )}
    </div>
  );
}

function Stage({ icon: Icon, color, label, value, hint }) {
  return (
    <div className="emp-stage">
      <div className="emp-stage-icon" style={{ background: `color-mix(in srgb, ${color} 12%, white)`, color }}>
        <Icon size={16} />
      </div>
      <div>
        <div className="emp-stage-label">{label}</div>
        <div className="emp-stage-value">{value}</div>
        <div className="emp-stage-hint">{hint}</div>
      </div>
    </div>
  );
}

function PipelineCard({ item, onCreate, menuId, setMenuId }) {
  const e = item.employee;
  const open = menuId === `p-${e.id}`;
  return (
    <article className="kb-card">
      <div className="kb-card-top">
        <h4>{e.firstName} {e.lastName}</h4>
        <button type="button" className="icon-btn" onClick={(ev) => { ev.stopPropagation(); setMenuId(open ? null : `p-${e.id}`); }}>
          <MoreVertical size={15} />
        </button>
        {open && (
          <div className="kb-menu" onClick={(ev) => ev.stopPropagation()}>
            <button type="button" onClick={() => { setMenuId(null); onCreate(); }}>Préparer le STC</button>
          </div>
        )}
      </div>
      <dl>
        <div>
          <dt>Priorité</dt>
          <dd className="tone-medium"><Flag size={12} /> Fin de CDD</dd>
        </div>
        <div>
          <dt>Site</dt>
          <dd><Avatar firstName={e.site?.name || 'S'} lastName="" size={18} /> {e.site?.name || '—'}</dd>
        </div>
        <div>
          <dt>Échéance</dt>
          <dd><CalendarDays size={12} /> {fmtDate(item.contract.endDate)}</dd>
        </div>
      </dl>
      <footer>
        <span>{e.matricule} · CDD</span>
        <span>{item.overdue ? `${Math.abs(item.days)} j de retard` : `${item.days} j`}</span>
      </footer>
    </article>
  );
}

function StcCard({ item, onView, onPdf, menuId, setMenuId }) {
  const reason = reasonOf(item.reason);
  const open = menuId === `s-${item.id}`;
  return (
    <article className="kb-card">
      <div className="kb-card-top">
        <h4>{item.employeeName}</h4>
        <button type="button" className="icon-btn" onClick={(ev) => { ev.stopPropagation(); setMenuId(open ? null : `s-${item.id}`); }}>
          <MoreVertical size={15} />
        </button>
        {open && (
          <div className="kb-menu" onClick={(ev) => ev.stopPropagation()}>
            <button type="button" onClick={() => { setMenuId(null); onView(); }}><Eye size={13} /> Voir</button>
            {item.hasPdf && <button type="button" onClick={() => { setMenuId(null); onPdf(); }}><Download size={13} /> PDF</button>}
          </div>
        )}
      </div>
      <dl>
        <div>
          <dt>Motif</dt>
          <dd className={`tone-${reason?.tone || 'low'}`}><Flag size={12} /> {reason?.label}</dd>
        </div>
        <div>
          <dt>Site</dt>
          <dd><Avatar firstName={item.site || 'S'} lastName="" size={18} /> {item.site || '—'}</dd>
        </div>
        <div>
          <dt>Départ</dt>
          <dd><CalendarDays size={12} /> {fmtDate(item.departureDate)}</dd>
        </div>
      </dl>
      <footer>
        <span>{item.matricule}</span>
        <span>{money(item.totalAmount)}</span>
      </footer>
    </article>
  );
}
