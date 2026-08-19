// Petite pastille colorée pour afficher un statut/rôle/type de contrat en un
// coup d'œil, plutôt qu'un texte brut. Utilisé dans presque toutes les pages
// (Employees, Attendance, Users...) avec les valeurs brutes venant de l'API
// (les enums du schéma Prisma : 'ACTIF', 'CDD', 'RH_ASSISTANT'...).

// Associe chaque valeur possible à une classe CSS de couleur (voir index.css :
// .badge-green, .badge-red, .badge-amber, .badge-blue, .badge-gray).
const VARIANTS = {
  ACTIF: 'badge-green',
  PRESENT: 'badge-green',
  QUITTE: 'badge-gray',
  RETRAITE: 'badge-blue',
  RETARD: 'badge-amber',
  ABSENT: 'badge-red',
  CDI: 'badge-blue',
  CDD: 'badge-amber',
  DEMISSION: 'badge-green',
  FIN_CDD: 'badge-amber',
  LICENCIEMENT: 'badge-red',
  RH: 'badge-red',
  RH_ASSISTANT: 'badge-amber',
  MANAGER: 'badge-blue',
  CREATE: 'badge-green',
  UPDATE: 'badge-blue',
  DELETE: 'badge-red',
  IMPORT: 'badge-amber',
  VALIDATE: 'badge-green',
};

// Traduit les valeurs techniques (enum de la base de données) en libellés
// lisibles pour l'utilisateur final.
const LABELS = {
  ACTIF: 'Actif',
  QUITTE: 'Quitté',
  RETRAITE: 'Retraité',
  PRESENT: 'Présent',
  RETARD: 'Retard',
  ABSENT: 'Absent',
  RH: 'Gestionnaire RH',
  RH_ASSISTANT: 'Assistant RH',
  MANAGER: 'Manager de Site',
  CREATE: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  IMPORT: 'Import',
  VALIDATE: 'Validation',
};

// Usage : <Badge value="ACTIF" /> affiche un badge vert "Actif".
// `children` permet de forcer un texte personnalisé tout en gardant la
// couleur associée à `value` (utilisé pour "Justifiée"/"Non justifiée" par
// exemple, où on réutilise les couleurs ACTIF/RETARD sans leurs libellés).
export default function Badge({ value, children }) {
  const variant = VARIANTS[value] || 'badge-gray';
  return <span className={`badge ${variant}`}>{children || LABELS[value] || value}</span>;
}
