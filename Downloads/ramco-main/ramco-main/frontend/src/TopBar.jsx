import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus, Notification, InfoCircle, Logout, Setting, TwoUsers, Filter2, Danger, Paper } from 'react-iconly';
import { useAuth } from './AuthContext';
import { useNav } from './NavContext';
import { api } from './api';
import { ACTION, emitAction } from './appActions';
import Avatar from './Avatar';

const TITLES = {
  '/dashboard': 'Dashboard',
  '/scan': 'Scanner',
  '/employees': 'Employés',
  '/attendance': 'Pointages',
  '/departures': 'Départs',
  '/users': 'Utilisateurs',
  '/audit': 'Journal',
  '/settings': 'Réglages',
};

const HELP = {
  '/dashboard': 'Vue d’ensemble des effectifs et des pointages. Exporter génère un Excel Superamco.',
  '/scan': 'Présentez un badge dans le cadre, ou saisissez le matricule à droite.',
  '/employees': 'Recherchez, filtrez, puis ouvrez une fiche. Le « + » crée un dossier.',
  '/attendance': 'Choisissez une date, consultez le registre, ou importez un Excel de présences.',
  '/departures': 'Kanban des fins de contrat et STC. Un commentaire peut être ajouté au PDF.',
  '/users': 'Créer, modifier ou supprimer un compte. Chaque action demande confirmation.',
  '/audit': 'Historique des actions RH : qui a créé, modifié, importé ou validé une donnée.',
  '/settings': 'Seuil de retard, barèmes STC, congés, sites et e-mails Resend. Enregistrez pour appliquer.',
};

const ROLE_LABEL = {
  RH: 'Gestionnaire RH',
  RH_ASSISTANT: 'Assistant RH',
  MANAGER: 'Manager de site',
};

const RH_ROLES = ['RH', 'RH_ASSISTANT'];

export default function TopBar() {
  const { auth, logout } = useAuth();
  const { setOpen } = useNav();
  const location = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [menu, setMenu] = useState(null);
  const [notes, setNotes] = useState([]);
  const searchRef = useRef(null);
  const barRef = useRef(null);
  const isRh = RH_ROLES.includes(auth.user.role);
  const title = TITLES[location.pathname] || 'SUPERAMCO';
  const shortcut = navigator.platform?.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K';

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        setMenu('search');
      }
      if (e.key === 'Escape') setMenu(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onDoc(e) {
      if (!barRef.current?.contains(e.target)) setMenu(null);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!isRh) return;
    const t = window.setTimeout(() => {
      const s = q.trim();
      if (s.length < 2) {
        setHits([]);
        return;
      }
      api.employees(auth.token, s).then((list) => setHits(list.slice(0, 6))).catch(() => setHits([]));
    }, 220);
    return () => window.clearTimeout(t);
  }, [q, auth.token, isRh]);

  useEffect(() => {
    if (!isRh) return;
    api.dashboard(auth.token).then((d) => {
      const items = [];
      (d.alertesCdd || []).forEach((a) => {
        items.push({
          id: `cdd-${a.employeeId}`,
          icon: Danger,
          text: `${a.name} approche la limite CDD (${a.cumulativeYears} ans)`,
          to: '/employees',
        });
      });
      if (d.congesEnAttente) {
        items.push({
          id: 'leaves',
          icon: Paper,
          text: `${d.congesEnAttente} congé(s) non justifié(s)`,
          to: '/attendance',
        });
      }
      if (d.absent) {
        items.push({
          id: 'absent',
          icon: Paper,
          text: `${d.absent} absent(s) aujourd’hui`,
          to: '/attendance',
        });
      }
      setNotes(items);
    }).catch(() => {});
  }, [auth.token, isRh, location.pathname]);

  function handleSearch(e) {
    e.preventDefault();
    const query = q.trim();
    setMenu(null);
    if (!isRh) return;
    navigate(query ? `/employees?q=${encodeURIComponent(query)}` : '/employees');
  }

  function openHit(emp) {
    setQ('');
    setHits([]);
    setMenu(null);
    navigate(`/employees?q=${encodeURIComponent(emp.matricule)}`);
  }

  function handlePlus() {
    setMenu(null);
    if (!isRh) {
      navigate('/scan');
      return;
    }
    if (location.pathname === '/users') {
      emitAction(ACTION.ADD_USER);
      return;
    }
    if (location.pathname === '/departures') {
      emitAction(ACTION.ADD_DEPARTURE);
      return;
    }
    if (location.pathname === '/employees') {
      emitAction(ACTION.ADD_EMPLOYEE);
      return;
    }
    navigate('/employees', { state: { open: 'add' } });
  }

  function go(to) {
    setMenu(null);
    navigate(to);
  }

  function handleLogout() {
    setMenu(null);
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="topbar" ref={barRef}>
      <button type="button" className="nav-toggle" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
        <Filter2 set="light" primaryColor="currentColor" size={20} />
      </button>
      <div className="topbar-title">{title}</div>

      {isRh && (
        <form className="topbar-search" onSubmit={handleSearch}>
          <Search set="light" primaryColor="currentColor" size={16} />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setMenu('search'); }}
            onFocus={() => setMenu('search')}
            placeholder="Rechercher un employé…"
          />
          <kbd>{shortcut}</kbd>
          {menu === 'search' && hits.length > 0 && (
            <div className="topbar-drop topbar-drop-search">
              {hits.map((e) => (
                <button key={e.id} type="button" onClick={() => openHit(e)}>
                  <Avatar firstName={e.firstName} lastName={e.lastName} size={28} />
                  <span>
                    <strong>{e.firstName} {e.lastName}</strong>
                    <em>{e.matricule} · {e.position}</em>
                  </span>
                </button>
              ))}
              <button type="submit" className="topbar-drop-more">Voir tous les résultats</button>
            </div>
          )}
        </form>
      )}

      <div className="topbar-actions">
        {isRh && (
          <button type="button" className="topbar-icon-btn primary" title="Ajouter" onClick={handlePlus}>
            <Plus set="bold" primaryColor="currentColor" size={18} />
          </button>
        )}
        {isRh && (
          <div className="topbar-pop">
            <button
              type="button"
              className="topbar-icon-btn"
              title="Notifications"
              onClick={() => setMenu(menu === 'bell' ? null : 'bell')}
            >
              <Notification set="light" primaryColor="currentColor" size={18} />
              {notes.length > 0 && <i className="topbar-dot">{notes.length}</i>}
            </button>
            {menu === 'bell' && (
              <div className="topbar-drop">
                <p className="topbar-drop-title">Notifications</p>
                {notes.length === 0 && <p className="topbar-drop-empty">Rien de nouveau pour l’instant.</p>}
                {notes.map((n) => {
                  const Icon = n.icon;
                  return (
                    <button key={n.id} type="button" onClick={() => go(n.to)}>
                      <Icon set="light" primaryColor="currentColor" size={16} />
                      <span>{n.text}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="topbar-pop">
          <button
            type="button"
            className="topbar-icon-btn"
            title="Aide"
            onClick={() => setMenu(menu === 'help' ? null : 'help')}
          >
            <InfoCircle set="light" primaryColor="currentColor" size={18} />
          </button>
          {menu === 'help' && (
            <div className="topbar-drop topbar-drop-help">
              <p className="topbar-drop-title">{title}</p>
              <p>{HELP[location.pathname] || 'Navigation dans le menu de gauche.'}</p>
              <p className="topbar-drop-hint">{shortcut} pour la recherche · Échap pour fermer</p>
            </div>
          )}
        </div>
        <div className="topbar-pop">
          <button type="button" className="topbar-user" onClick={() => setMenu(menu === 'user' ? null : 'user')}>
            <div className="topbar-avatar">{auth.user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>
            <div>
              <div className="topbar-user-name">{auth.user.name}</div>
              <div className="topbar-user-role">{ROLE_LABEL[auth.user.role] || auth.user.role}</div>
            </div>
          </button>
          {menu === 'user' && (
            <div className="topbar-drop topbar-drop-user">
              <p className="topbar-drop-email">{auth.user.email}</p>
              {isRh && (
                <>
                  <button type="button" onClick={() => go('/settings')}><Setting set="light" primaryColor="currentColor" size={16} /> Réglages</button>
                  <button type="button" onClick={() => go('/users')}><TwoUsers set="light" primaryColor="currentColor" size={16} /> Comptes</button>
                </>
              )}
              <button type="button" onClick={handleLogout}><Logout set="light" primaryColor="currentColor" size={16} /> Déconnexion</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
