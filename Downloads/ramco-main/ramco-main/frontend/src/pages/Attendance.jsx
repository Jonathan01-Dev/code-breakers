import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, ChevronRight, FileSpreadsheet, Download, Upload } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Avatar from '../Avatar';
import Badge from '../Badge';
import Modal from '../Modal';
import Spark from '../Spark';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

export default function Attendance() {
  const { auth } = useAuth();
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState(null);
  const [statusTab, setStatusTab] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  function reload() {
    api.attendanceOverview(auth.token, date).then(setData).catch((e) => setError(e.message));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, date]);

  async function handleImport(e) {
    e.preventDefault();
    if (!importFile) return;
    setImportError('');
    setImportResult(null);
    setImporting(true);
    try {
      const res = await api.importAttendance(auth.token, importFile);
      setImportResult(res);
      reload();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  const scans = (data?.scans || []).filter((s) => !statusTab || s.status === statusTab);
  const weekPresent = data?.week?.map((d) => d.present || 1) || [1, 2, 1, 3, 2, 2, 3];
  const weekLate = data?.week?.map((d) => d.late + 1) || [1, 1, 2, 1, 1, 2, 1];

  return (
    <div className="att-page">
      <div className="att-hello">
        <div>
          <h2>Suivi des pointages</h2>
          <p>Registre du {new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="att-hello-actions">
          <button type="button" className="toolbar-btn" onClick={() => { setImportOpen(true); setImportFile(null); setImportResult(null); setImportError(''); }}>
            <FileSpreadsheet size={15} />
            Import Excel
          </button>
          <label className="att-date">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {!data && !error && (
        <div className="kpi-row">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 128 }} />)}
        </div>
      )}

      {data && (
        <>
          <div className="kpi-row">
            <Kpi title="Présents" value={data.present} hint={`sur ${data.effectif} actifs`} spark={weekPresent} />
            <Kpi title="Retards" value={data.late} hint="Arrivées après le seuil" spark={weekLate} />
            <Kpi title="En congé" value={data.onLeave} hint="Absences du jour" spark={data.week.map((d) => d.total + 1)} />
            <Kpi title="Absents" value={data.absent} hint="Non pointés, hors congé" spark={data.week.map((d) => Math.max(1, data.effectif - d.total))} />
          </div>

          <div className="att-grid">
            <section className="panel att-sites">
              <div className="panel-head">
                <div>
                  <h3>Présence par site</h3>
                  <p>Taux de pointage du jour</p>
                </div>
              </div>
              <div className="scroll-pane">
                <ul className="att-progress">
                  {data.bySite.map((s) => (
                    <li key={s.site}>
                      <Avatar firstName={s.site} lastName="" size={28} />
                      <div className="att-progress-body">
                        <div className="att-progress-top">
                          <strong>{s.site}</strong>
                          <span>{s.rate}%</span>
                        </div>
                        <div className="att-bar"><span style={{ width: `${s.rate}%` }} /></div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="panel att-leaves">
              <div className="panel-head">
                <div>
                  <h3>Congés du jour</h3>
                  <p>{data.leaves.length} absence(s)</p>
                </div>
              </div>
              <div className="scroll-pane">
                <ul className="att-latest">
                  {data.leaves.map((l) => (
                    <li key={l.id}>
                      <Avatar firstName={l.name.split(' ')[0]} lastName={l.name.split(' ')[1] || ''} size={32} />
                      <div>
                        <strong>{l.name}</strong>
                        <p>{l.type} · jusqu’au {new Date(l.endDate).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <Badge value={l.justified ? 'ACTIF' : 'RETARD'}>{l.justified ? 'Justifiée' : 'En attente'}</Badge>
                    </li>
                  ))}
                  {data.leaves.length === 0 && <li className="empty-soft">Personne en congé aujourd’hui.</li>}
                </ul>
              </div>
            </section>

            <section className="panel att-log">
              <div className="panel-head">
                <div>
                  <h3>Registre du jour</h3>
                  <p>{scans.length} pointage(s)</p>
                </div>
                <Link to="/scan" className="panel-link">Scanner <ChevronRight size={14} /></Link>
              </div>
              <div className="emp-tabs att-tabs">
                {[
                  { id: '', label: 'Tous' },
                  { id: 'PRESENT', label: 'Présents' },
                  { id: 'RETARD', label: 'Retards' },
                ].map((t) => (
                  <button key={t.id || 'all'} type="button" className={statusTab === t.id ? 'on' : ''} onClick={() => setStatusTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="scroll-pane att-log-pane">
                <table className="table emp-table">
                  <thead>
                    <tr>
                      <th>Employé</th>
                      <th>Heure</th>
                      <th>Assigné / Site</th>
                      <th>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="table-row-main">
                            <Avatar firstName={r.employeeName.split(' ')[0]} lastName={r.employeeName.split(' ')[1] || ''} size={30} />
                            <div>
                              <div className="emp-name">{r.employeeName}</div>
                              <div className="emp-sub">{r.matricule}</div>
                            </div>
                          </div>
                        </td>
                        <td>{new Date(r.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>
                          <div className="table-row-main">
                            <Avatar firstName={r.site} lastName="" size={24} />
                            {r.site}
                          </div>
                        </td>
                        <td><Badge value={r.status} /></td>
                        <td>
                          <button type="button" className="icon-btn" title="Voir" onClick={() => setSelected(r)}>
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {scans.length === 0 && (
                      <tr><td colSpan={5} className="empty-cell">Aucun pointage pour cette date.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel att-arrivals">
              <div className="panel-head">
                <div>
                  <h3>Arrivées</h3>
                  <p>Chronologie des scans</p>
                </div>
              </div>
              <div className="att-timeline">
                <div className="att-dateblock">
                  <span>{dayLabel(date).split(' ')[0]}</span>
                  <strong>{new Date(`${date}T12:00:00`).getDate()}</strong>
                </div>
                <div className="scroll-pane att-arrivals-pane">
                  <ul>
                    {data.scans.map((r) => (
                      <li key={r.id} className={`att-slot ${r.status === 'RETARD' ? 'late' : 'ok'}`}>
                        <div className="att-slot-time">
                          {new Date(r.time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="att-slot-card" onClick={() => setSelected(r)}>
                          <Avatar firstName={r.employeeName.split(' ')[0]} lastName={r.employeeName.split(' ')[1] || ''} size={28} />
                          <div>
                            <strong>{r.employeeName}</strong>
                            <p>{r.site} · {r.method === 'MANUEL' ? 'Manuel' : 'QR'}</p>
                          </div>
                          <Badge value={r.status} />
                        </div>
                      </li>
                    ))}
                    {data.scans.length === 0 && <li className="empty-soft">Pas encore d’arrivée.</li>}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {importOpen && (
        <Modal title="Importer des présences" subtitle="Option 2 du CDC — suivi Excel des sites" onClose={() => setImportOpen(false)}>
          <form className="modal-grid-form" onSubmit={handleImport}>
            <p className="settings-hint" style={{ gridColumn: '1 / -1' }}>
              Téléchargez le modèle (Matricule, Date, Heure, Site). L’assistant RH y reporte le suivi quotidien. Un employé déjà pointé ce jour-là est ignoré.
            </p>
            <button type="button" className="link-btn" onClick={() => api.downloadAttendanceTemplate(auth.token)}>
              <Download size={14} /> Télécharger le modèle
            </button>
            <label>
              Fichier (.xlsx)
              <input type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files[0])} required />
            </label>
            {importError && <p className="error">{importError}</p>}
            {importResult && (
              <p className="import-summary">
                {importResult.success} importé(s)
                {importResult.skipped ? `, ${importResult.skipped} déjà présents` : ''}
                {importResult.errors?.length ? `, ${importResult.errors.length} ligne(s) en erreur` : ''}
              </p>
            )}
            {importResult?.errors?.length > 0 && (
              <ul className="import-errors">
                {importResult.errors.slice(0, 12).map((err) => (
                  <li key={`${err.row}-${err.message}`}>Ligne {err.row} : {err.message}</li>
                ))}
              </ul>
            )}
            <div className="modal-form-actions">
              <button type="button" className="toolbar-btn" onClick={() => setImportOpen(false)}>Fermer</button>
              <button type="submit" className="primary-btn" disabled={importing || !importFile}>
                <Upload size={15} /> {importing ? 'Import…' : 'Importer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal
          title={selected.employeeName}
          subtitle={`${selected.matricule} · ${selected.site}`}
          onClose={() => setSelected(null)}
          footer={<button type="button" className="primary-btn" onClick={() => setSelected(null)}>Fermer</button>}
        >
          <ul className="dossier">
            <li>Heure : <strong>{new Date(selected.time).toLocaleString('fr-FR')}</strong></li>
            <li>Statut : <Badge value={selected.status} /></li>
            <li>Méthode : {selected.method === 'MANUEL' ? 'Saisie manuelle' : 'QR Code'}</li>
            <li>Scanné par : {selected.scannedBy || '—'}</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ title, value, hint, spark }) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span>{title}</span>
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-foot">
        <span className="muted">{hint}</span>
        <Spark values={spark} />
      </div>
    </article>
  );
}
