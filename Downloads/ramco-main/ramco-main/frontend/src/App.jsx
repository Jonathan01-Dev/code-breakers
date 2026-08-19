// Composant racine de l'application : définit toutes les routes (URLs) et
// qui a le droit d'y accéder. C'est une Single Page Application (SPA) :
// changer de route ne recharge jamais la page, seul le composant affiché
// dans <main className="content-zone"> change (voir Layout ci-dessous).
import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { NavContext } from './NavContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Scan from './pages/Scan';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import Departures from './pages/Departures';
import Users from './pages/Users';
import Audit from './pages/Audit';
import Settings from './pages/Settings';

// RH et RH_ASSISTANT ont accès aux mêmes pages ; MANAGER n'a droit qu'au scan.
const RH_ROLES = ['RH', 'RH_ASSISTANT'];

function Protected({ roles, children }) {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(auth.user.role)) return <Navigate to="/scan" replace />;
  return children;
}

// Structure visuelle commune à toutes les pages une fois connecté :
// sidebar fixe à gauche + zone de contenu qui change selon la route.
function Layout({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <NavContext.Provider value={{ open, setOpen }}>
      <div className={`app-shell${open ? ' nav-open' : ''}`}>
        {open && <button type="button" className="nav-backdrop" aria-label="Fermer le menu" onClick={() => setOpen(false)} />}
        <Sidebar />
        <div className="app-main">
          <TopBar />
          <main className="content-zone">{children}</main>
        </div>
      </div>
    </NavContext.Provider>
  );
}

export default function App() {
  const { auth } = useAuth();

  return (
    <Routes>
      {/* Si déjà connecté, /login redirige directement vers la page d'accueil */}
      <Route path="/login" element={auth ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/forgot-password" element={auth ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/dashboard"
        element={
          <Protected roles={RH_ROLES}>
            <Layout>
              <Dashboard />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/scan"
        element={
          // seule page accessible aux 3 rôles (RH, RH_ASSISTANT, MANAGER)
          <Protected roles={[...RH_ROLES, 'MANAGER']}>
            <Layout>
              <Scan />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/employees"
        element={
          <Protected roles={RH_ROLES}>
            <Layout>
              <Employees />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/attendance"
        element={
          <Protected roles={RH_ROLES}>
            <Layout>
              <Attendance />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/departures"
        element={
          <Protected roles={RH_ROLES}>
            <Layout>
              <Departures />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/users"
        element={
          <Protected roles={RH_ROLES}>
            <Layout>
              <Users />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/audit"
        element={
          <Protected roles={RH_ROLES}>
            <Layout>
              <Audit />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected roles={RH_ROLES}>
            <Layout>
              <Settings />
            </Layout>
          </Protected>
        }
      />

      {/* Route "/" : redirige vers la bonne page d'accueil selon la situation
          (pas connecté -> login, manager -> scan, RH/assistant -> dashboard) */}
      <Route
        path="/"
        element={<Navigate to={auth ? (auth.user.role === 'MANAGER' ? '/scan' : '/dashboard') : '/login'} replace />}
      />
    </Routes>
  );
}
