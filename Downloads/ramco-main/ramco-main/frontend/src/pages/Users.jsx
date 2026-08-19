import { useEffect, useState } from 'react';
import { UserPlus, Trash2, Pencil } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Avatar from '../Avatar';
import Badge from '../Badge';
import Modal from '../Modal';
import PasswordField from '../PasswordField';
import { ACTION } from '../appActions';

const ROLES = [
  { value: 'RH', label: 'Gestionnaire RH' },
  { value: 'RH_ASSISTANT', label: 'Assistant RH' },
  { value: 'MANAGER', label: 'Manager de Site' },
];

const emptyForm = { email: '', name: '', password: '', role: 'RH', siteId: '' };

function roleLabel(value) {
  return ROLES.find((r) => r.value === value)?.label || value;
}

function fmtWhen(d) {
  return new Date(d).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Users() {
  const { auth } = useAuth();
  const [users, setUsers] = useState([]);
  const [lastAction, setLastAction] = useState(null);
  const [sites, setSites] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  function reload() {
    api
      .users(auth.token)
      .then((res) => {
        const list = Array.isArray(res) ? res : res.users || [];
        setUsers(list);
        setLastAction(Array.isArray(res) ? null : res.lastAction || null);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    reload();
    api.sites(auth.token).then(setSites).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token]);

  useEffect(() => {
    function onAction(e) {
      if (e.detail?.type === ACTION.ADD_USER) openCreate();
    }
    window.addEventListener('rh-action', onAction);
    return () => window.removeEventListener('rh-action', onAction);
  }, []);

  function closeModal() {
    setModal(null);
    setSelected(null);
    setForm(emptyForm);
    setConfirming(false);
    setError('');
  }

  function openCreate() {
    setForm(emptyForm);
    setSelected(null);
    setConfirming(false);
    setError('');
    setModal('create');
  }

  function openEdit(u) {
    setSelected(u);
    setForm({
      email: u.email,
      name: u.name,
      password: '',
      role: u.role,
      siteId: u.site?.id ? String(u.site.id) : '',
    });
    setConfirming(false);
    setError('');
    setModal('edit');
  }

  function openDelete(u) {
    setSelected(u);
    setConfirming(false);
    setError('');
    setModal('delete');
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSaving(true);
    try {
      await api.createUser(auth.token, form);
      closeModal();
      reload();
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e) {
    e.preventDefault();
    setError('');
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      await api.updateUser(auth.token, selected.id, payload);
      closeModal();
      reload();
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(e) {
    e.preventDefault();
    setError('');
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSaving(true);
    try {
      await api.deleteUser(auth.token, selected.id);
      closeModal();
      reload();
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  }

  const siteField = form.role === 'MANAGER' && (
    <label>
      Site rattaché
      <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} required>
        <option value="">— Sélectionner —</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="emp-page">
      <section className="emp-table-card">
        <div className="emp-toolbar">
          <p className="page-kicker" style={{ margin: 0 }}>Comptes RH, assistants et managers</p>
          <div className="emp-toolbar-actions">
            <button type="button" className="primary-btn emp-add" onClick={openCreate}>
              <UserPlus size={15} /> Ajouter un compte
            </button>
          </div>
        </div>

        {error && !modal && <p className="error" style={{ margin: '0 1rem 1rem' }}>{error}</p>}

        <table className="table emp-table">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Site</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="table-row-main">
                    <Avatar firstName={u.name.split(' ')[0]} lastName={u.name.split(' ')[1] || ''} size={30} />
                    <div>
                      <div className="emp-name">{u.name}</div>
                      {u.id === auth.user.id && <div className="emp-sub">Vous</div>}
                    </div>
                  </div>
                </td>
                <td>{u.email}</td>
                <td><Badge value={u.role} /></td>
                <td>{u.site?.name || '—'}</td>
                <td>
                  <div className="row-actions">
                    <button type="button" className="icon-btn" title="Modifier" onClick={() => openEdit(u)}>
                      <Pencil size={15} />
                    </button>
                    {u.id !== auth.user.id && (
                      <button type="button" className="icon-btn-danger" title="Supprimer" onClick={() => openDelete(u)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-cell">Aucun compte</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {lastAction && (
        <p className="audit-foot">
          Dernière action : {lastAction.label} par {lastAction.by} · {fmtWhen(lastAction.at)}
        </p>
      )}

      {modal === 'create' && (
        <Modal
          title="Nouveau compte"
          subtitle="Le compte pourra se connecter immédiatement"
          onClose={closeModal}
        >
          <form className="modal-grid-form" onSubmit={handleCreate}>
            <UserFields form={form} setForm={setForm} passwordRequired siteField={siteField} />
            {error && <p className="error">{error}</p>}
            {confirming && (
              <p className="confirm-note">
                Créer le compte de {form.name || 'cet utilisateur'} ({roleLabel(form.role)}) ? L’action sera enregistrée à votre nom.
              </p>
            )}
            <div className="modal-form-actions">
              <button type="button" className="toolbar-btn" onClick={closeModal}>Annuler</button>
              <button type="submit" className={confirming ? 'danger-btn' : 'primary-btn'} disabled={saving}>
                {confirming ? 'Confirmer la création' : 'Créer le compte'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'edit' && selected && (
        <Modal
          title={`Modifier ${selected.name}`}
          subtitle={selected.email}
          onClose={closeModal}
        >
          <form className="modal-grid-form" onSubmit={handleEdit}>
            <UserFields form={form} setForm={setForm} passwordRequired={false} siteField={siteField} />
            {error && <p className="error">{error}</p>}
            {confirming && (
              <p className="confirm-note">
                Enregistrer les modifications de {form.name} ? L’action sera enregistrée à votre nom.
              </p>
            )}
            <div className="modal-form-actions">
              <button type="button" className="toolbar-btn" onClick={closeModal}>Annuler</button>
              <button type="submit" className={confirming ? 'danger-btn' : 'primary-btn'} disabled={saving}>
                {confirming ? 'Confirmer la modification' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'delete' && selected && (
        <Modal
          title="Supprimer le compte"
          subtitle={selected.email}
          onClose={closeModal}
        >
          <form onSubmit={handleDelete}>
            <p>
              Vous allez supprimer <strong>{selected.name}</strong> ({roleLabel(selected.role)}).
              Cette personne ne pourra plus se connecter.
            </p>
            {error && <p className="error">{error}</p>}
            {confirming && (
              <p className="confirm-note">
                Confirmez la suppression. L’action sera enregistrée à votre nom et ne pourra pas être annulée.
              </p>
            )}
            <div className="modal-form-actions">
              <button type="button" className="toolbar-btn" onClick={closeModal}>Annuler</button>
              <button type="submit" className="danger-btn" disabled={saving}>
                {confirming ? 'Confirmer la suppression' : 'Supprimer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function UserFields({ form, setForm, passwordRequired, siteField }) {
  return (
    <>
      <label>
        Nom complet
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </label>
      <label>
        Email
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="off" />
      </label>
      <PasswordField
        value={form.password}
        onChange={(password) => setForm({ ...form, password })}
        required={passwordRequired}
        autoComplete="new-password"
        showMeter={passwordRequired || Boolean(form.password)}
        label={passwordRequired ? 'Mot de passe' : 'Mot de passe (laisser vide pour ne pas changer)'}
      />
      <label>
        Rôle
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, siteId: e.target.value === 'MANAGER' ? form.siteId : '' })}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </label>
      {siteField}
    </>
  );
}
