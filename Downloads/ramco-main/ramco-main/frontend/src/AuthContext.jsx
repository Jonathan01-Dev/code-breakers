import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);
const AUTH_KEY = 'rh_auth';
const EMAIL_KEY = 'rh_remember_email';
const ACTIVITY_KEY = 'rh_last_activity';
const IDLE_MS = 60 * 60 * 1000;
const REMEMBER_IDLE_MS = 8 * 60 * 60 * 1000;

function parseExp(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function readStore(store) {
  try {
    const raw = store.getItem(AUTH_KEY);
    const value = raw ? JSON.parse(raw) : null;
    if (!value?.token) return null;
    const exp = parseExp(value.token);
    if (exp && exp <= Date.now()) {
      store.removeItem(AUTH_KEY);
      return null;
    }
    return value;
  } catch {
    store.removeItem(AUTH_KEY);
    return null;
  }
}

export function rememberedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => readStore(sessionStorage) || readStore(localStorage));

  function login(token, user, remember = false) {
    const value = { token, user, remember: Boolean(remember) };
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    const store = remember ? localStorage : sessionStorage;
    store.setItem(AUTH_KEY, JSON.stringify(value));
    if (remember) localStorage.setItem(EMAIL_KEY, user.email);
    else localStorage.removeItem(EMAIL_KEY);
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    setAuth(value);
  }

  function logout() {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    setAuth(null);
  }

  useEffect(() => {
    if (!auth?.token) return undefined;
    const exp = parseExp(auth.token);
    if (exp && exp <= Date.now()) {
      logout();
      return undefined;
    }
    const idleLimit = auth.remember ? REMEMBER_IDLE_MS : IDLE_MS;
    const untilExp = exp ? exp - Date.now() : idleLimit;
    const expTimer = window.setTimeout(logout, Math.max(untilExp, 0));

    const mark = () => localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    const events = ['pointerdown', 'keydown', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
    mark();

    const idleTimer = window.setInterval(() => {
      const last = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
      if (last && Date.now() - last > idleLimit) logout();
    }, 30000);

    return () => {
      window.clearTimeout(expTimer);
      window.clearInterval(idleTimer);
      events.forEach((ev) => window.removeEventListener(ev, mark));
    };
  }, [auth?.token, auth?.remember]);

  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
