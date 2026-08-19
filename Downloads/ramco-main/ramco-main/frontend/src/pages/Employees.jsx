import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import {
  Search,
  IdCard,
  UserPlus,
  FileSpreadsheet,
  Download,
  Upload,
  Filter,
  LayoutList,
  LayoutGrid,
  Eye,
  Pencil,
  MoreHorizontal,
  Users,
  FileSignature,
  Briefcase,
  DoorOpen,
  Landmark,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Avatar from '../Avatar';
import Badge from '../Badge';
import Modal from '../Modal';
import { ACTION } from '../appActions';

const emptyEmployeeForm = {
  matricule: '',
  firstName: '',
  lastName: '',
  position: '',
  siteId: '',
  hireDate: '',
  contractType: 'CDI',
  salary: '',
  endDate: '',
};

function lastContract(emp) {
  return emp.contracts?.[0] || null;
}

function seniorityLabel(hireDate) {
  if (!hireDate) return '—';
  const start = new Date(hireDate);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return 'Nouveau';
  if (years === 0) return `${months} mois`;
  return months ? `${years} an(s) ${months} mois` : `${years} an(s)`;
}

export default function Employees() {
  const { auth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [list, setList] = useState([]);
  const [sites, setSites] = useState([]);
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [siteFilter, setSiteFilter] = useState('');
  const [showSiteFilter, setShowSiteFilter] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);
  const [addError, setAddError] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const [contractForm, setContractForm] = useState({ type: 'CDI', startDate: '', endDate: '', salary: '' });
  const [absenceForm, setAbsenceForm] = useState({ startDate: '', endDate: '', type: 'Congé annuel', justified: true });
  const [leaveForm, setLeaveForm] = useState({ year: new Date().getFullYear(), totalDays: 30, usedDays: 0 });
  const [careerForm, setCareerForm] = useState({ date: '', fromPosition: '', toPosition: '', fromSite: '', toSite: '' });
  const [detailActionError, setDetailActionError] = useState('');
  const [statusTab, setStatusTab] = useState('ALL');

  function reloadList() {
    api.employees(auth.token, q).then(setList).catch((e) => setError(e.message));
  }

  useEffect(() => {
    reloadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, q]);

  useEffect(() => {
    const fromUrl = searchParams.get('q');
    if (fromUrl != null && fromUrl !== q) setQ(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (location.state?.open === 'add') {
      setEmployeeForm(emptyEmployeeForm);
      setModal('add');
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  useEffect(() => {
    function onAction(e) {
      if (e.detail?.type === ACTION.ADD_EMPLOYEE) {
        setEmployeeForm(emptyEmployeeForm);
        setAddError('');
        setModal('add');
      }
    }
    window.addEventListener('rh-action', onAction);
    return () => window.removeEventListener('rh-action', onAction);
  }, []);

  useEffect(() => {
    api.sites(auth.token).then(setSites).catch(() => {});
  }, [auth.token]);

  useEffect(() => {
    if (!selectedId || (modal !== 'view' && modal !== 'edit')) return;
    setQr(null);
    api.employee(auth.token, selectedId).then(setDetail).catch((e) => setError(e.message));
  }, [auth.token, selectedId, modal]);

  function openView(id) {
    setSelectedId(id);
    setDetail(null);
    setQr(null);
    setModal('view');
  }

  function openEdit(id) {
    setSelectedId(id);
    setDetail(null);
    setDetailActionError('');
    setModal('edit');
  }

  function closeModal() {
    setModal(null);
    setAddError('');
    setImportError('');
    setImportResult(null);
    setDetailActionError('');
  }

  async function reloadDetail() {
    if (!selectedId) return;
    setDetail(await api.employee(auth.token, selectedId));
    reloadList();
  }

  async function handleAddContract(e) {
    e.preventDefault();
    setDetailActionError('');
    try {
      await api.addContract(auth.token, selectedId, contractForm);
      setContractForm({ type: 'CDI', startDate: '', endDate: '', salary: '' });
      await reloadDetail();
    } catch (err) {
      setDetailActionError(err.message);
    }
  }

  async function handleAddAbsence(e) {
    e.preventDefault();
    setDetailActionError('');
    try {
      await api.addAbsence(auth.token, selectedId, absenceForm);
      setAbsenceForm({ startDate: '', endDate: '', type: 'Congé annuel', justified: true });
      await reloadDetail();
    } catch (err) {
      setDetailActionError(err.message);
    }
  }

  async function handleLeave(e) {
    e.preventDefault();
    setDetailActionError('');
    try {
      await api.updateLeaveBalance(auth.token, selectedId, leaveForm);
      await reloadDetail();
    } catch (err) {
      setDetailActionError(err.message);
    }
  }

  async function handleCareer(e) {
    e.preventDefault();
    setDetailActionError('');
    try {
      await api.addCareerMove(auth.token, selectedId, careerForm);
      setCareerForm({ date: '', fromPosition: '', toPosition: '', fromSite: '', toSite: '' });
      await reloadDetail();
    } catch (err) {
      setDetailActionError(err.message);
    }
  }

  async function showQr() {
    const res = await api.employeeQr(auth.token, selectedId);
    setQr(res.qrDataUrl);
  }

  async function handleAddEmployee(e) {
    e.preventDefault();
    setAddError('');
    try {
      await api.createEmployee(auth.token, employeeForm);
      setEmployeeForm(emptyEmployeeForm);
      reloadList();
      closeModal();
    } catch (err) {
      setAddError(err.message);
    }
  }

  async function handleImport(e) {
    e.preventDefault();
    if (!importFile) return;
    setImportError('');
    setImportResult(null);
    setImporting(true);
    try {
      const res = await api.importEmployees(auth.token, importFile);
      setImportResult(res);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      reloadList();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  const filtered = list.filter((e) => {
    if (statusTab === 'CDD' || statusTab === 'CDI') return lastContract(e)?.type === statusTab;
    if (statusTab !== 'ALL' && e.status !== statusTab) return false;
    if (siteFilter && e.site?.name !== siteFilter) return false;
    return true;
  });

  const actifs = list.filter((e) => e.status === 'ACTIF').length;
  const cdd = list.filter((e) => e.status === 'ACTIF' && lastContract(e)?.type === 'CDD').length;
  const cdi = list.filter((e) => e.status === 'ACTIF' && lastContract(e)?.type === 'CDI').length;
  const partis = list.filter((e) => e.status === 'QUITTE').length;
  const retraites = list.filter((e) => e.status === 'RETRAITE').length;

  return (
    <div className="emp-page">
      <div className="emp-stats">
        <section className="emp-stats-card">
          <h3>Situation des effectifs</h3>
          <div className="emp-stages">
            <Stage icon={Users} color="#E31E2B" label="Actifs" value={actifs} hint="Collaborateurs en poste" />
            <Stage icon={FileSignature} color="#F0940C" label="CDD" value={cdd} hint="Contrats à durée déterminée" />
            <Stage icon={Briefcase} color="#2A5FD9" label="CDI" value={cdi} hint="Contrats à durée indéterminée" />
            <Stage icon={Landmark} color="#1A1A1A" label="Sites" value={sites.length} hint="Agences rattachées" />
          </div>
        </section>
        <section className="emp-stats-card">
          <h3>Sorties</h3>
          <div className="emp-stages">
            <Stage icon={DoorOpen} color="#8A8B92" label="Partis" value={partis} hint={`${list.length ? Math.round((partis / list.length) * 100) : 0}% de l’effectif`} />
            <Stage icon={Users} color="#2A5FD9" label="Retraités" value={retraites} hint={`${list.length ? Math.round((retraites / list.length) * 100) : 0}% de l’effectif`} />
          </div>
        </section>
      </div>

      <section className="emp-table-card">
        <div className="emp-toolbar">
          <div className="emp-search">
            <Search size={15} />
            <input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="view-toggle" aria-hidden>
            <button type="button" className="on"><LayoutList size={15} /></button>
            <button type="button"><LayoutGrid size={15} /></button>
          </div>
          <div className="emp-tabs">
            {[
              { id: 'ALL', label: 'Tous' },
              { id: 'ACTIF', label: 'Actifs' },
              { id: 'CDD', label: 'CDD' },
              { id: 'CDI', label: 'CDI' },
              { id: 'QUITTE', label: 'Partis' },
              { id: 'RETRAITE', label: 'Retraités' },
            ].map((t) => (
              <button key={t.id} type="button" className={statusTab === t.id ? 'on' : ''} onClick={() => setStatusTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="emp-toolbar-actions">
            <div className="filter-wrap">
              <button type="button" className="toolbar-btn" onClick={() => setShowSiteFilter((v) => !v)}>
                <Filter size={14} />
                Filtrer
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
            <button type="button" className="toolbar-btn" onClick={() => setModal('import')}>
              <FileSpreadsheet size={14} />
              Importer
            </button>
            <button type="button" className="primary-btn emp-add" onClick={() => setModal('add')}>
              <UserPlus size={15} />
              Ajouter un employé
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <table className="table emp-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nom</th>
              <th>Poste</th>
              <th>Site</th>
              <th>Contrat</th>
              <th>Ancienneté</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const c = lastContract(e);
              return (
                <tr key={e.id}>
                  <td className="emp-id">#{e.matricule}</td>
                  <td>
                    <div className="table-row-main">
                      <Avatar firstName={e.firstName} lastName={e.lastName} size={32} />
                      <div>
                        <div className="emp-name">{e.firstName} {e.lastName}</div>
                        <div className="emp-sub">{e.matricule}</div>
                      </div>
                    </div>
                  </td>
                  <td>{e.position || '—'}</td>
                  <td>{e.site?.name}</td>
                  <td>{c ? <Badge value={c.type} /> : '—'}</td>
                  <td>{seniorityLabel(e.hireDate)}</td>
                  <td><Badge value={e.status} /></td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-btn" title="Voir le dossier" onClick={() => openView(e.id)}>
                        <Eye size={15} />
                      </button>
                      <button type="button" className="icon-btn" title="Modifier" onClick={() => openEdit(e.id)}>
                        <Pencil size={15} />
                      </button>
                      <button type="button" className="icon-btn" title="Plus" onClick={() => openView(e.id)}>
                        <MoreHorizontal size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-cell">Aucun employé pour ces filtres.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {modal === 'add' && (
        <Modal title="Ajouter un employé" subtitle="Nouveau dossier RH" onClose={closeModal}>
          <form className="modal-grid-form" onSubmit={handleAddEmployee}>
            <label>Matricule<input value={employeeForm.matricule} onChange={(e) => setEmployeeForm({ ...employeeForm, matricule: e.target.value })} required /></label>
            <label>Prénom<input value={employeeForm.firstName} onChange={(e) => setEmployeeForm({ ...employeeForm, firstName: e.target.value })} required /></label>
            <label>Nom<input value={employeeForm.lastName} onChange={(e) => setEmployeeForm({ ...employeeForm, lastName: e.target.value })} required /></label>
            <label>Poste<input value={employeeForm.position} onChange={(e) => setEmployeeForm({ ...employeeForm, position: e.target.value })} /></label>
            <label>
              Site
              <select value={employeeForm.siteId} onChange={(e) => setEmployeeForm({ ...employeeForm, siteId: e.target.value })} required>
                <option value="">— Sélectionner —</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>Date d’embauche<input type="date" value={employeeForm.hireDate} onChange={(e) => setEmployeeForm({ ...employeeForm, hireDate: e.target.value })} required /></label>
            <label>
              Type de contrat
              <select value={employeeForm.contractType} onChange={(e) => setEmployeeForm({ ...employeeForm, contractType: e.target.value })}>
                <option value="CDI">CDI</option>
                <option value="CDD">CDD</option>
              </select>
            </label>
            <label>Salaire<input type="number" min={0} value={employeeForm.salary} onChange={(e) => setEmployeeForm({ ...employeeForm, salary: e.target.value })} /></label>
            {employeeForm.contractType === 'CDD' && (
              <label>Date de fin CDD<input type="date" value={employeeForm.endDate} onChange={(e) => setEmployeeForm({ ...employeeForm, endDate: e.target.value })} /></label>
            )}
            {addError && <p className="error">{addError}</p>}
            <div className="modal-form-actions">
              <button type="button" className="toolbar-btn" onClick={closeModal}>Annuler</button>
              <button type="submit" className="primary-btn"><UserPlus size={15} /> Créer le dossier</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'import' && (
        <Modal title="Importer depuis Excel" subtitle="Ajout en masse" onClose={closeModal}>
          <form className="modal-grid-form" onSubmit={handleImport}>
            <p className="settings-hint" style={{ gridColumn: '1 / -1' }}>
              Téléchargez le modèle Superamco (bandeau, couleurs, feuille Guide). Remplacez les deux lignes d’exemple à partir de la ligne 6.
            </p>
            <button type="button" className="link-btn" onClick={() => api.downloadImportTemplate(auth.token)}>
              <Download size={14} /> Télécharger le modèle
            </button>
            <label>
              Fichier (.xlsx)
              <input ref={fileInputRef} type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files[0])} required />
            </label>
            {importError && <p className="error">{importError}</p>}
            {importResult && (
              <p className="import-summary">
                {importResult.success} importé(s)
                {importResult.errors?.length ? `, ${importResult.errors.length} erreur(s)` : ''}
              </p>
            )}
            <div className="modal-form-actions">
              <button type="button" className="toolbar-btn" onClick={closeModal}>Fermer</button>
              <button type="submit" className="primary-btn" disabled={importing || !importFile}>
                <Upload size={15} /> {importing ? 'Import…' : 'Importer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'view' && (
        <Modal
          wide
          title={detail ? `${detail.firstName} ${detail.lastName}` : 'Dossier'}
          subtitle={detail ? `${detail.position} · ${detail.matricule}` : 'Chargement…'}
          onClose={closeModal}
          footer={
            detail && (
              <>
                <button type="button" className="toolbar-btn" onClick={() => openEdit(detail.id)}>
                  <Pencil size={14} /> Modifier
                </button>
                <button type="button" className="primary-btn" onClick={closeModal}>Fermer</button>
              </>
            )
          }
        >
          {!detail && <p className="loading-text">Chargement du dossier…</p>}
          {detail && (
            <div className="dossier">
              <div className="dossier-hero">
                <Avatar firstName={detail.firstName} lastName={detail.lastName} size={56} />
                <div>
                  <Badge value={detail.status} />
                  <p>{detail.site.name} · embauché le {new Date(detail.hireDate).toLocaleDateString('fr-FR')}</p>
                </div>
                <button type="button" className="toolbar-btn" onClick={showQr}>
                  <IdCard size={14} /> Badge QR
                </button>
              </div>
              {qr && <div className="qr-card"><img src={qr} alt="QR badge" /></div>}
              <h4>Contrats</h4>
              <ul>
                {detail.contracts.map((c) => (
                  <li key={c.id}>
                    <Badge value={c.type} /> {new Date(c.startDate).toLocaleDateString('fr-FR')} → {c.endDate ? new Date(c.endDate).toLocaleDateString('fr-FR') : 'en cours'} — {Number(c.salary).toLocaleString('fr-FR')}
                  </li>
                ))}
                {detail.contracts.length === 0 && <li>Aucun contrat</li>}
              </ul>
              <h4>Carrière</h4>
              <ul>
                {detail.careerMoves.map((m) => (
                  <li key={m.id}>{new Date(m.date).toLocaleDateString('fr-FR')} : {m.fromPosition} → {m.toPosition}</li>
                ))}
                {detail.careerMoves.length === 0 && <li>Aucune mutation</li>}
              </ul>
              <h4>Congés & absences</h4>
              <ul>
                {detail.leaveBalances.map((b) => (
                  <li key={b.id}>{b.year} : {b.totalDays - b.usedDays} j restants / {b.totalDays}</li>
                ))}
                {detail.absences.map((a) => (
                  <li key={a.id}>
                    {a.type} — {new Date(a.startDate).toLocaleDateString('fr-FR')} → {new Date(a.endDate).toLocaleDateString('fr-FR')}{' '}
                    <Badge value={a.justified ? 'ACTIF' : 'RETARD'}>{a.justified ? 'Justifiée' : 'Non justifiée'}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Modal>
      )}

      {modal === 'edit' && (
        <Modal
          wide
          title={detail ? `Modifier · ${detail.firstName} ${detail.lastName}` : 'Modifier'}
          subtitle="Contrats, congés, absences, mutations"
          onClose={closeModal}
        >
          {!detail && <p className="loading-text">Chargement…</p>}
          {detail && (
            <>
              {detailActionError && <p className="error">{detailActionError}</p>}
              <form className="mini-form" onSubmit={handleAddContract}>
                <span className="mini-form-title">Nouveau contrat</span>
                <select value={contractForm.type} onChange={(e) => setContractForm({ ...contractForm, type: e.target.value })}>
                  <option value="CDI">CDI</option>
                  <option value="CDD">CDD</option>
                </select>
                <input type="date" required value={contractForm.startDate} onChange={(e) => setContractForm({ ...contractForm, startDate: e.target.value })} />
                {contractForm.type === 'CDD' && (
                  <input type="date" value={contractForm.endDate} onChange={(e) => setContractForm({ ...contractForm, endDate: e.target.value })} />
                )}
                <input type="number" min={0} required placeholder="Salaire" value={contractForm.salary} onChange={(e) => setContractForm({ ...contractForm, salary: e.target.value })} />
                <button type="submit">Ajouter</button>
              </form>
              <form className="mini-form" onSubmit={handleLeave}>
                <span className="mini-form-title">Solde de congés</span>
                <input type="number" required placeholder="Année" value={leaveForm.year} onChange={(e) => setLeaveForm({ ...leaveForm, year: Number(e.target.value) })} />
                <input type="number" min={0} step={0.5} required placeholder="Total jours" value={leaveForm.totalDays} onChange={(e) => setLeaveForm({ ...leaveForm, totalDays: e.target.value })} />
                <input type="number" min={0} step={0.5} placeholder="Jours pris" value={leaveForm.usedDays} onChange={(e) => setLeaveForm({ ...leaveForm, usedDays: e.target.value })} />
                <button type="submit">Enregistrer</button>
              </form>
              <form className="mini-form" onSubmit={handleAddAbsence}>
                <span className="mini-form-title">Absence / congé</span>
                <input placeholder="Type" value={absenceForm.type} onChange={(e) => setAbsenceForm({ ...absenceForm, type: e.target.value })} required />
                <input type="date" required value={absenceForm.startDate} onChange={(e) => setAbsenceForm({ ...absenceForm, startDate: e.target.value })} />
                <input type="date" required value={absenceForm.endDate} onChange={(e) => setAbsenceForm({ ...absenceForm, endDate: e.target.value })} />
                <label className="mini-check">
                  <input type="checkbox" checked={absenceForm.justified} onChange={(e) => setAbsenceForm({ ...absenceForm, justified: e.target.checked })} />
                  Justifiée
                </label>
                <button type="submit">Ajouter</button>
              </form>
              <form className="mini-form" onSubmit={handleCareer}>
                <span className="mini-form-title">Mutation</span>
                <input type="date" required value={careerForm.date} onChange={(e) => setCareerForm({ ...careerForm, date: e.target.value })} />
                <input placeholder="De (poste)" value={careerForm.fromPosition} onChange={(e) => setCareerForm({ ...careerForm, fromPosition: e.target.value })} />
                <input placeholder="Vers (poste)" value={careerForm.toPosition} onChange={(e) => setCareerForm({ ...careerForm, toPosition: e.target.value })} required />
                <button type="submit">Historiser</button>
              </form>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function Stage({ icon: Icon, color, label, value, hint }) {
  return (
    <div className="emp-stage">
      <div className="emp-stage-icon" style={{ background: `${color}18`, color }}>
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
