// Les données du tracé. Ici vides : la page les lit dans oeuvre.json et les passe au relief
// (option trace, et jours depuis jours.json). Seule place() sert.
export const TRACE = [];
export const JOURS = {};

// La place d'une création en plan, en pas de compas : 1 = en haut, puis dans le sens des aiguilles d'une montre,
// de 60° en 60°. x vers la droite, y vers le haut.
export function place(pas) {
  let x = 0;
  let y = 0;
  for (const k of pas) {
    const a = ((k - 1) * Math.PI) / 3;
    x += Math.sin(a);
    y += Math.cos(a);
  }
  return [x, y];
}
