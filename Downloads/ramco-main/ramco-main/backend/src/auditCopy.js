const ROLE = {
  RH: 'gestionnaire RH',
  RH_ASSISTANT: 'assistant RH',
  MANAGER: 'manager de site',
};

const REASON = {
  DEMISSION: 'démission',
  FIN_CDD: 'fin de CDD',
  RETRAITE: 'retraite',
  LICENCIEMENT: 'licenciement',
};

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return `${v.toLocaleString('fr-FR')} FCFA`;
}

function fullName(obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (obj.firstName || obj.lastName) return [obj.firstName, obj.lastName].filter(Boolean).join(' ').trim();
  return String(obj.name || '').trim();
}

function describeAudit({ action, entityType, entityId, before, after }) {
  const a = after && typeof after === 'object' ? after : {};
  const b = before && typeof before === 'object' ? before : {};
  const name = fullName(a) || fullName(b);
  const matricule = a.matricule || b.matricule || '';
  const ref = entityId != null ? ` n° ${entityId}` : '';

  switch (`${action}:${entityType}`) {
    case 'CREATE:User':
      return `a créé le compte de ${a.name || 'un utilisateur'}${a.role ? ` (${ROLE[a.role] || a.role})` : ''}`;
    case 'UPDATE:User': {
      const bits = [];
      if (b.name && a.name && b.name !== a.name) bits.push(`nom ${b.name} → ${a.name}`);
      if (b.email && a.email && b.email !== a.email) bits.push(`e-mail ${b.email} → ${a.email}`);
      if (b.role && a.role && b.role !== a.role) bits.push(`rôle ${ROLE[b.role] || b.role} → ${ROLE[a.role] || a.role}`);
      const who = a.name || b.name || 'un compte';
      return bits.length
        ? `a modifié le compte de ${who} (${bits.join(', ')})`
        : `a modifié le compte de ${who}`;
    }
    case 'DELETE:User':
      return `a supprimé le compte de ${b.name || 'un utilisateur'}`;
    case 'CREATE:Employee':
      return `a créé le dossier de ${name || 'un employé'}${matricule ? ` (${matricule})` : ''}`;
    case 'VALIDATE:STC': {
      const who = fullName(a);
      const reason = REASON[a.reason] || '';
      const amount = money(a.totalAmount);
      return `a validé le solde de tout compte${who ? ` de ${who}` : ''}${reason ? ` (${reason})` : ''}${amount ? ` — ${amount}` : ''}`;
    }
    case 'CREATE:Attendance': {
      const who = fullName(a);
      const late = a.status === 'RETARD' ? ' en retard' : '';
      return who ? `a pointé ${who}${late}` : (late ? 'a enregistré un pointage en retard' : 'a enregistré un pointage (présent)');
    }
    case 'CREATE:Contract': {
      const who = fullName(a);
      return `a ajouté un contrat ${a.type || ''}${who ? ` pour ${who}` : ''}${a.salary != null ? ` (${money(a.salary)})` : ''}`.replace(/\s+/g, ' ').trim();
    }
    case 'CREATE:Absence': {
      const who = fullName(a);
      return `a déclaré une absence${who ? ` pour ${who}` : ''}${a.type ? ` (${a.type})` : ''}`;
    }
    case 'CREATE:CareerMove': {
      const who = fullName(a);
      const from = a.fromPosition || a.fromSite;
      const to = a.toPosition || a.toSite;
      const dest = from && to ? ` de ${from} vers ${to}` : (to ? ` vers ${to}` : '');
      return `a enregistré une mutation${who ? ` de ${who}` : ''}${dest}`;
    }
    case 'UPDATE:HrSetting':
      return 'a modifié les réglages RH (seuils, barèmes, congés ou sites)';
    case 'UPDATE:HrSettingMail':
      return 'a modifié la configuration des e-mails (Resend)';
    case 'IMPORT:Employee': {
      const ok = Number(a.success) || 0;
      const err = Number(a.errors) || 0;
      return `a importé ${ok} employé(s) depuis Excel${err ? ` (${err} ligne(s) en erreur)` : ''}`;
    }
    case 'IMPORT:Attendance': {
      const ok = Number(a.success) || 0;
      const skip = Number(a.skipped) || 0;
      const err = Number(a.errors) || 0;
      return `a importé ${ok} présence(s) depuis Excel${skip ? `, ${skip} déjà présentes` : ''}${err ? ` (${err} ligne(s) en erreur)` : ''}`;
    }
    default:
      break;
  }

  const verb = { CREATE: 'a créé', UPDATE: 'a modifié', DELETE: 'a supprimé', VALIDATE: 'a validé', IMPORT: 'a importé' }[action] || 'a effectué une action sur';
  const objet = { Employee: 'un employé', Attendance: 'une présence', Contract: 'un contrat', CareerMove: 'une mutation', Absence: 'une absence', STC: 'un STC', User: 'un compte', Site: 'un site', HrSetting: 'les réglages', HrSettingMail: 'les e-mails' }[entityType] || entityType.toLowerCase();
  return `${verb} ${objet}${ref}`;
}

module.exports = { describeAudit };
