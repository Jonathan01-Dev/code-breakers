// Petit rond coloré avec les initiales d'une personne (employé ou
// utilisateur), utilisé partout où on affiche une personne dans une liste.
// On n'a pas de vraies photos de profil, donc on génère une couleur de fond
// "stable" à partir du nom : la même personne aura toujours la même couleur
// (utile pour la reconnaître visuellement d'un écran à l'autre).

const PALETTE = ['#E31E2B', '#1A1A1A', '#B8121E', '#55565C', '#8a5a05', '#1E8A4C'];

// Transforme une chaîne de caractères en un nombre "hash", puis choisit une
// couleur dans la palette selon ce nombre. C'est un simple hash de type
// "djb2" (décalage de bits + addition) : peu importe l'algorithme exact,
// ce qui compte c'est qu'il soit déterministe (même entrée -> même sortie).
function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function Avatar({ firstName, lastName, size = 40 }) {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  const bg = colorFor(`${firstName}${lastName}`);
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: bg }}
    >
      {initials}
    </div>
  );
}
