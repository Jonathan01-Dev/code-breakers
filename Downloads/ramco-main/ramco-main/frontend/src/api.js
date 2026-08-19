// Client API : centralise TOUS les appels HTTP vers le backend en un seul
// endroit, plutôt que de disperser des `fetch(...)` dans chaque page.
// Avantage : si l'URL de base change, ou si on veut ajouter un comportement
// commun (gestion d'erreur, en-têtes...), on ne le fait qu'ici.

const BASE = '/api'; // en dev, Vite redirige /api/* vers http://localhost:4000 (voir vite.config.js)

// Fonction générique utilisée par toutes les méthodes ci-dessous : fait
// l'appel fetch, ajoute automatiquement le token JWT dans l'en-tête
// Authorization s'il est fourni, parse la réponse JSON, et transforme les
// réponses HTTP en erreur (status >= 400) en vraie exception JS,
// pour pouvoir écrire `try { await api.xxx() } catch (e) { ... }` côté pages.
async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && typeof window !== 'undefined') {
      localStorage.removeItem('rh_auth');
      sessionStorage.removeItem('rh_auth');
      const path = window.location.pathname;
      if (!['/login', '/forgot-password', '/reset-password'].includes(path)) {
        window.location.assign('/login');
      }
    }
    throw new Error(data.error || `Erreur ${res.status}`);
  }
  return data;
}

// Chaque propriété correspond à une route du backend. Toutes prennent le
// `token` en premier argument (sauf login, qui sert justement à l'obtenir).
export const api = {
  login: (email, password, rememberMe) => request('/auth/login', { method: 'POST', body: { email, password, rememberMe: Boolean(rememberMe) } }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: { token, password } }),
  dashboard: (token, date) => request(`/dashboard${date ? `?date=${encodeURIComponent(date)}` : ''}`, { token }),
  downloadDashboard: async (token, date) => {
    const res = await fetch(`${BASE}/dashboard/export${date ? `?date=${encodeURIComponent(date)}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Impossible d’exporter le tableau de bord');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tableau_bord_${date || 'export'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },
  scan: (token, code, manual) => request('/scan', { method: 'POST', body: { code, manual }, token }),
  scanRecent: (token) => request('/scan/recent', { token }),
  employeeQr: (token, id) => request(`/scan/qr/${id}`, { token }),
  employees: (token, q) => request(`/employees${q ? `?q=${encodeURIComponent(q)}` : ''}`, { token }),
  employee: (token, id) => request(`/employees/${id}`, { token }),
  createEmployee: (token, payload) => request('/employees', { method: 'POST', body: payload, token }),
  addContract: (token, id, payload) => request(`/employees/${id}/contracts`, { method: 'POST', body: payload, token }),
  addCareerMove: (token, id, payload) => request(`/employees/${id}/career-moves`, { method: 'POST', body: payload, token }),
  addAbsence: (token, id, payload) => request(`/employees/${id}/absences`, { method: 'POST', body: payload, token }),
  updateLeaveBalance: (token, id, payload) => request(`/employees/${id}/leave-balance`, { method: 'PUT', body: payload, token }),
  attendance: (token, params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/attendance${qs ? `?${qs}` : ''}`, { token });
  },
  attendanceOverview: (token, date) => request(`/attendance/overview${date ? `?date=${encodeURIComponent(date)}` : ''}`, { token }),
  importAttendance: async (token, file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/attendance/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  },
  downloadAttendanceTemplate: async (token) => {
    const res = await fetch(`${BASE}/attendance/import/template`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Impossible de télécharger le modèle');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-import-presences.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  },
  audit: (token, params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/audit${qs ? `?${qs}` : ''}`, { token });
  },
  createStc: (token, payload) => request('/stc', { method: 'POST', body: payload, token }),
  previewStc: (token, payload) => request('/stc/preview', { method: 'POST', body: payload, token }),
  stcHistory: (token) => request('/stc', { token }),
  sites: (token) => request('/sites', { token }),
  createSite: (token, name) => request('/sites', { method: 'POST', body: { name }, token }),
  settings: (token) => request('/settings', { token }),
  saveSettings: (token, payload) => request('/settings', { method: 'PUT', body: payload, token }),
  saveMailSettings: (token, payload) => request('/settings/mail', { method: 'PUT', body: payload, token }),
  testMail: (token) => request('/settings/test-mail', { method: 'POST', token }),
  users: (token) => request('/users', { token }),
  createUser: (token, payload) => request('/users', { method: 'POST', body: payload, token }),
  updateUser: (token, id, payload) => request(`/users/${id}`, { method: 'PUT', body: payload, token }),
  deleteUser: (token, id) => request(`/users/${id}`, { method: 'DELETE', token }),

  // Cas particulier : l'envoi d'un fichier ne peut pas passer par la
  // fonction request() générique (qui envoie du JSON). On utilise
  // FormData, le format attendu par multer côté backend (voir routes/import.js).
  importEmployees: async (token, file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/employees/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }, // pas de Content-Type ici : le navigateur le définit tout seul (avec la "boundary" multipart nécessaire)
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  },

  // Télécharge un fichier binaire (le classeur Excel modèle) plutôt que du
  // JSON. On récupère la réponse comme un "blob" (données binaires brutes),
  // on crée une URL temporaire pointant vers ce blob, puis on simule un
  // clic sur un lien <a download> pour déclencher le téléchargement — c'est
  // la manière standard de télécharger un fichier généré côté client.
  downloadImportTemplate: async (token) => {
    const res = await fetch(`${BASE}/employees/import/template`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Impossible de télécharger le modèle');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-import-employes.xlsx';
    a.click();
    URL.revokeObjectURL(url); // libère la mémoire une fois le téléchargement lancé
  },
};
