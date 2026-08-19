import { NavLink, useLocation } from 'react-router-dom';
import {
  Category, Scan, People, Calendar, TicketStar, Setting, TwoUsers, Paper, Logout,
} from 'react-iconly';
import { useAuth } from './AuthContext';
import { useNav } from './NavContext';
import Logo from './Logo';

const RH_ROLES = ['RH', 'RH_ASSISTANT'];

const RH_LINKS = [
  { to: '/dashboard', label: 'Tableau de bord', icon: Category, group: 'Pilotage' },
  { to: '/scan', label: 'Scanner', icon: Scan, group: 'Pilotage' },
  { to: '/employees', label: 'Employés', icon: People, group: 'RH' },
  { to: '/attendance', label: 'Pointages', icon: Calendar, group: 'RH' },
  { to: '/departures', label: 'Départs', icon: TicketStar, group: 'RH' },
  { to: '/users', label: 'Utilisateurs', icon: TwoUsers, group: 'Admin' },
  { to: '/audit', label: 'Journal', icon: Paper, group: 'Admin' },
  { to: '/settings', label: 'Réglages', icon: Setting, group: 'Admin' },
];

const MANAGER_LINKS = [{ to: '/scan', label: 'Scanner', icon: Scan, group: 'Pilotage' }];

function NavIcon({ icon: Icon, active }) {
  return (
    <Icon
      set={active ? 'bold' : 'light'}
      primaryColor="currentColor"
      stroke={active ? 'bold' : 'regular'}
      size={20}
    />
  );
}

export default function Sidebar() {
  const { auth, logout } = useAuth();
  const { setOpen } = useNav();
  const location = useLocation();
  const links = RH_ROLES.includes(auth.user.role) ? RH_LINKS : MANAGER_LINKS;

  const groups = [];
  for (const link of links) {
    const last = groups[groups.length - 1];
    if (!last || last.name !== link.group) groups.push({ name: link.group, items: [link] });
    else last.items.push(link);
  }

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar-brand" title="SUPERAMCO" onClick={() => setOpen(false)}>
        <Logo height={26} onDark />
      </NavLink>

      <nav>
        {groups.map((g) => (
          <div key={g.name} className="sidebar-group">
            <div className="sidebar-group-label">{g.name}</div>
            {g.items.map((l) => {
              const active = location.pathname === l.to;
              return (
                <NavLink key={l.to} to={l.to} title={l.label} className={active ? 'active' : ''} onClick={() => setOpen(false)}>
                  <NavIcon icon={l.icon} active={active} />
                  <span>{l.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <button className="logout-btn" onClick={logout} title="Déconnexion">
        <Logout set="light" primaryColor="currentColor" size={18} />
        <span>Déconnexion</span>
      </button>
    </aside>
  );
}
