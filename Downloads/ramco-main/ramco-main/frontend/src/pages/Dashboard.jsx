import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MoreHorizontal,
  ArrowUpRight,
  Pencil,
  Download,
  Plus,
  ScanLine,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Spark from '../Spark';

const SITE_COLORS = ['#E31E2B', '#1A1A1A', '#F0940C', '#1E8A4C', '#2A5FD9'];
const STATUS_COLORS = {
  present: '#1E8A4C',
  late: '#F0940C',
  leave: '#2A5FD9',
  absent: '#E31E2B',
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayShort(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const { auth } = useAuth();
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const firstName = auth.user.name.split(' ')[0];

  useEffect(() => {
    setData(null);
    api.dashboard(auth.token, date).then(setData).catch((e) => setError(e.message));
  }, [auth.token, date]);

  function exportExcel() {
    api.downloadDashboard(auth.token, date).catch((e) => setError(e.message));
  }

  if (error) return <p className="error">{error}</p>;
  if (!data) {
    return (
      <div className="kpi-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 128, flex: 1 }} />
        ))}
      </div>
    );
  }

  const scanned = data.present + data.late;
  const presentPct = data.effectifActif ? Math.round((scanned / data.effectifActif) * 100) : 0;
  const weekTotal = data.week.reduce((n, d) => n + d.total, 0);
  const weekAvg = weekTotal / Math.max(data.week.length, 1);
  const maxWeek = Math.max(...data.week.map((d) => d.total), 1);
  const hotDay = data.week.reduce((best, d) => (d.total >= best.total ? d : best), data.week[0]);
  const statusParts = [
    { key: 'present', label: 'Présents', value: data.present, color: STATUS_COLORS.present },
    { key: 'late', label: 'Retards', value: data.late, color: STATUS_COLORS.late },
    { key: 'leave', label: 'Congés', value: data.onLeave, color: STATUS_COLORS.leave },
    { key: 'absent', label: 'Absents', value: data.absent, color: STATUS_COLORS.absent },
  ];
  const statusTotal = statusParts.reduce((n, p) => n + p.value, 0) || 1;
  const siteTotal = data.presenceParSite.reduce((n, s) => n + s.actifs, 0) || 1;
  const sparkWeek = data.week.map((d) => d.total + 1);

  return (
    <div className="dash-page">
      <div className="dash-hello">
        <h2>Bonjour {firstName}, suivez vos effectifs</h2>
        <p>Activité RH en temps réel · retard après {data.lateThreshold || '08:30'}</p>
      </div>

      <div className="dash-toolbar">
        <div className="dash-tabs">
          <button type="button" className="on">Vue générale</button>
          <Link to="/attendance">Pointages</Link>
          <Link to="/departures">Départs</Link>
        </div>
        <label className="dash-date">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="dash-toolbar-actions">
          <Link to="/settings" className="toolbar-btn"><Pencil size={14} /> Modifier</Link>
          <button type="button" className="toolbar-btn" onClick={exportExcel}>
            <Download size={14} /> Exporter
          </button>
          <Link to="/scan" className="primary-btn"><Plus size={15} /> Scanner</Link>
        </div>
      </div>

      <div className="kpi-row">
        <Kpi title="Effectif actif" value={data.effectifActif} hint="Collaborateurs en poste" spark={data.presenceParSite.map((s) => s.actifs)} />
        <Kpi title="Présents" value={data.present} hint={`${scanned} pointage(s) du jour`} spark={data.week.map((d) => d.present + 1)} up />
        <Kpi title="Retards" value={data.late} hint={`Seuil ${data.lateThreshold}`} spark={data.week.map((d) => d.late + 1)} />
        <Kpi title="Absents" value={data.absent} hint={`${data.onLeave} en congé`} spark={sparkWeek} />
      </div>

      <div className="dash-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <h3>Pointages de la semaine</h3>
              <p>Total {weekTotal} badgeages · moyenne {Math.round(weekAvg)} / jour</p>
            </div>
            <span className="panel-chip">{dayShort(data.week[0]?.date)} – {dayShort(data.week[6]?.date)}</span>
          </div>
          <div className="bar-chart">
            <div className="bar-avg" style={{ bottom: `${12 + (weekAvg / maxWeek) * 148}px` }}>
              <em>Moy.</em>
            </div>
            {data.week.map((d) => {
              const hot = d.date === hotDay.date;
              return (
                <div key={d.date} className="bar-col">
                  {hot && d.total > 0 && <div className="bar-tip">{d.total} pointages</div>}
                  <div className="bar-track">
                    <div
                      className={`bar${hot ? ' bar-hot' : ''}`}
                      style={{ height: `${Math.max(8, (d.total / maxWeek) * 100)}%` }}
                      title={`${dayShort(d.date)} : ${d.total}`}
                    />
                  </div>
                  <span>{dayShort(d.date)}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h3>Pointage du jour</h3>
              <p>{scanned}/{data.effectifActif} employés badgeés</p>
            </div>
          </div>
          <div className="stage-bar">
            <span style={{ width: `${presentPct}%` }} className="stage-ok" />
            <span style={{ width: `${100 - presentPct}%` }} className="stage-off" />
          </div>
          <div className="stage-legend">
            <span><i className="dot red" /> Présents {presentPct}%</span>
            <span><i className="dot gray" /> Hors site {100 - presentPct}%</span>
          </div>
          <div className="cta-box">
            <ScanLine size={18} />
            <div>
              <strong>Compléter le registre</strong>
              <p>{data.absent} absent(s) encore sans badgeage.</p>
            </div>
            <Link to="/scan" className="ghost-btn">Ouvrir le scan</Link>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h3>Répartition du jour</h3>
              <p>Total {data.effectifActif} collaborateurs</p>
            </div>
          </div>
          <div className="stack-bar">
            {statusParts.map((p) => (
              <span
                key={p.key}
                style={{ width: `${(p.value / statusTotal) * 100}%`, background: p.color }}
                title={`${p.label} : ${p.value}`}
              />
            ))}
          </div>
          <ul className="stack-legend">
            {statusParts.map((p) => (
              <li key={p.key}>
                <i className="dot" style={{ background: p.color }} />
                <span>{p.label}</span>
                <b>{p.value}</b>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <h3>Effectif par site</h3>
              <p>{data.presenceParSite.length} agence(s) · {data.contracts.cdd} CDD / {data.contracts.cdi} CDI</p>
            </div>
          </div>
          <div className="gauge-row">
            <SemiGauge segments={data.presenceParSite.map((s, i) => ({ value: s.actifs, color: SITE_COLORS[i % SITE_COLORS.length] }))} total={siteTotal} label="actifs" />
            <ul className="legend-list">
              {data.presenceParSite.map((s, i) => (
                <li key={s.site}>
                  <i className="dot" style={{ background: SITE_COLORS[i % SITE_COLORS.length] }} />
                  <span>{s.site}</span>
                  <b>{s.actifs}</b>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </div>
    </div>
  );
}

function Kpi({ title, value, hint, spark, up }) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span>{title}</span>
        <MoreHorizontal size={16} />
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-foot">
        <span className={up ? 'trend-up' : 'muted'}>
          {up && <ArrowUpRight size={12} />}
          {hint}
        </span>
        <Spark values={spark} />
      </div>
    </article>
  );
}

function SemiGauge({ segments, total, label }) {
  const safeTotal = total || 1;
  let acc = 0;
  const stops = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const start = acc;
      acc += (s.value / safeTotal) * 180;
      return `${s.color} ${start}deg ${acc}deg`;
    })
    .join(', ');
  const paint = stops ? `${stops}, ` : '';
  return (
    <div className="gauge">
      <div
        className="gauge-disk"
        style={{ background: `conic-gradient(from 270deg, ${paint}var(--border) ${acc}deg 180deg, transparent 180deg 360deg)` }}
      >
        <div className="gauge-hole" />
      </div>
      <div className="gauge-caption">
        <strong>{total}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
