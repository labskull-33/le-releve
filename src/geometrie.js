// Outils communs aux expériences de géométrie sacrée (9 à 12)

/*
 * Branchement au panneau de contrôle, en direct :
 *   réglages (colonne de droite) → settings.values, relus à chaque image : un
 *                                  curseur bougé se voit à l'image suivante
 *   Ce modèle (panneau Design)   → couleurs de la pièce (fond, tracé, éclat),
 *                                  modele.onChange
 *   commun (panneau Design)      → l'accent du labo, design.onChange
 * brancherCouleurs() relit tout d'un coup et rappelle l'expérience à chaque
 * changement, sans attendre le recalage du labo.
 */

// Teintes d'éclat proposées dans « Ce modèle » : or, cyan, ou l'accent du labo
export const TEINTES = { Or: 'or', Cyan: 'cyan', 'Accent du labo': 'accent' };
const HEX = { or: '#e2b857', cyan: '#62d8e6' };

export function lireAccent() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e8814a';
}

// Une teinte (or, cyan, accent) ou une couleur libre, en hexadécimal
export const teinte = (v) => (v === 'accent' ? lireAccent() : HEX[v] ?? v);

export function brancherCouleurs({ modele, design, hero }, emplacements, appliquer) {
  const lire = () => {
    const m = modele?.values ?? {};
    const c = {};
    for (const [key, def] of Object.entries(emplacements)) {
      if (def.type === 'color' || def.type === 'select') c[key] = teinte(m[key] ?? def.value);
    }
    c.accent = lireAccent();
    appliquer(c);
    if (c.fond) encreSurFond(hero, design, c.fond);
  };
  lire();
  modele?.onChange?.(lire);
  return design?.onChange?.(lire) ?? (() => {});
}

// Encre du texte : un fond clair choisi dans le panneau appelle un texte sombre
// (sauf si le design impose son thème)
function encreSurFond(hero, design, hex) {
  if (!hero || (design && design.values.theme !== 'auto')) return;
  const [r, g, b] = rgb(hex).map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  hero.root.dataset.theme = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? 'light' : 'dark';
}

export function rgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Mélange de deux couleurs hexadécimales, t de 0 (a) à 1 (b)
export function melange(a, b, t) {
  const A = rgb(a);
  const B = rgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}

// Souris suivie avec inertie : même convention que le curseur du labo
// (inertie = part du chemin qui reste à faire à chaque image, 0 = collée)
export function suivreSouris(el) {
  const m = { x: 0, y: 0, sx: 0, sy: 0, inside: false, fresh: true };
  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    m.x = e.clientX - r.left;
    m.y = e.clientY - r.top;
    if (!m.inside || m.fresh) {
      m.sx = m.x;
      m.sy = m.y;
      m.fresh = false;
    }
    m.inside = true;
  };
  const onLeave = () => (m.inside = false);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerdown', onMove);
  el.addEventListener('pointerleave', onLeave);
  m.suivre = (inertie) => {
    const k = 1 - Math.min(0.99, Math.max(0, inertie));
    m.sx += (m.x - m.sx) * k;
    m.sy += (m.y - m.sy) * k;
  };
  m.detacher = () => {
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerdown', onMove);
    el.removeEventListener('pointerleave', onLeave);
  };
  return m;
}
