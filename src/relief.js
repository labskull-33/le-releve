// Expérience 20 — Topographie : le tracé du site levé en carte. Chaque page est un sommet à sa place dans /trace/,
// haut de ses jours de travail ; les sentiers sont les pas du compas, du trait à chaque page. Deux écritures du
// même relevé : Plan coté (carte de randonnée sur papier, courbes cotées, sentiers en tirets rouges) et Courbes
// de forge (le relief sur charbon, les courbes chauffent avec l'altitude et sur les crêtes). Three.js + canvas 2D.
import * as THREE from 'three';
import reglages from './reglages.js';
import { brancherCouleurs, rgb, suivreSouris } from './geometrie.js';
import { JOURS, TRACE, place } from './trace-donnees.js';

export { reglages }; // valeurs par défaut du panneau de réglages

export const hero = {
  layout: 'bottom-left',
  style: 'epure',
  eyebrow: 'Expérience 20 — Topographie',
  title: 'Le relevé du site',
  text: 'Chaque page est un sommet, à sa place dans le tracé, haut de ses jours de travail : une courbe par demi-journée, une maîtresse tous les cinq jours. Les sentiers suivent les pas du compas depuis le trait. Glissez pour tourner autour, mettez-le à plat pour lire le plan.',
  cta: 'Voir le plan',
};

export const variants = [
  { id: 'pose', label: 'Plan coté', theme: 'light', scrim: false, description: 'La carte de randonnée : courbes cotées, estompage, sentiers en tirets, légende' },
  {
    id: 'forge',
    label: 'Courbes de forge',
    scrim: false,
    description: 'Le même relief sur charbon : les courbes chauffent avec l’altitude et sur les crêtes',
    hero: {
      title: 'Le relief à chaud',
      text: 'Le même relevé, sorti de la forge : plus une page a demandé de jours, plus ses courbes chauffent. Survolez un sommet, il rougit ; soufflez sur la forge, la chaleur descend des crêtes.',
      cta: 'Souffler la forge',
    },
  },
];

// Les 4 couches de l'effet, pour le cartouche (touche N)
export const nomenclature = {
  structure: 'Three.js : un maillage carré dont chaque sommet porte son altitude en jours ; terrain = maximum doux de profils pointus, un par page du tracé (trace-donnees.js), flancs déformés et ravinés au bruit ; calque canvas 2D pour sentiers, cotes et noms',
  physique: 'Un ressort sous-amorti lève le relief (0 plan ↔ 1 relief) ; l’inclinaison suit le levage ; la chaleur du survol et le souffle s’éteignent doucement',
  declencheur: 'Bouton : lever le relief (Plan coté) ou souffler la forge ; survol d’un sommet ou d’une ligne de la légende : son chemin depuis le trait ; glisser : tourner et incliner ; double-clic : vue d’origine',
  rendu: 'Courbes calculées au pixel dans le shader (fwidth) : épaisseur constante à l’écran, les fines s’effacent où elles se serrent ; estompage éclairé du nord-ouest, puis, levé, par le soleil de Paris à l’heure de Paris (position vraie, curseur des heures) : ombres portées par lancer de rayons dans le relevé, lavis et hachures ; forge : rampe gris → braise → blanc, halo, profondeur de champ simulée par l’élargissement du trait, clair de lune (position et phase vraies, ombres de lune) ; la nuit tombée, le Plan coté passe à la forge',
  coefs: ['hauteur', 'pointe', 'equidistance', 'trait'],
};

// Pièces réglées dans « Ce modèle » (panneau Design) : les couleurs changent à l'instant
export const emplacements = {
  papier: { label: 'Papier (Plan coté)', type: 'color', value: '#e7ddcd' },
  encre: { label: 'Encre des courbes (Plan coté)', type: 'color', value: '#4a443c' },
  texte: { label: 'Texte (Plan coté)', type: 'color', value: '#2b2826' },
  sentier: { label: 'Sentiers (Plan coté)', type: 'color', value: '#c2361f' },
  couchant: { label: 'Lumière du couchant (Plan coté)', type: 'color', value: '#c98a52' },
  charbon: { label: 'Charbon (forge)', type: 'color', value: '#181717' },
  braise: { label: 'Braise (forge)', type: 'color', value: '#fc7826' },
  or: { label: 'Fleur de vie (forge)', type: 'color', value: '#e2b857' },
};

const SITE = 'https://davidvuillet.fr';
const S = 100; // un pas de compas, en unités du monde
const FOV = 30;
const E = 5; // demi-côté du terrain, en pas
const MAITRESSE = 5; // une courbe maîtresse tous les cinq jours

// Les pages : leur place (en pas, centrée sur la figure), leurs jours, la page d'où part leur dernier pas.
// Les jours viennent de trace-donnees.js ; sur le site, du relevé fait à chaque envoi (js/releve/jours.json).
let MAXJ = 1;
let PAGES = [];
function releverPages(jours, trace = TRACE) {
  const raw = trace.map(([nom, pas, url]) => {
    const [x, y] = place(pas);
    return { nom, pas, url, x, y, j: jours[nom] ?? JOURS[nom] ?? 1 };
  });
  MAXJ = Math.max(...raw.map((p) => p.j));
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  PAGES = raw.map((p, k) => ({
    ...p,
    k,
    x: p.x - cx,
    y: p.y - cy,
    parent: raw.findIndex((q) => q.pas.length === p.pas.length - 1 && q.pas.every((v, i) => v === p.pas[i])),
  }));
}
releverPages(JOURS);
// Le chemin du trait jusqu'à une page : la suite de ses parents
const chemin = (k) => {
  const out = [];
  for (let c = k; c >= 0; c = PAGES[c].parent) out.push(c);
  return out;
};

// Rectangle d'un élément dans le repère d'un autre (le même que rectIn de hero.js, sans tirer le hero dans /trace/)
const rectIn = (el, ref) => {
  const a = el.getBoundingClientRect();
  const b = ref.getBoundingClientRect();
  return { x: a.left - b.left, y: a.top - b.top, width: a.width, height: a.height };
};

// Bruit de gradient (Perlin) graine fixe : le relief est toujours le même
const PERM = (() => {
  let s = 20261009;
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return Uint8Array.from([...p, ...p]);
})();
const GX = [1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
const GY = [0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];
function bruit(x, y) {
  const X = Math.floor(x);
  const Y = Math.floor(y);
  const fx = x - X;
  const fy = y - Y;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const g = (i, j) => {
    const h = PERM[PERM[(X + i) & 255] + ((Y + j) & 255)] & 7;
    return GX[h] * (fx - i) + GY[h] * (fy - j);
  };
  const a = g(0, 0) + (g(1, 0) - g(0, 0)) * u;
  const b = g(0, 1) + (g(1, 1) - g(0, 1)) * u;
  return (a + (b - a) * v) * 1.4;
}
const fbm = (x, y, oct) => {
  let t = 0;
  let a = 0.5;
  for (let o = 0; o < oct; o++, x *= 2.03, y *= 2.03, a *= 0.5) t += a * bruit(x, y);
  return t;
};
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// L'altitude (en jours) en un point du plan (en pas). Chaque sommet atteint exactement ses jours : le profil
// exp(-r^pointe) est pointu sous 2, les déformations et les ravines s'éteignent près de la pointe ; les montagnes
// voisines se rejoignent par un maximum doux (des cols), le sol ondule sous 0,7 jour.
function altitude(x, y, s) {
  const sol = Math.min(0.7, Math.max(0, 0.32 + 0.45 * fbm(x * 1.2 + 7.3, y * 1.2 - 3.1, 3)));
  const wx = fbm(x * 1.7 + 11.2, y * 1.7 + 0.4, 3);
  const wy = fbm(x * 1.7 - 5.6, y * 1.7 + 9.8, 3);
  let q4 = 0;
  for (const p of PAGES) {
    const sig = s.largeur * (0.5 + 0.7 * Math.sqrt(p.j / MAXJ));
    const dx = x - p.x;
    const dy = y - p.y;
    const r0 = Math.hypot(dx, dy) / sig;
    if (r0 > 4.5) continue;
    const warp = Math.min(r0, 1) * 0.5 * sig;
    const qx = dx + warp * wx;
    const qy = dy + warp * wy;
    const r = Math.hypot(qx, qy) / sig;
    let m = p.j * Math.exp(-(r ** s.pointe));
    if (s.ravines > 0 && r > 0.15) {
      // Ravines : des sillons qui descendent du sommet (bruit fin en angle, lent en distance)
      const a = Math.atan2(qy, qx);
      const n = Math.abs(bruit(Math.cos(a) * 2.6 + p.k * 7.1, Math.sin(a) * 2.6 + r * 0.55));
      m *= 1 - s.ravines * 0.32 * (1 - smooth(0, 0.22, n)) * smooth(0.15, 0.7, r) * (1 - smooth(1.8, 3.2, r));
    }
    q4 += m ** 4;
  }
  return Math.max(sol, q4 ** 0.25);
}

// ── Le ciel de Paris : le soleil (Plan coté) et la lune (forge), à l'heure de Paris ──
// Positions vraies, calculées à l'instant (formules abrégées des éphémérides, à la minute d'arc près pour le soleil,
// au demi-degré pour la lune : assez pour les ombres). Le nord du relevé est le haut de la fleur.
const RAD = Math.PI / 180;
// Le lieu du ciel : Paris par défaut ; placerCiel() le change (le dépôt « le-releve » le lit dans oeuvre.json)
let LAT = 48.8566 * RAD;
let LON = 2.3522 * RAD;
let FUSEAU = 'Europe/Paris';
let LIEU = 'Paris';
const OBLIQ = 23.4397 * RAD;
const CREPUSCULE = -6 * RAD; // la nuit tombe à la fin du crépuscule civil
const ascension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBLIQ) - Math.tan(b) * Math.sin(OBLIQ), Math.cos(l));
const declin = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBLIQ) + Math.cos(b) * Math.sin(OBLIQ) * Math.sin(l));
// Le soleil et la lune à l'instant t (ms) : leurs directions, la déclinaison du soleil, la phase de la lune
export function ciel(t) {
  const d = t / 864e5 - 10957.5; // jours depuis le 1er janvier 2000 à midi
  const temps = (280.16 + 360.9856235 * d) * RAD + LON; // temps sidéral du lieu
  const M = (357.5291 + 0.98560028 * d) * RAD;
  const lS = M + (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD + 102.9372 * RAD + Math.PI;
  const aS = ascension(lS, 0);
  const dS = declin(lS, 0);
  const L = (218.316 + 13.176396 * d) * RAD;
  const Ml = (134.963 + 13.064993 * d) * RAD;
  const F = (93.272 + 13.22935 * d) * RAD;
  const lL = L + 6.289 * RAD * Math.sin(Ml);
  const bL = 5.128 * RAD * Math.sin(F);
  const distL = 385001 - 20905 * Math.cos(Ml);
  const aL = ascension(lL, bL);
  const dL = declin(lL, bL);
  // La phase : l'angle soleil–lune vu de la Terre ; croissante tant que la lune est à l'est du soleil
  const phi = Math.acos(Math.sin(dS) * Math.sin(dL) + Math.cos(dS) * Math.cos(dL) * Math.cos(aS - aL));
  const inc = Math.atan2(149598000 * Math.sin(phi), distL - 149598000 * Math.cos(phi));
  const sens = Math.atan2(Math.cos(dS) * Math.sin(aS - aL), Math.sin(dS) * Math.cos(dL) - Math.cos(dS) * Math.sin(dL) * Math.cos(aS - aL));
  return { soleil: soleilA(temps - aS, dS), declS: dS, lune: soleilA(temps - aL, dL), eclairee: (1 + Math.cos(inc)) / 2, croissante: sens < 0 };
}
export const nuitA = (t = Date.now()) => Math.asin(ciel(t).soleil[2]) < CREPUSCULE;
// L'heure de Paris : les minutes du jour à l'instant t, et l'instant d'une minute du même jour
const formatHeure = (fuseau) => new Intl.DateTimeFormat('en-GB', { timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
let FMT_PARIS = formatHeure(FUSEAU);
// Changer de lieu : { lieu, latitude, longitude, fuseau } (à appeler avant nuitA() et le montage)
export function placerCiel({ lieu = LIEU, latitude, longitude, fuseau = FUSEAU } = {}) {
  if (latitude != null) LAT = latitude * RAD;
  if (longitude != null) LON = longitude * RAD;
  LIEU = lieu;
  FUSEAU = fuseau;
  FMT_PARIS = formatHeure(fuseau);
}
function paris(t) {
  const o = Object.fromEntries(FMT_PARIS.formatToParts(t).map((p) => [p.type, +p.value]));
  const decalage = Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute) - Math.floor(t / 6e4) * 6e4;
  return { min: o.hour * 60 + o.minute, minuit: Date.UTC(o.year, o.month - 1, o.day) - decalage, jour: `${o.year}-${o.month}-${o.day}` };
}
export const minutesParis = (t) => paris(t).min;
export const instantParis = (min, t = Date.now()) => paris(t).minuit + min * 6e4;
// La direction d'un astre (x vers l'est, y vers le nord, z en haut) pour un angle horaire (0 = au méridien)
function soleilA(ah, decl) {
  return [
    -Math.cos(decl) * Math.sin(ah),
    Math.sin(decl) * Math.cos(LAT) - Math.cos(decl) * Math.cos(ah) * Math.sin(LAT),
    Math.sin(decl) * Math.sin(LAT) + Math.cos(decl) * Math.cos(ah) * Math.cos(LAT),
  ];
}
// L'angle horaire du lever (le coucher est son opposé)
const demiJour = (decl) => Math.acos(Math.min(1, Math.max(-1, -Math.tan(LAT) * Math.tan(decl))));

// Les ombres portées : chaque case du relevé remonte vers le soleil ; si le relief passe au-dessus du rayon, elle
// est à l'ombre. La pénombre suit l'angle sous lequel le rayon frôle l'obstacle (un soleil large de 2°).
const FRAG_OMBRE = /* glsl */ `
uniform sampler2D uH;
uniform float uN;      // cases par côté
uniform vec2 uDir;     // vers le soleil, au sol
uniform float uPente;  // montée du rayon, en jours par case
uniform float uK;      // un jour au-dessus du rayon, à une case : la tangente vue (unités du monde)
uniform float uMax;
varying vec2 vUv;
float hc(vec2 c) { return texelFetch(uH, ivec2(clamp(c, vec2(0.0), vec2(uN))), 0).r; }
float hb(vec2 c) {
  vec2 f = floor(c);
  vec2 t = c - f;
  return mix(mix(hc(f), hc(f + vec2(1.0, 0.0)), t.x), mix(hc(f + vec2(0.0, 1.0)), hc(f + vec2(1.0, 1.0)), t.x), t.y);
}
void main() {
  vec2 c0 = vUv * uN;
  float h0 = hb(c0);
  float lim = (uMax - h0) / uPente;
  float dt = max(0.6, lim / 120.0);
  float res = 1.0;
  float t = 1.2;
  for (int i = 0; i < 120; i++) {
    if (t > lim) break;
    vec2 c = c0 + uDir * t;
    if (c.x < 0.0 || c.y < 0.0 || c.x > uN || c.y > uN) break;
    float d = h0 + 0.02 + uPente * t - hc(c);
    res = min(res, d * uK / t / 0.035);
    t += dt;
  }
  res = clamp(res, 0.0, 1.0);
  gl_FragColor = vec4(vec3(res * res * (3.0 - 2.0 * res)), 1.0);
}`;

const VERT = /* glsl */ `
attribute float aH;
attribute float aShade;
attribute float aCrest;
attribute vec2 aGrad;
uniform float uZ;
uniform float uLift;
varying float vH;
varying float vShade;
varying float vCrest;
varying float vDepth;
varying vec2 vXY;
varying vec2 vGrad;
void main() {
  vec3 p = position;
  p.z = aH * uZ * uLift;
  vH = aH;
  vShade = aShade;
  vCrest = aCrest;
  vGrad = aGrad;
  vXY = position.xy;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

// Commun aux deux écritures : une courbe = la distance (en pixels) au multiple d'équidistance le plus proche
const COMMUN = /* glsl */ `
uniform float uStep;
uniform float uW;
uniform float uR0;
uniform float uR1;
uniform vec4 uTexte; // le bloc de texte du hero, en pixels de l'écran (gl_FragCoord)
uniform float uMarge;
varying float vH;
varying float vShade;
varying float vCrest;
varying float vDepth;
varying vec2 vXY;
float dist(float f) { return abs(fract(f - 0.5) - 0.5) / max(fwidth(f), 1e-5); }
float ligne(float f, float w) { return clamp(w * 0.5 + 0.5 - dist(f), 0.0, 1.0); }
uniform vec2 uTrait;
uniform float uFleur;
float fleur(float w) {
  vec2 q = (vXY - uTrait) / 100.0;
  float px = length(fwidth(q)) * 0.7071; // un pixel, en pas
  float j0 = floor(q.x / 0.8660254 + 0.5);
  float i0 = floor(q.y - 0.5 * j0 + 0.5);
  float a = 0.0;
  for (int di = -2; di <= 2; di++) {
    for (int dj = -2; dj <= 2; dj++) {
      float i = i0 + float(di);
      float j = j0 + float(dj);
      float hx = max(max(abs(i), abs(j)), abs(i + j)); // distance en pas sur le réseau
      vec2 c = vec2(0.8660254 * j, i + 0.5 * j);
      float d = abs(length(q - c) - 1.0) / px;
      float m = hx < 2.5 ? 1.0 : hx < 3.5 ? 0.6 : 0.0;
      a = max(a, clamp(w * 0.5 + 0.5 - d, 0.0, 1.0) * m);
    }
  }
  float dL = abs(length(q) - 4.0) / px;
  return max(a, clamp(w * 0.5 + 0.5 - dL, 0.0, 1.0) * 0.8);
}
float reserve() {
  return 1.0; // plus de réserve sous le texte du hero : le relief passe derrière lui
}`;

const FRAG_PLAN = /* glsl */ `
${COMMUN}
uniform vec3 uPapier;
uniform vec3 uEncre;
uniform float uEstomp;
uniform sampler2D uOmbre;
uniform float uSoleil;  // 0 : l'estompage des cartes (nord-ouest) ; 1 : le soleil du moment
uniform vec3 uSun;      // vers le soleil (x est, y nord, z haut)
uniform float uKn;      // pente vue pour un jour par pas
uniform float uNuit;
uniform float uPortee;
uniform float uCote;    // côté du relevé, en unités du monde
uniform float uHmax;
uniform float uCouchant; // le soleil bas (aube ou couchant) : 0 dans la journée, 1 au ras de l'horizon
uniform float uCrepus;   // passé l'horizon : 0 au coucher, 1 à la fin du crépuscule civil
uniform vec3 uCuivre;    // la lumière rasante, au bronze
uniform vec3 uRouge;     // la dernière lumière des sommets, au rouge des sentiers
varying vec2 vGrad;
void main() {
  float f = vH / uStep;
  float dense = fwidth(f);
  float fine = ligne(f, uW) * (1.0 - smoothstep(0.3, 0.75, dense)) * step(0.5, f);
  float maitresse = ligne(vH / ${MAITRESSE.toFixed(1)}, uW * 2.0) * step(1.0, vH);
  // Estompage : le versant au nord-ouest s'éclaire, l'autre se grise (vShade = 1 à plat).
  // Au soleil : le versant tourné vers lui s'éclaire, l'ombre propre et l'ombre portée se lavent de gris.
  vec3 nrm = normalize(vec3(-vGrad * uKn, 1.0));
  float lit = texture2D(uOmbre, vXY / uCote + 0.5).r;
  float propre = max(dot(nrm, uSun), 0.0) / max(uSun.z, 0.2);
  float portee = (1.0 - lit) * uPortee;
  float sh = mix(vShade, min(propre, 1.7) * (1.0 - portee * 0.85), uSoleil);
  sh = mix(sh, 0.45, uNuit * uSoleil);
  vec3 ombre = uPapier * vec3(0.5, 0.51, 0.55);
  vec3 clair = mix(uPapier, vec3(1.0), 0.45);
  vec3 c = uPapier;
  c = mix(c, ombre, clamp((1.0 - sh) * 1.4 * uEstomp, 0.0, 1.0));
  c = mix(c, clair, clamp((sh - 1.0) * 1.6 * uEstomp, 0.0, 1.0));
  // Le couchant : la lumière rasante se dore sur les versants tournés vers le soleil, l'ombre bleuit ; passé
  // l'horizon, la lumière remonte les versants en rougissant et ne tient plus qu'aux sommets, les plus hauts en dernier
  float seuil = uCrepus - 0.25;
  float tient = smoothstep(seuil, seuil + 0.18, clamp(vH / uHmax, 0.0, 1.0));
  float rayon = smoothstep(0.15, 1.1, propre) * mix(lit, 1.0, uCrepus) * tient * uCouchant;
  vec3 feu = mix(uCuivre, uRouge, uCrepus * 0.75);
  // le côté du relevé tourné vers le soleil reçoit encore le ciel du couchant, l'autre côté passe au bleu
  vec2 versSoleil = uSun.xy / max(length(uSun.xy), 1e-3);
  float cote = clamp(dot(vXY / uCote, versSoleil) * 1.6 + 0.5, 0.0, 1.0);
  vec3 bleu = uPapier * vec3(0.66, 0.68, 0.86);
  c = mix(c, c * vec3(0.84, 0.86, 0.98), uCouchant * (1.0 - rayon) * 0.35);
  c = mix(c, bleu * (0.7 + 0.5 * sh), uCouchant * uCrepus * (1.0 - rayon) * 0.7);
  c = mix(c, c * mix(vec3(1.0), feu / max(uPapier, vec3(0.05)), 0.55), uCouchant * cote * (1.0 - rayon) * 0.5);
  vec3 dore = mix(c, feu, 0.55) * (0.92 + 0.3 * clamp(propre - 0.6, 0.0, 1.0));
  c = mix(c, min(dore, vec3(1.0)), rayon);
  vec3 encre = mix(uEncre, feu * 0.55, rayon * 0.7);
  // Dans l'ombre portée, des hachures à 45° comme sur un plan : posées sur le terrain, elles tournent avec lui
  float fh = (vXY.x - vXY.y) / 3.2;
  float hach = ligne(fh, uW * 0.8) * (1.0 - smoothstep(0.25, 0.55, fwidth(fh))) * portee * uSoleil * (1.0 - uNuit);
  float bord = 1.0 - smoothstep(uR0, uR1, length(vXY));
  float r = reserve();
  c = mix(uPapier, c, bord * mix(0.35, 1.0, r));
  float a = max(max(fine * 0.5, maitresse * 0.9), hach * 0.4) * bord * mix(0.1, 1.0, r);
  float fl = fleur(uW * 1.1) * uFleur * 0.6 * bord * mix(0.1, 1.0, r) * (1.0 - min(1.0, fine + maitresse));
  c = mix(c, uEncre * 0.7, fl); // un gris plus foncé que l'encre des courbes
  gl_FragColor = vec4(mix(c, encre, a), 1.0);
}`;

const FRAG_FORGE = /* glsl */ `
${COMMUN}
uniform vec3 uCharbon;
uniform vec3 uBraise;
uniform float uHmax;
uniform float uIncand;
uniform float uFlou;
uniform float uFocus;
uniform sampler2D uOmbre;
uniform vec3 uLune;     // vers la lune (x est, y nord, z haut)
uniform float uLuneF;   // sa lumière : la part éclairée, nulle sous l'horizon
uniform float uKn;
uniform float uCote;
varying vec2 vGrad;
uniform vec2 uChaudXY;
uniform float uChaud;
uniform float uChaudR;
uniform float uVague;
uniform vec3 uOr;
void main() {
  float t = clamp(vH / uHmax, 0.0, 1.0);
  // La chaleur : l'altitude, les crêtes, la main posée sur un sommet, le souffle qui descend des crêtes
  float heat = pow(t, 1.4) * 0.8 + vCrest * 0.6 * smoothstep(0.5, 3.0, vH);
  vec2 dm = vXY - uChaudXY;
  heat += uChaud * exp(-dot(dm, dm) / (uChaudR * uChaudR)) * (0.4 + 0.8 * t);
  heat += 1.1 * exp(-pow((1.0 - t) - uVague, 2.0) / 0.012) * step(0.0, uVague) * smoothstep(0.03, 0.2, t);
  heat *= uIncand;
  // Profondeur de champ : loin du plan net, le trait s'élargit et pâlit d'autant (la lumière se répand)
  float coc = abs(vDepth - uFocus) / uFocus * uFlou * 9.0;
  float w = uW * (1.0 + coc);
  float f = vH / uStep;
  float dense = fwidth(f);
  float eteint = 1.0 - smoothstep(0.45, 1.1, dense);
  float fine = ligne(f, w) / (1.0 + coc * 0.75) * eteint * step(0.5, f);
  float maitresse = ligne(vH / ${MAITRESSE.toFixed(1)}, w * 1.7) / (1.0 + coc * 0.75) * step(1.0, vH);
  // Le sol : des courbes plus serrées, froides, qui s'éteignent sous les montagnes (la tôle entière est striée)
  float fs = vH / (uStep * 0.25);
  float sol = ligne(fs, w * 0.8) / (1.0 + coc * 0.75) * (1.0 - smoothstep(0.6, 1.4, vH)) * (1.0 - smoothstep(0.4, 1.0, fwidth(fs))) * step(0.5, fs);
  float halo = exp(-dist(f) / (2.2 + coc * 2.5)) * 0.4 * smoothstep(0.2, 1.0, heat) * eteint;
  vec3 froid = vec3(0.50, 0.47, 0.44);
  vec3 blanc = vec3(1.0, 0.90, 0.74);
  vec3 lc = heat < 0.55 ? mix(froid * 0.75, uBraise, smoothstep(0.08, 0.55, heat)) : mix(uBraise, blanc, clamp((heat - 0.55) * 1.3, 0.0, 1.0));
  float force = 0.55 + 0.9 * clamp(heat, 0.0, 1.4);
  // Au clair de lune : les versants tournés vers elle se teintent d'argent, l'ombre portée reste charbon
  vec3 nrm = normalize(vec3(-vGrad * uKn, 1.0));
  float lit = texture2D(uOmbre, vXY / uCote + 0.5).r;
  float clairLune = max(dot(nrm, uLune), 0.0) / max(uLune.z, 0.25) * mix(0.25, 1.0, lit);
  vec3 base = uCharbon * (0.45 + 0.85 * mix(vShade, 0.3 + 1.1 * clairLune, uLuneF * 0.9));
  base += vec3(0.60, 0.65, 0.74) * 0.17 * uLuneF * min(clairLune, 1.6);
  float bord = (1.0 - smoothstep(uR0, uR1, length(vXY))) * (1.0 - smoothstep(uFocus * 1.25, uFocus * 2.1, vDepth));
  float r = mix(0.12, 1.0, reserve());
  vec3 c = base + lc * force * (fine * 0.55 + maitresse * 0.9 + halo) * r + froid * 0.5 * sol * r;
  float fl = fleur(w) / (1.0 + coc * 0.75) * uFleur * 0.3 * r * (1.0 - min(1.0, fine + maitresse + halo));
  c += uOr * fl;
  gl_FragColor = vec4(mix(uCharbon, c, bord), 1.0);
}`;

const CSS = `
.c20 { position: absolute; inset: 0; pointer-events: none; }
.c20 canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.c20 .legende { position: absolute; right: 14px; bottom: 50px; width: 216px; margin: 0; padding: 10px 12px; background: color-mix(in srgb, var(--c20-papier) 90%, transparent); color: var(--c20-texte); font: 11px/1.25 var(--font-mono); letter-spacing: 0.02em; pointer-events: auto; }
.c20 .legende h3 { display: flex; justify-content: space-between; margin: 0 0 6px; font: inherit; font-weight: 500; text-decoration: underline; text-underline-offset: 3px; text-transform: uppercase; letter-spacing: 0.1em; font-size: 10px; }
.c20 .legende ol { list-style: none; margin: 0; padding: 0; }
.c20 .legende a { display: flex; align-items: baseline; gap: 6px; padding: 1.5px 0; color: inherit; text-decoration: none; opacity: 0.9; transition: opacity 0.2s ease, color 0.2s ease; }
.c20 .legende a i { flex: 1; border-bottom: 1px dotted currentColor; opacity: 0.35; transform: translateY(-3px); }
.c20 .legende a b { font-weight: 500; font-variant-numeric: tabular-nums; }
.c20 .legende a.on { opacity: 1; color: var(--c20-sentier); }
.c20 .legende p { margin: 8px 0 0; font-size: 10px; opacity: 0.8; }
.c20 .legende a.ici { opacity: 1; font-weight: 500; }
.c20 .legende a.pas-vu { opacity: 0.5; }
.c20 .legende h3 { cursor: grab; touch-action: none; user-select: none; }
.c20 .legende h3::before { content: ''; width: 9px; height: 9px; margin: 1px 6px 0 0; flex: none; opacity: 0.45; background: radial-gradient(circle, currentColor 0.8px, transparent 1.2px) 0 0 / 3px 3px; }
.c20 .legende h3 span:first-of-type { flex: 1; }
.c20 .legende.tenue { box-shadow: 0 6px 18px rgb(0 0 0 / 0.18); }
.c20 .legende.tenue h3 { cursor: grabbing; }
.c20[data-forge] .legende, .c20[data-forge] .horloge { color: #f3e2c8; }
.c20[data-forge] .legende a.on { color: var(--c20-braise); }
.c20 .horloge { position: absolute; right: 24px; top: 62px; width: 216px; padding: 8px 12px 9px; display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 2px 8px; background: color-mix(in srgb, var(--c20-papier) 90%, transparent); color: var(--c20-texte); font: 10px/1.3 var(--font-mono); letter-spacing: 0.02em; pointer-events: auto; transition: opacity 0.4s ease; }
.c20 .horloge span { text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }
.c20 .horloge output { font: italic 600 17px/1 var(--font-display); color: var(--c20-sentier); font-variant-numeric: tabular-nums; }
.c20[data-forge] .horloge output { color: var(--c20-or); }
.c20 .horloge input { grid-column: 1 / -1; width: 100%; margin: 4px 0 2px; accent-color: var(--c20-sentier); cursor: ew-resize; }
.c20[data-forge] .horloge input { accent-color: var(--c20-or); }
.c20 .horloge .rejouer { margin-top: 3px; color: var(--c20-sentier); }
.c20 .horloge button { grid-column: 1 / -1; justify-self: start; padding: 0; border: 0; background: none; color: inherit; font: inherit; letter-spacing: inherit; cursor: pointer; opacity: 0.85; }
.c20 .horloge button:hover { text-decoration: underline; text-underline-offset: 3px; }
.c20 .horloge button[aria-pressed="true"] { cursor: default; text-decoration: none; opacity: 0.6; }
.c20 .commandes { position: absolute; right: 24px; top: 22px; display: flex; align-items: flex-start; gap: 4px; pointer-events: auto; color: var(--c20-texte); }
.c20[data-forge] .commandes { color: #f3e2c8; }
.c20 .commandes button { width: 28px; height: 28px; padding: 0; border: 1px solid color-mix(in srgb, currentColor 35%, transparent); border-radius: 5px; background: color-mix(in srgb, currentColor 6%, transparent); color: inherit; font: 15px/1 var(--font-mono); cursor: pointer; transition: background 0.2s ease; }
.c20 .commandes button:hover { background: color-mix(in srgb, currentColor 16%, transparent); }
.c20 .commandes p { order: -1; margin: 0 8px 0 0; padding: 2px 6px; background: color-mix(in srgb, var(--c20-papier, transparent) 85%, transparent); font: 10px/1.6 var(--font-mono); letter-spacing: 0.02em; text-align: right; opacity: 0.8; }
@media (max-width: 900px) { .c20 .commandes p { display: none; } }
`;

// Hors du labo (/trace/, js/releve.js) : pas de hero autour, la vue part à plat sur la fleur dessinée par la page
// et se lève quand la page le demande.
//   site, nouvelOnglet : où mènent les sommets (par défaut le site en ligne, dans un autre onglet)
//   aplat : la vue part à plat et l'inclinaison suit le levage dans les deux écritures ; rien ne monte seul
//   cadre() → { x, y, px } : où tombe « Le trait » à l'écran et combien de pixels fait un pas, à plat
//   pilote : rempli ici de lever() et poser() (promesse tenue quand le relief est retombé à plat)
//   langue : 'fr' ou 'en' pour la légende et l'aide ; noms : les noms des pages dans cette langue
//   trace : les pages ([nom, pas, url]) à la place de TRACE ; le ciel se place avant par placerCiel()
//   jours : les jours de travail relevés à l'envoi ({ nom: jours }), à la place de ceux de trace-donnees.js
//   vues : les pages où le visiteur est passé (leurs noms) : son chemin se marque, le reste pâlit
//   instant : l'heure du ciel (ms) ; absent, le ciel suit l'heure de Paris en direct
//   surNuit({ theme, instant }) : appelé, relief levé, quand la nuit tombe sur le Plan coté ou que le jour se lève
//     sur la forge ; la page passe alors à l'autre écriture, à la même heure. pilote.instant() et
//     pilote.instantPour(theme) donnent l'heure à garder en changeant d'écriture.
const MOTS = {
  fr: { j: 'j', sommets: 'Sommets', jours: 'Jours', note: 'Altitude : jours de travail relevés dans git', chemin: 'En trait vif : votre chemin', ouvrir: 'clic : ouvrir', ech: '1 pas de compas',
    deplacer: 'Glisser pour déplacer · double-clic : remettre en place', paris: 'Heure de Paris', direct: '● en direct', maintenant: '↺ revenir à maintenant', curseur: 'Faire passer les heures', coucher: '☉ le coucher',
    lune: 'Lune', croissante: 'croissante', decroissante: 'décroissante', couchee: 'sous l’horizon',
    luneNote: 'La lune de Paris, sa phase et sa lumière : la nuit venue, la forge passe au clair de lune',
    soleil: 'Le soleil de Paris, à l’heure de Paris : faites passer les heures, les ombres suivent', ete: '21 juin', equi: 'équinoxes', hiver: '21 déc.', nuit: 'nuit', haut: 'haut.', cardinaux: ['N', 'E', 'S', 'O'],
    heure: (h, m) => `${h} h ${String(m).padStart(2, '0')}`, date: 'fr-FR',
    aide: 'Molette : approcher · clic droit : déplacer · glisser : tourner<br>clic sur un sommet : y aller, puis ouvrir · ← → (souris sur la carte) : sommet suivant',
    plus: 'Approcher', moins: 'Reculer', tout: 'Vue d’ensemble' },
  en: { j: 'd', sommets: 'Peaks', jours: 'Days', note: 'Altitude: working days, read from git', chemin: 'Bold line: your path', ouvrir: 'click: open', ech: '1 compass step',
    deplacer: 'Drag to move · double-click: put back', paris: 'Paris time', direct: '● live', maintenant: '↺ back to now', curseur: 'Move the hours', coucher: '☉ sunset',
    lune: 'Moon', croissante: 'waxing', decroissante: 'waning', couchee: 'below the horizon',
    luneNote: 'The Paris moon, its phase and its light: at nightfall the forge turns to moonlight',
    soleil: 'The Paris sun, on Paris time: move the hours, the shadows follow', ete: 'Jun 21', equi: 'equinoxes', hiver: 'Dec 21', nuit: 'night', haut: 'alt.', cardinaux: ['N', 'E', 'S', 'W'],
    heure: (h, m) => `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`, date: 'en-GB',
    aide: 'Wheel: zoom · right-click: move · drag: turn<br>click a peak: go there, then open · ← → (pointer on the map): next peak',
    plus: 'Zoom in', moins: 'Zoom out', tout: 'Whole view' },
};

export default function (stage, { variant, hero: ui, settings, modele, design, site = SITE, nouvelOnglet = true, aplat = false, trace, cadre: cadreImpose, pilote, langue = 'fr', noms = {}, vues, jours, instant = null, surNuit, voyage = false, ouvrir, surFocus, decalage }) {
  releverPages(jours ?? JOURS, trace);
  const s = settings.values;
  const forge = variant?.id === 'forge';
  // les mots du ciel nomment son lieu (Paris, sauf placerCiel)
  const mots = Object.fromEntries(Object.entries(MOTS[langue] ?? MOTS.fr).map(([k, v]) => [k, typeof v === 'string' ? v.replaceAll('Paris', LIEU) : v]));
  const nomDe = (p) => noms[p.nom] ?? p.nom;
  // Le chemin du visiteur : une page vue, un sentier parcouru (ses deux bouts vus) ; sans vues, tout est vu
  const vu = (k) => !vues || vues.includes(PAGES[k].nom);
  const parcouru = (k) => vu(k) && (PAGES[k].parent < 0 || vu(PAGES[k].parent));
  const ouvrirPage = (url) => (nouvelOnglet ? window.open(site + url, '_blank', 'noopener') : location.assign(site + url));
  // Le voyage (le site du relevé) : on vole d'un sommet à l'autre le long des cercles, le second clic ouvre la création sur place
  const ouvrirSommet = (k) => (ouvrir ? ouvrir(k) : ouvrirPage(PAGES[k].url));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab' // la taille à l'écran : sur un écran à pixels doublés, le canvas en compte deux fois plus;
  stage.append(renderer.domElement);

  // Le calque : sentiers, cotes et noms (canvas 2D), légende (HTML, des liens vers les pages)
  const calque = document.createElement('div');
  calque.className = 'c20';
  calque.innerHTML = `<style>${CSS}</style><canvas></canvas>`;
  const toile = calque.querySelector('canvas');
  const ctx = toile.getContext('2d');
  stage.append(calque);

  const legende = document.createElement('div');
  legende.className = 'legende';
  const rang = [...PAGES].sort((a, b) => b.j - a.j);
  const cible = nouvelOnglet ? ' target="_blank" rel="noopener"' : '';
  legende.innerHTML = `<h3><span>${mots.sommets}</span><span>${mots.jours}</span></h3><ol>${rang
    .map((p) => `<li><a href="${site}${p.url}"${cible} data-k="${p.k}"><span></span><i></i><b>${p.j}</b></a></li>`)
    .join('')}</ol><p>${mots.note}${vues ? `<br>${mots.chemin}` : ''}${forge ? `<br>☾ ${mots.luneNote}` : (s.soleil ?? 0) > 0 ? `<br>☉ ${mots.soleil}` : ''}</p>`;
  legende.querySelector('h3').title = mots.deplacer;
  legende.querySelectorAll('a').forEach((a) => {
    a.querySelector('span').textContent = nomDe(PAGES[+a.dataset.k]);
    a.addEventListener('pointerenter', () => (survolLegende = +a.dataset.k));
    a.addEventListener('pointerleave', () => (survolLegende = -1));
    a.addEventListener('click', (e) => {
      if (focus === +a.dataset.k && !ouvrir) return; // second clic : le lien s'ouvre
      if (focus === +a.dataset.k) return e.preventDefault(), ouvrirSommet(focus);
      e.preventDefault();
      allerA(+a.dataset.k);
    });
  });
  const lignes = [...legende.querySelectorAll('a')];
  lignes.forEach((a) => a.classList.toggle('pas-vu', !vu(+a.dataset.k)));
  if (forge) calque.dataset.forge = '';
  calque.append(legende);

  // La légende se prend par son titre et se pose où l'on veut ; sa place est gardée pour la prochaine fois
  const CLE_LEGENDE = 'dv-releve-legende';
  let legendePos = null; // { x, y } : son coin haut gauche, en pixels de la scène
  try {
    legendePos = JSON.parse(localStorage.getItem(CLE_LEGENDE) || 'null');
  } catch (e) {}
  function poserLegende() {
    if (!legendePos) return legende.style.removeProperty('left'), legende.style.removeProperty('top'), legende.style.removeProperty('right'), legende.style.removeProperty('bottom');
    const x = Math.min(Math.max(0, legendePos.x), Math.max(0, w - legende.offsetWidth));
    const y = Math.min(Math.max(0, legendePos.y), Math.max(0, h - legende.offsetHeight));
    Object.assign(legende.style, { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto' });
  }
  let tenue = null;
  const poignee = legende.querySelector('h3');
  poignee.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    const r = rectIn(legende, calque);
    tenue = { dx: e.clientX - r.x, dy: e.clientY - r.y };
    poignee.setPointerCapture(e.pointerId);
    legende.classList.add('tenue');
    e.preventDefault();
  });
  poignee.addEventListener('pointermove', (e) => {
    if (!tenue) return;
    const c = calque.getBoundingClientRect();
    legendePos = { x: e.clientX - c.left - tenue.dx, y: e.clientY - c.top - tenue.dy };
    poserLegende();
  });
  const lacher = () => {
    if (!tenue) return;
    tenue = null;
    legende.classList.remove('tenue');
    try {
      localStorage.setItem(CLE_LEGENDE, JSON.stringify(legendePos));
    } catch (e) {}
  };
  poignee.addEventListener('pointerup', lacher);
  poignee.addEventListener('pointercancel', lacher);
  poignee.addEventListener('dblclick', () => {
    legendePos = null;
    poserLegende();
    try {
      localStorage.removeItem(CLE_LEGENDE);
    } catch (e) {}
  });

  const readout = document.createElement('p');
  readout.className = 'print-caption';
  readout.style.cssText = 'right:24px;bottom:22px;font-variant-numeric:tabular-nums';
  readout.innerHTML = `<b>Relevé à chaud</b> · ${PAGES.length} sommets · altitude = jours de travail`;
  if (forge && ui) stage.append(readout);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 100000);
  const tilt = new THREE.Group();
  const spin = new THREE.Group();
  const content = new THREE.Group();
  tilt.add(spin);
  spin.add(content);
  scene.add(tilt);

  const uniforms = {
    uZ: { value: 1 },
    uLift: { value: 0 },
    uStep: { value: 0.5 },
    uW: { value: 1 },
    uR0: { value: 3.2 * S },
    uR1: { value: 4.8 * S },
    uTexte: { value: new THREE.Vector4(-1, -1, -1, -1) },
    uMarge: { value: 60 },
    uPapier: { value: new THREE.Vector3() },
    uEncre: { value: new THREE.Vector3() },
    uEstomp: { value: 0.6 },
    uCharbon: { value: new THREE.Vector3() },
    uBraise: { value: new THREE.Vector3() },
    uHmax: { value: MAXJ },
    uIncand: { value: 1 },
    uFlou: { value: 0.7 },
    uFocus: { value: 1000 },
    uChaudXY: { value: new THREE.Vector2() },
    uChaud: { value: 0 },
    uChaudR: { value: 40 },
    uVague: { value: -1 },
    uTrait: { value: new THREE.Vector2(PAGES[0].x * S, PAGES[0].y * S) },
    uFleur: { value: 1 },
    uOr: { value: new THREE.Vector3() },
    uOmbre: { value: null },
    uSoleil: { value: 0 },
    uSun: { value: new THREE.Vector3(0, 0, 1) },
    uKn: { value: 0 },
    uNuit: { value: 0 },
    uLune: { value: new THREE.Vector3(0, 0, 1) },
    uLuneF: { value: 0 },
    uPortee: { value: 0.75 },
    uCote: { value: 2 * E * S },
    uCouchant: { value: 0 },
    uCrepus: { value: 0 },
    uCuivre: { value: new THREE.Vector3() },
    uRouge: { value: new THREE.Vector3() },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: forge ? FRAG_FORGE : FRAG_PLAN, uniforms });
  let mesh = null;

  // Les ombres portées, calculées à part dans une image du relevé vu de dessus, refaite quand le soleil bouge
  const ombreRT = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: false });
  uniforms.uOmbre.value = ombreRT.texture;
  const ombreMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG_OMBRE,
    uniforms: { uH: { value: null }, uN: { value: 1 }, uDir: { value: new THREE.Vector2() }, uPente: { value: 1 }, uK: { value: 1 }, uMax: { value: 1 } },
  });
  const ombreScene = new THREE.Scene();
  ombreScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ombreMat));
  const ombreCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let hTex = null;
  let ombreCle = '';

  let colors = {};
  const vec = (hex) => new THREE.Vector3(...rgb(hex).map((c) => c / 255));
  function paint() {
    uniforms.uPapier.value.copy(vec(colors.papier));
    uniforms.uEncre.value.copy(vec(colors.encre));
    uniforms.uCharbon.value.copy(vec(colors.charbon));
    uniforms.uBraise.value.copy(vec(colors.braise));
    uniforms.uOr.value.copy(vec(colors.or));
    uniforms.uCuivre.value.copy(vec(colors.couchant ?? '#c98a52'));
    uniforms.uRouge.value.copy(vec(colors.sentier));
    renderer.setClearColor(forge ? colors.charbon : colors.papier);
    calque.style.setProperty('--c20-encre', colors.encre);
    calque.style.setProperty('--c20-texte', colors.texte);
    calque.style.setProperty('--c20-papier', forge ? colors.charbon : colors.papier);
    // L'encre du texte suit le fond de la variante (papier : texte sombre, charbon : texte clair), sauf thème imposé
    if (ui && (!design || design.values.theme === 'auto')) {
      const lin = rgb(forge ? colors.charbon : colors.papier).map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      ui.root.dataset.theme = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] > 0.18 ? 'light' : 'dark';
    }
    // Sur le Plan coté, le texte du hero prend la couleur « Texte » du modèle, même si le panneau Design impose une encre
    if (!ui);
    else if (forge) ui.root.style.removeProperty('--hero-ink'), ui.root.style.removeProperty('--hero-ink-soft');
    else ui.root.style.setProperty('--hero-ink', colors.texte), ui.root.style.setProperty('--hero-ink-soft', colors.texte);
    calque.style.setProperty('--c20-sentier', colors.sentier);
    calque.style.setProperty('--c20-braise', colors.braise);
    calque.style.setProperty('--c20-or', colors.or);
  }
  const detacher = brancherCouleurs({ modele, design, hero: ui }, emplacements, (c) => {
    colors = c;
    paint();
  });

  // ── Le terrain : la grille des altitudes (en jours), l'estompage, les crêtes ──
  let n = 0;
  let g = 1; // pas de la grille, en pas de compas
  let H = null;
  function terrain() {
    const nn = Math.round(s.finesse);
    g = (2 * E) / nn;
    const fresh = nn !== n;
    n = nn;
    const N = n + 1;
    H = new Float32Array(N * N);
    for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) H[iy * N + ix] = altitude(-E + ix * g, -E + iy * g, s);
    // L'estompage, éclairé du nord-ouest (convention des cartes), relief exagéré pour la lecture
    const shade = new Float32Array(N * N);
    const crest = new Float32Array(N * N);
    const grad = new Float32Array(N * N * 2); // la pente vraie, en jours par pas : la lumière du soleil
    const L =new THREE.Vector3(-1, 1, 1.25).normalize();
    const k = (2.8 * s.hauteur) / MAXJ;
    const K = 3; // les crêtes se lisent sur trois cases
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const i = iy * N + ix;
        const at = (x, y) => H[Math.min(n, Math.max(0, y)) * N + Math.min(n, Math.max(0, x))];
        const kk = k * (0.3 + 0.7 * smooth(0.6, 2.5, H[i])); // le sol à peine modelé, les montagnes pleinement
        const gx = (at(ix + 1, iy) - at(ix - 1, iy)) / (2 * g);
        const gy = (at(ix, iy + 1) - at(ix, iy - 1)) / (2 * g);
        grad[i * 2] = gx;
        grad[i * 2 + 1] = gy;
        const sx = gx * kk;
        const sy = gy * kk;
        const nz = 1 / Math.hypot(sx, sy, 1);
        shade[i] = Math.max(0, (-sx * L.x - sy * L.y + L.z) * nz) / L.z;
        const lap = (at(ix + K, iy) + at(ix - K, iy) + at(ix, iy + K) + at(ix, iy - K) - 4 * H[i]) / (K * g) ** 2;
        crest[i] = Math.min(1, Math.max(0, -lap / 90));
      }
    }
    if (fresh || !mesh) {
      mesh?.geometry.dispose();
      if (mesh) content.remove(mesh);
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(N * N * 3);
      for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) pos.set([(-E + ix * g) * S, (-E + iy * g) * S, 0], (iy * N + ix) * 3);
      const index = new Uint32Array(n * n * 6);
      let o = 0;
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          const a = iy * N + ix;
          index.set([a, a + 1, a + N, a + 1, a + N + 1, a + N], o);
          o += 6;
        }
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(new THREE.BufferAttribute(index, 1));
      mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      content.add(mesh);
    }
    mesh.geometry.setAttribute('aH', new THREE.BufferAttribute(H, 1));
    mesh.geometry.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
    mesh.geometry.setAttribute('aCrest', new THREE.BufferAttribute(crest, 1));
    mesh.geometry.setAttribute('aGrad', new THREE.BufferAttribute(grad, 2));
    {
      hTex?.dispose();
      hTex = new THREE.DataTexture(H, N, N, THREE.RedFormat, THREE.FloatType);
      hTex.needsUpdate = true;
      ombreMat.uniforms.uH.value = hTex;
      ombreMat.uniforms.uN.value = n;
      ombreMat.uniforms.uMax.value = MAXJ;
      ombreCle = '';
    }
    sentiers();
    cotes();
  }

  // L'altitude en un point (en pas), lue dans la grille
  function hAt(x, y) {
    const N = n + 1;
    const fx = Math.min(n - 1e-3, Math.max(0, (x + E) / g));
    const fy = Math.min(n - 1e-3, Math.max(0, (y + E) / g));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const u = fx - ix;
    const v = fy - iy;
    const a = H[iy * N + ix];
    const b = H[iy * N + ix + 1];
    const c = H[(iy + 1) * N + ix];
    const d = H[(iy + 1) * N + ix + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // Les sentiers : de la page d'où part le pas à la page où il arrive, un tracé qui serpente un peu, posé au sol
  let traces = []; // { k, pts: [[x, y, h]] }
  function sentiers() {
    traces = PAGES.filter((p) => p.parent >= 0).map((p) => {
      const a = PAGES[p.parent];
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const pts = [];
      for (let q = 0; q <= 48; q++) {
        const t = q / 48;
        const off = 0.09 * Math.sin(Math.PI * t) * bruit(t * 2.4 + p.k * 3.7, p.k * 1.3);
        const x = a.x + dx * t - dy * off;
        const y = a.y + dy * t + dx * off;
        pts.push([x, y, hAt(x, y)]);
      }
      return { k: p.k, pts };
    });
  }

  // Les cotes des maîtresses : on descend de chaque sommet dans la direction la plus libre de sentiers
  let cotesListe = []; // { x, y, h, tx, ty }
  function cotes() {
    cotesListe = [];
    for (const p of PAGES) {
      if (p.j < MAITRESSE + 0.6) continue;
      const voies = PAGES.filter((q) => q.parent === p.k || q.k === p.parent).map((q) => Math.atan2(q.y - p.y, q.x - p.x));
      let best = 0;
      let bestD = -1;
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2 + 0.13;
        const d = Math.min(Math.PI, ...voies.map((v) => Math.abs(((ang - v + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)));
        if (d > bestD + 1e-6) {
          bestD = d;
          best = ang;
        }
      }
      let prev = p.j;
      for (let r = 0.01; r < 1.6; r += 0.004) {
        const x = p.x + Math.cos(best) * r;
        const y = p.y + Math.sin(best) * r;
        const h = hAt(x, y);
        const lvl = Math.floor(prev / MAITRESSE) * MAITRESSE;
        if (lvl > 0 && h < lvl && prev >= lvl && p.j - lvl > 0.8) {
          // Le sens de la courbe : perpendiculaire à la pente
          const e = 0.01;
          const gx = hAt(x + e, y) - hAt(x - e, y);
          const gy = hAt(x, y + e) - hAt(x, y - e);
          cotesListe.push({ x, y, h: lvl, tx: -gy, ty: gx });
        }
        prev = h;
        if (h < MAITRESSE - 0.5) break;
      }
    }
  }

  // ── La vue ──
  let w = 1;
  let h = 1;
  let dpr = 1;
  let textRects = [];
  let mono = 'monospace';
  let avecLegende = false;
  let sans = 'sans-serif';
  let lift = 0;
  let liftV = 0;
  let target = aplat ? 0 : 1; // au labo, les deux s'ouvrent en relief : il monte à l'arrivée
  let yaw = 0;
  let userPitch = 0;
  let drag = null;
  let survol = -1;
  let survolLegende = -1;
  let chaud = 0;
  let vague = -1;
  // Naviguer : approcher (molette, + −), se déplacer (clic droit ou Maj), aller à un sommet (clic, ← →)
  let zoom = 1;
  let zoomT = 1;
  const pan = { x: 0, y: 0 };
  const panT = { x: 0, y: 0 };
  const goal = { x: 0, y: 0 };
  let decal = 0; // pixels réservés par la page à droite, en glissement
  let focus = -1; // le sommet où la vue s'est posée : un second clic ouvre sa page
  let D = 1000; // distance de la caméra, vue d'ensemble
  let pxPas = 100; // pixels pour un pas, vue d'ensemble
  const mouse = suivreSouris(renderer.domElement);
  const v3 = new THREE.Vector3();

  // Le ciel : à l'heure de Paris, en direct ; le curseur fait passer les heures du jour, « maintenant » y revient.
  // Le soleil (Plan coté) et la lune (forge) sont fixés au relevé, le nord en haut de la fleur : tourner le relief
  // fait tourner le ciel avec lui, les ombres restent où l'astre les porte.
  let direct = instant == null;
  let tCiel = direct ? Date.now() : instant;
  let astres = ciel(tCiel);
  let sun = astres.soleil;
  let cielVu = 0;
  let nuitSignalee = 0;
  let couchant = 0;
  let rejeu = null; // { t0, de, a } : le coucher du jour rejoué en accéléré
  const horloge = document.createElement('div');
  horloge.className = 'horloge';
  horloge.innerHTML = `<span>${forge ? '☾' : '☉'} ${mots.paris}</span><output></output><input type="range" min="0" max="1435" step="5" aria-label="${mots.curseur}"><button type="button"></button>${forge ? '' : `<button type="button" class="rejouer">${mots.coucher}</button>`}`;
  const curseur = horloge.querySelector('input');
  const affiche = horloge.querySelector('output');
  const retour = horloge.querySelector('button');
  // Le coucher du jour de Paris : la minute où le soleil passe l'horizon, puis celle où il atteint −6°
  function passage(deg, t) {
    const haut = (m) => Math.asin(ciel(instantParis(m, t)).soleil[2]) / RAD;
    let m = 12 * 60;
    while (m < 1439 && haut(m + 1) > deg) m++;
    return instantParis(m, t);
  }
  horloge.querySelector('.rejouer')?.addEventListener('click', () => {
    direct = false;
    const coucher = passage(0, tCiel);
    rejeu = { t0: performance.now(), de: coucher - 40 * 6e4, a: passage(-6.2, tCiel) + 2 * 6e4 };
    tCiel = rejeu.de;
    majHorloge();
  });
  let afficheMin = -1;
  function majHorloge() {
    const m = minutesParis(tCiel);
    if (direct || document.activeElement !== curseur) curseur.value = String(m);
    if (m !== afficheMin) {
      afficheMin = m;
      affiche.textContent = mots.heure(Math.floor(m / 60), m % 60);
    }
    if (retour.getAttribute('aria-pressed') !== String(direct)) {
      retour.textContent = direct ? mots.direct : mots.maintenant;
      retour.setAttribute('aria-pressed', String(direct));
    }
  }
  curseur.addEventListener('input', () => {
    direct = false;
    rejeu = null;
    tCiel = instantParis(+curseur.value, tCiel);
    majHorloge();
  });
  retour.addEventListener('click', () => {
    direct = true;
    rejeu = null;
    tCiel = Date.now();
    majHorloge();
  });
  if (forge || (s.soleil ?? 0) > 0) calque.append(horloge);
  majHorloge();
  // L'heure à garder quand la page change d'écriture : celle du ciel, ou une heure qui convient à l'autre écriture
  if (pilote) {
    pilote.instant = () => (direct ? null : tCiel);
    pilote.instantPour = (theme) => {
      const nuit = nuitA(tCiel);
      if (theme === 'clair' && nuit) return instantParis(12 * 60, tCiel);
      if (theme === 'sombre' && !nuit) return instantParis(23 * 60, tCiel);
      return direct ? null : tCiel;
    };
  }

  const underText = (x, y) => textRects.some((r) => x > r.x - 30 && x < r.x + r.width + 30 && y > r.y - 24 && y < r.y + r.height + 24);
  function mesurerTexte() {
    textRects = !ui ? [] : [...ui.text.querySelectorAll('.hero-inner > *')].map((el) => rectIn(el, renderer.domElement)).filter((r) => r.width);
    if (!textRects.length) return uniforms.uTexte.value.set(-1e4, -1e4, -1e4, -1e4);
    const x0 = Math.min(...textRects.map((r) => r.x));
    const x1 = Math.max(...textRects.map((r) => r.x + r.width));
    const y0 = Math.min(...textRects.map((r) => r.y));
    const y1 = Math.max(...textRects.map((r) => r.y + r.height));
    uniforms.uTexte.value.set(x0 * dpr, (h - y1) * dpr, x1 * dpr, (h - y0) * dpr);
    uniforms.uMarge.value = 70 * dpr;
  }

  function cadrer() {
    w = stage.clientWidth || 1;
    h = stage.clientHeight || 1;
    dpr = renderer.getPixelRatio();
    renderer.setSize(w, h, false);
    toile.width = Math.round(w * dpr);
    toile.height = Math.round(h * dpr);
    mesurerTexte();
    // La figure se pose au milieu de la place que laissent le texte (à gauche) et la légende (à droite)
    const textRight = Math.max(0, ...textRects.map((r) => r.x + r.width));
    const left = textRight && textRight < w * 0.6 ? textRight * 0.72 : 0;
    avecLegende = w > 1150;
    legende.style.display = avecLegende ? '' : 'none';
    poserLegende();
    const right = w - (avecLegende ? 216 + 60 : 24);
    const aw = Math.max(240, right - left);
    let goalX = (left + right) / 2;
    let goalY = h * 0.5;
    // Pixels pour un pas, à plat ; la vue rasante écrase la profondeur : on s'approche
    let px = Math.min((aw * 0.5) / 2.25, (h * 0.46) / 2.15) * (voyage ? 0.8 : 1); // le voyage part de plus haut
    if (cadreImpose) {
      // « Le trait » là où la page l'a dessiné : à plat, le relevé tombe exactement sur sa fleur
      const c = cadreImpose();
      px = c.px;
      goalX = c.x - PAGES[0].x * px;
      goalY = c.y + PAGES[0].y * px;
    }
    D = h / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / (px / S);
    camera.aspect = w / h;
    pxPas = px;
    camera.position.set(0, 0, D / zoom);
    camera.near = D * 0.05;
    camera.far = D * 6;
    goal.x = goalX;
    goal.y = goalY;
    camera.setViewOffset(w, h, w / 2 - (goalX - decal), h / 2 - goalY, w, h);
    camera.updateProjectionMatrix();
    uniforms.uFocus.value = D;
    const cs = getComputedStyle(calque);
    mono = cs.getPropertyValue('--font-mono').trim() || 'monospace';
    sans = cs.getPropertyValue('--font-display').trim() || 'sans-serif';
    filmStops = null;
  }

  const hauteurZ = () => (s.hauteur * S) / MAXJ; // unités du monde pour un jour, relief levé
  function pitchNow() {
    const base = (forge ? s.rasante : s.inclinaison) * (forge && !aplat ? 1 : Math.min(1, Math.max(0, lift)));
    return THREE.MathUtils.clamp(THREE.MathUtils.degToRad(base) + userPitch, 0, THREE.MathUtils.degToRad(82));
  }

  // Un point du terrain (en pas, altitude en jours) à l'écran
  function ecran(x, y, hj) {
    v3.set(x * S, y * S, hj * uniforms.uZ.value * uniforms.uLift.value).applyMatrix4(content.matrixWorld).project(camera);
    return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h, v3.z];
  }

  function trouverSommet() {
    if (!mouse.inside || drag) return -1;
    let best = -1;
    let bestD = 42;
    for (const p of PAGES) {
      const [x, y] = ecran(p.x, p.y, p.j);
      const d = Math.hypot(x - mouse.x, y - mouse.y);
      if (d < bestD) {
        bestD = d;
        best = p.k;
      }
    }
    return best;
  }

  // ── Le calque 2D ──
  // Un point hors du champ de la caméra (derrière elle, de près sur un sommet) se projette à l'envers : un trait vers lui
  // traverserait l'écran en diagonale. On ne trace que les segments dont les deux bouts sont dans le champ.
  const dansChamp = (z) => z > -1 && z < 1;
  const placees = [];
  const cotePris = new Map(); // le côté où chaque nom s'est posé à l'image d'avant
  const libre = (r) => !placees.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
  function dessiner(actif) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    placees.length = 0;
    const route = new Set(actif >= 0 ? chemin(actif) : []);
    const fade = (x, y) => (x < -40 || x > w + 40 || y < -40 || y > h + 40 ? 0 : 1);

    if (couchant > 0.01) embrase(couchant);
    if (cielVu > 0.01) voute(cielVu);

    // Les sentiers
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const t of traces) {
      const on = route.has(t.k);
      const fait = parcouru(t.k);
      ctx.beginPath();
      let leve = true;
      t.pts.forEach(([x, y, hj]) => {
        const [sx, sy, sz] = ecran(x, y, hj);
        if (!dansChamp(sz)) return (leve = true);
        leve ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        leve = false;
      });
      if (forge) {
        // le chemin du visiteur : des braises plus serrées et plus vives
        ctx.setLineDash(vues && fait ? [0.5, 4.5] : [0.5, 6]);
        ctx.lineWidth = on ? 2.4 : fait && vues ? 2.8 : 1.6;
        ctx.strokeStyle = colors.braise;
        ctx.globalAlpha = on ? 0.95 : !vues ? 0.32 : fait ? 1 : 0.14;
      } else {
        ctx.setLineDash([7, 5]);
        ctx.lineWidth = on ? 3 : fait ? 2 : 1.3;
        ctx.strokeStyle = colors.sentier;
        ctx.globalAlpha = on ? 0.95 : !fait ? 0.3 : actif < 0 ? 0.95 : 0.4;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Les cotes des maîtresses, dans une réserve de papier, lisibles dans le sens de la courbe
    if (!forge) {
      ctx.font = `10px ${mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const c of cotesListe) {
        const [x, y, z] = ecran(c.x, c.y, c.h);
        if (!fade(x, y) || underText(x, y) || !dansChamp(z)) continue;
        const [x2, y2] = ecran(c.x + c.tx * 0.5, c.y + c.ty * 0.5, c.h);
        let a = Math.atan2(y2 - y, x2 - x);
        if (a > Math.PI / 2) a -= Math.PI;
        if (a < -Math.PI / 2) a += Math.PI;
        const txt = String(c.h);
        const tw = ctx.measureText(txt).width + 6;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = colors.papier;
        ctx.globalAlpha = 0.92;
        ctx.fillRect(-tw / 2, -6, tw, 12);
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors.texte;
        ctx.fillText(txt, 0, 0.5);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // Les sommets : un point coté, le nom ; les plus hauts d'abord pour la place
    for (const p of rang) {
      const [x, y, z] = ecran(p.x, p.y, p.j);
      if (!fade(x, y) || !dansChamp(z)) continue;
      const on = p.k === actif;
      const cache = underText(x, y);
      const pale = !vu(p.k) && !on;
      if (forge) {
        const r = 2 + Math.sqrt(p.j / MAXJ) * 2.5 + (on ? 1.5 : 0);
        ctx.save();
        ctx.shadowColor = colors.braise;
        ctx.shadowBlur = on ? 22 : 12;
        ctx.fillStyle = on ? '#fff1d6' : '#ffd9a6';
        ctx.globalAlpha = cache ? 0.25 : pale ? 0.4 : 1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = colors.sentier;
        ctx.strokeStyle = colors.sentier;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = cache ? 0.3 : 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 5.5);
        ctx.lineTo(x + 5, y + 3.5);
        ctx.lineTo(x - 5, y + 3.5);
        ctx.closePath();
        pale ? ctx.stroke() : ctx.fill(); // un sommet où l'on n'est pas encore allé : évidé
        ctx.globalAlpha = 1;
      }
      if (cache) continue;
      // Le nom et la cote, à droite si la place est libre, sinon à gauche, au-dessus ou dessous
      const nom = forge ? nomDe(p).toUpperCase() : nomDe(p);
      const cote = forge ? `${p.j} ${mots.j}` : `${p.j}`;
      ctx.font = forge ? `500 10px ${mono}` : `italic 500 12.5px ${sans}`;
      const nw = ctx.measureText(nom).width;
      ctx.font = `10px ${mono}`;
      const cw = ctx.measureText(cote + (p.k === focus ? `  ·  ${mots.ouvrir} ↗ j` : "")).width;
      const bw = Math.max(nw, cw);
      const bh = 28;
      const essais = [
        [x + 9, y - 16],
        [x - 9 - bw, y - 16],
        [x - bw / 2, y - 12 - bh],
        [x - bw / 2, y + 8],
      ];
      const ok = ([bx, by]) => libre({ x: bx, y: by, w: bw, h: bh }) && !underText(bx + bw / 2, by + bh / 2);
      const avant = cotePris.get(p.k);
      const iPos = avant != null && ok(essais[avant]) ? avant : Math.max(0, essais.findIndex(ok));
      cotePris.set(p.k, iPos);
      const pos = essais[iPos];
      placees.push({ x: pos[0], y: pos[1], w: bw, h: bh });
      const droite = pos[0] < x - 4 && pos[0] + bw < x;
      ctx.textAlign = droite ? 'right' : 'left';
      const tx = droite ? pos[0] + bw : pos[0];
      ctx.textBaseline = 'alphabetic';
      if (forge) {
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = colors.charbon;
        ctx.fillRect(pos[0] - 4, pos[1], bw + 8, bh);
        ctx.globalAlpha = on ? 1 : actif >= 0 || pale ? 0.4 : 0.75;
        ctx.fillStyle = on ? '#fff1d6' : '#f3e2c8';
        ctx.font = `500 10px ${mono}`;
        ctx.fillText(nom, tx, pos[1] + 11);
        ctx.fillStyle = colors.braise;
        ctx.font = `10px ${mono}`;
        ctx.fillText(`${cote}${p.k === focus ? `  ·  ${mots.ouvrir.toUpperCase()} ↗` : ""}`, tx, pos[1] + 24);
      } else {
        // Une réserve de papier sous le nom, comme sur la carte
        ctx.font = `italic ${on ? 600 : 500} 12.5px ${sans}`;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = colors.papier;
        ctx.fillRect(tx - (droite ? nw + 2 : 2), pos[1] + 1, nw + 4, 14);
        ctx.globalAlpha = pale ? 0.55 : 1;
        ctx.fillStyle = on ? colors.sentier : colors.texte;
        ctx.fillText(nom, tx, pos[1] + 12);
        ctx.font = `10px ${mono}`;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = colors.texte;
        ctx.fillText(`${cote} ${mots.j}${p.k === focus ? `  ·  ${mots.ouvrir} ↗` : ""}`, tx, pos[1] + 25);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
    if (cielVu > 0.01) (forge ? lune : astre)(cielVu);

    // L'échelle graphique, sous la légende : un pas de compas, en noir et blanc alterné
    if (avecLegende) {
      const [ax, ay] = ecran(0, 0, 0);
      const lw = legende.offsetWidth;
      const [bx, by] = ecran(1, 0, 0);
      const [cx, cy] = ecran(0, 1, 0);
      const len = Math.max(Math.hypot(bx - ax, by - ay), Math.hypot(cx - ax, cy - ay));
      // sous la légende, où que la page l'ait posée
      const lr = legende.getBoundingClientRect();
      const sr = renderer.domElement.getBoundingClientRect();
      if (len > lw - 24) return; // de près, un pas déborderait de la légende : pas d'échelle
      const x0 = lr.right - sr.left - 12 - len;
      const y0 = lr.bottom - sr.top + 10;
      ctx.strokeStyle = encreV();
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, len, 4);
      ctx.fillStyle = encreV();
      for (let q = 0; q < 4; q += 2) ctx.fillRect(x0 + 0.5 + (q * len) / 4, y0 + 0.5, len / 4, 4);
      ctx.fillStyle = texteV();
      ctx.font = `10px ${mono}`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';
      ctx.fillText('0', x0, y0 + 9);
      ctx.fillText('½', x0 + len / 2, y0 + 9);
      ctx.fillText('1', x0 + len, y0 + 9);
      // le libellé dessous : sur une échelle courte, il couvrait les chiffres
      ctx.textAlign = 'right';
      ctx.fillText(mots.ech, x0 + len + 3, y0 + 22);
    }
  }

  // ── Le ciel, dessiné comme sur un plan d'architecte : l'horizon gradué et les points cardinaux ; le jour, les
  // trajectoires du 21 juin, des équinoxes et du 21 décembre en tirets, celle du jour en trait plein avec les
  // heures de Paris, le soleil ; la nuit (forge), la course de la lune ce jour-là, ses heures, sa phase.
  // Le tout est posé sur une voûte au-dessus du relevé et se lève avec lui ; ce qui passe derrière s'efface à moitié.
  const RD = 4.1; // rayon de l'horizon, en pas
  const encreV = () => (forge ? '#f3e2c8' : colors.encre);
  const texteV = () => (forge ? '#f3e2c8' : colors.texte);
  const accentV = () => (forge ? colors.or : colors.sentier);
  const fondV = () => (forge ? colors.charbon : colors.papier);
  function ecranM(x, y, z) {
    v3.set(x * S, y * S, z).applyMatrix4(content.matrixWorld).project(camera);
    return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h, v3.z];
  }
  const surVoute = (d) => ecranM(d[0] * RD, d[1] * RD, d[2] * RD * S * (s.dome ?? 0.55) * Math.max(0, lift));
  function course(decl, pas = 72) {
    const hd = demiJour(decl);
    return Array.from({ length: pas + 1 }, (_, q) => surVoute(soleilA(-hd + (2 * hd * q) / pas, decl)));
  }
  // Ce qui ne change qu'avec le jour de Paris : les heures du soleil, la course de la lune et ses heures
  let journee = null;
  function jourDuCiel() {
    const { jour, minuit } = paris(tCiel);
    if (journee?.jour === jour) return journee;
    const heures = Array.from({ length: 24 }, (_, hh) => ({ hh, ...ciel(minuit + hh * 36e5) }));
    const lunes = Array.from({ length: 145 }, (_, q) => ciel(minuit + q * 6e5).lune);
    const date = new Date(minuit + 12 * 36e5).toLocaleDateString(mots.date, { day: 'numeric', month: 'short', timeZone: FUSEAU });
    return (journee = { jour, heures, lunes, date });
  }
  // Un trait qui s'efface à moitié derrière le milieu du relevé ; les tirets continuent d'un segment à l'autre
  function trait(pts, alpha, tirets, zc) {
    ctx.setLineDash(tirets);
    let lg = 0;
    for (let q = 1; q < pts.length; q++) {
      const [ax, ay, az] = pts[q - 1];
      const [bx, by, bz] = pts[q];
      if (!dansChamp(az) || !dansChamp(bz)) continue;
      ctx.lineDashOffset = -lg;
      ctx.globalAlpha = alpha * (bz > zc ? 0.4 : 1);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      lg += Math.hypot(bx - ax, by - ay);
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
  function etiquette(txt, x, y, font, couleur, alpha, align = 'center') {
    if (underText(x, y)) return;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(txt).width;
    const x0 = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    ctx.globalAlpha = 0.85 * alpha;
    ctx.fillStyle = fondV();
    ctx.fillRect(x0 - 2, y - 7, tw + 4, 14);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = couleur;
    ctx.fillText(txt, x, y + 0.5);
  }
  // Les heures d'une course : un point et le chiffre, pour chaque heure pleine où l'astre est levé
  function heuresDe(dirs, a, zc) {
    for (const [hh, d] of dirs) {
      if (d[2] <= 0) continue;
      const [x, y, z] = surVoute(d);
      if (!dansChamp(z)) continue;
      ctx.fillStyle = accentV();
      ctx.globalAlpha = a * (z > zc ? 0.4 : 1);
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
      etiquette(String(hh), x, y + 10, `9px ${mono}`, accentV(), a * (z > zc ? 0.5 : 0.9));
    }
  }
  function voute(a) {
    const zc = ecranM(0, 0, 0)[2];
    const jd = jourDuCiel();
    const fa = forge ? 0.7 : 1; // sur le charbon, le dessin du ciel reste en retrait des courbes
    ctx.lineCap = 'butt';
    ctx.strokeStyle = encreV();
    // L'horizon et ses graduations : tous les 5°, plus longues tous les 15°, les points cardinaux
    ctx.lineWidth = 0.9;
    trait(Array.from({ length: 121 }, (_, q) => ecranM(Math.sin((q / 120) * 2 * Math.PI) * RD, Math.cos((q / 120) * 2 * Math.PI) * RD, 0)), 0.7 * a * fa, [], zc);
    for (let deg = 0; deg < 360; deg += 5) {
      const r = deg * RAD;
      const l = deg % 90 === 0 ? 0.16 : deg % 15 === 0 ? 0.09 : 0.045;
      const [ax, ay, az] = ecranM(Math.sin(r) * RD, Math.cos(r) * RD, 0);
      const [bx, by, bz] = ecranM(Math.sin(r) * (RD + l), Math.cos(r) * (RD + l), 0);
      if (!dansChamp(az) || !dansChamp(bz)) continue;
      ctx.globalAlpha = a * fa * (az > zc ? 0.35 : 0.75);
      ctx.lineWidth = deg % 15 === 0 ? 0.9 : 0.6;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    mots.cardinaux.forEach((c, q) => {
      const [x, y] = ecranM(Math.sin((q * Math.PI) / 2) * (RD + 0.3), Math.cos((q * Math.PI) / 2) * (RD + 0.3), 0);
      etiquette(c, x, y, `500 11px ${mono}`, texteV(), a);
    });
    if (forge) {
      // La course de la lune ce jour-là, par morceaux au-dessus de l'horizon, et ses heures
      ctx.strokeStyle = colors.or;
      ctx.lineWidth = 1.2;
      let morceau = [];
      const fin = () => {
        if (morceau.length > 1) trait(morceau, 0.8 * a, [], zc);
        morceau = [];
      };
      jd.lunes.forEach((d) => (d[2] > 0 ? morceau.push(surVoute(d)) : fin()));
      fin();
      heuresDe(jd.heures.map((o) => [o.hh, o.lune]), a, zc);
      const levee = jd.lunes.find((d) => d[2] > 0);
      if (levee) {
        const [x, y] = surVoute(levee);
        etiquette(jd.date, x, y - 12, `10px ${mono}`, colors.or, a);
      }
      ctx.globalAlpha = 1;
      return;
    }
    // Les trois courbes de référence, en tirets, nommées à midi
    ctx.lineWidth = 0.8;
    for (const [decl, nom] of [[OBLIQ, mots.ete], [0, mots.equi], [-OBLIQ, mots.hiver]]) {
      const pts = course(decl);
      trait(pts, 0.55 * a, [4, 4], zc);
      const [x, y] = pts[pts.length >> 1];
      etiquette(nom, x, y - 9, `10px ${mono}`, colors.texte, 0.75 * a);
    }
    // La course du jour, en trait plein, et les heures de Paris
    ctx.strokeStyle = colors.sentier;
    ctx.lineWidth = 1.3;
    const jour = course(astres.declS, 96);
    trait(jour, 0.9 * a, [], zc);
    heuresDe(jd.heures.map((o) => [o.hh, o.soleil]), a, zc);
    const [jx, jy] = jour[0];
    etiquette(jd.date, jx, jy - 12, `10px ${mono}`, colors.sentier, a);
    ctx.globalAlpha = 1;
  }
  // Le couchant au ciel : l'horizon s'embrase de part et d'autre de l'azimut du soleil, du bronze au rouge à mesure
  // que la nuit vient (la lumière posée sur le relevé, elle, est dans le shader)
  const feuDuCiel = () => {
    const k = uniforms.uCrepus.value * 0.75;
    const a = rgb(colors.couchant ?? '#c98a52');
    const b = rgb(colors.sentier);
    return a.map((v, q) => Math.round(v + (b[q] - v) * k));
  };
  function embrase(a) {
    const hz = Math.hypot(sun[0], sun[1]) || 1;
    const az = Math.atan2(sun[0] / hz, sun[1] / hz);
    const [fr, fg, fb] = feuDuCiel();
    const teinte = (al) => `rgba(${fr},${fg},${fb},${al})`;
    const zc = ecranM(0, 0, 0)[2];
    ctx.strokeStyle = teinte(1);
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    for (let q = -24; q < 24; q++) {
      const t0 = az + q * 2.2 * RAD;
      const t1 = t0 + 2.2 * RAD;
      const [ax, ay, za] = ecranM(Math.sin(t0) * RD, Math.cos(t0) * RD, 0);
      const [bx, by, zb] = ecranM(Math.sin(t1) * RD, Math.cos(t1) * RD, 0);
      if (!dansChamp(za) || !dansChamp(zb)) continue;
      const k = Math.exp(-(((q + 0.5) / 11) ** 2));
      ctx.globalAlpha = a * k * (za > zc ? 0.5 : 1);
      ctx.lineWidth = 0.9 + 3.2 * k;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const hauteurAz = (d) => {
    const az = ((Math.atan2(d[0], d[1]) / RAD + 360) % 360).toFixed(0);
    return `${mots.haut} ${(Math.asin(d[2]) / RAD).toFixed(0)}° · az. ${az}°`;
  };
  const heureDuCiel = () => {
    const m = minutesParis(tCiel);
    return mots.heure(Math.floor(m / 60), m % 60);
  };
  // Le soleil : un disque cerclé, ses rayons, le rayon qui descend jusqu'au milieu du relevé, l'heure et sa hauteur
  function astre(a) {
    const elev = Math.asin(sun[2]);
    const nuit = elev < 0;
    const d = nuit ? [sun[0] / Math.hypot(sun[0], sun[1]), sun[1] / Math.hypot(sun[0], sun[1]), 0] : sun;
    const [x, y, z] = surVoute(d);
    const [ox, oy, oz] = ecranM(0, 0, 0);
    const [px, py, pz] = ecranM(d[0] * RD, d[1] * RD, 0);
    if (!dansChamp(z)) return;
    ctx.strokeStyle = colors.sentier;
    ctx.lineWidth = 0.9;
    if (!nuit) {
      ctx.setLineDash([2, 4]);
      ctx.globalAlpha = 0.6 * a;
      ctx.beginPath();
      if (dansChamp(oz)) ctx.moveTo(x, y), ctx.lineTo(ox, oy);
      if (dansChamp(pz)) ctx.moveTo(x, y), ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = a * (nuit ? 0.5 : 1);
    ctx.fillStyle = colors.papier;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, 7.5, 0, Math.PI * 2);
    ctx.fill();
    if (couchant > 0.01) {
      // bas sur l'horizon, le disque se charge de la lumière qu'il donne
      const [fr, fg, fb] = feuDuCiel();
      ctx.fillStyle = `rgba(${fr},${fg},${fb},${0.85 * couchant})`;
      ctx.fill();
    }
    ctx.stroke();
    if (!nuit) {
      ctx.fillStyle = colors.sentier;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let q = 0; q < 8; q++) {
        const r = (q * Math.PI) / 4;
        ctx.moveTo(x + Math.cos(r) * 10.5, y + Math.sin(r) * 10.5);
        ctx.lineTo(x + Math.cos(r) * 14.5, y + Math.sin(r) * 14.5);
      }
      ctx.stroke();
    }
    etiquette(heureDuCiel(), x + 20, y - 6, `italic 600 13px ${sans}`, colors.sentier, a, 'left');
    etiquette(nuit ? mots.nuit : hauteurAz(sun), x + 20, y + 9, `10px ${mono}`, colors.texte, a, 'left');
    ctx.globalAlpha = 1;
  }
  // La lune : son disque avec sa vraie phase (la part éclairée, du côté du soleil), un halo, le rayon jusqu'au relevé
  function lune(a) {
    const m = astres.lune;
    const levee = m[2] > 0;
    const hz = Math.hypot(m[0], m[1]) || 1;
    const d = levee ? m : [m[0] / hz, m[1] / hz, 0];
    const [x, y, z] = surVoute(d);
    if (!dansChamp(z)) return;
    const r = 9;
    if (levee) {
      const [ox, oy, oz] = ecranM(0, 0, 0);
      ctx.strokeStyle = colors.or;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 5]);
      ctx.globalAlpha = 0.45 * a;
      ctx.beginPath();
      if (dansChamp(oz)) ctx.moveTo(x, y), ctx.lineTo(ox, oy);
      ctx.stroke();
      ctx.setLineDash([]);
      const [or1, or2, or3] = rgb(colors.or);
      const halo = ctx.createRadialGradient(x, y, r, x, y, r * 4.5);
      halo.addColorStop(0, `rgba(${or1}, ${or2}, ${or3}, ${0.22 * astres.eclairee})`);
      halo.addColorStop(1, `rgba(${or1}, ${or2}, ${or3}, 0)`);
      ctx.globalAlpha = a;
      ctx.fillStyle = halo;
      ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    }
    ctx.globalAlpha = a * (levee ? 1 : 0.45);
    // le disque sombre cerclé, puis la part éclairée : un demi-disque et l'ellipse du terminateur
    const k = astres.eclairee;
    const c = astres.croissante;
    // le côté éclairé regarde le soleil, tel qu'on le voit à l'écran
    const vs = m.map((v, q) => v + 0.15 * (sun[q] - v));
    const [sx, sy] = surVoute(vs.map((v) => v / Math.hypot(...vs)));
    disque(x, y, r, k, Math.atan2(sy - y, sx - x));
    luneEcran = [x, y];
    const phase = `${Math.round(k * 100)} % · ${c ? mots.croissante : mots.decroissante}`;
    etiquette(`${mots.lune} · ${heureDuCiel()}`, x + 20, y - 6, `italic 600 13px ${sans}`, colors.or, a, 'left');
    etiquette(levee ? `${hauteurAz(m)} · ${phase}` : `${mots.couchee} · ${phase}`, x + 20, y + 9, `10px ${mono}`, '#f3e2c8', a, 'left');
    if (luneTenue > 0.01) mois(x + 20, y + 26, a * luneTenue);
    ctx.globalAlpha = 1;
  }
  // Un disque de lune : cerclé d'or, la part éclairée k tournée vers l'angle donné (un demi-disque et le terminateur)
  function disque(x, y, r, k, angle) {
    ctx.fillStyle = colors.charbon;
    ctx.strokeStyle = colors.or;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = colors.or;
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.ellipse(0, 0, Math.abs(1 - 2 * k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k < 0.5);
    ctx.fill();
    ctx.restore();
  }
  // La touche finale : la main sur la lune déroule son mois, neuf phases de quatre jours en quatre jours, ce soir au
  // milieu, cerclé ; croissante éclairée à droite, décroissante à gauche, comme au calendrier
  let luneEcran = null;
  let luneTenue = 0;
  let moisCache = null;
  function mois(x0, y0, a) {
    const cle = Math.round(tCiel / 36e5);
    if (moisCache?.cle !== cle) {
      moisCache = {
        cle,
        jours: Array.from({ length: 9 }, (_, q) => {
          const t = tCiel + (q - 4) * 3.69 * 864e5;
          const c = ciel(t);
          return { k: c.eclairee, croissante: c.croissante, date: new Date(t).toLocaleDateString(mots.date, { day: 'numeric', month: 'numeric', timeZone: FUSEAU }) };
        }),
      };
    }
    const pas = 30;
    ctx.globalAlpha = 0.9 * a;
    ctx.fillStyle = colors.charbon;
    ctx.fillRect(x0 - 6, y0 - 4, pas * 9 + 4, 46);
    moisCache.jours.forEach((j, q) => {
      const x = x0 + 9 + q * pas;
      const y = y0 + 12;
      ctx.globalAlpha = a * (q === 4 ? 1 : 0.75);
      disque(x, y, q === 4 ? 8 : 6.5, j.k, j.croissante ? 0 : Math.PI);
      if (q === 4) {
        ctx.strokeStyle = colors.or;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = a * (q === 4 ? 1 : 0.6);
      ctx.fillStyle = q === 4 ? colors.or : '#f3e2c8';
      ctx.font = `9px ${mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(j.date, x, y + 22);
    });
  }

  // ── L'image ──
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    liftV += ((target - lift) * s.raideur - liftV * s.amorti) * dt;
    lift += liftV * dt;
    if (Math.abs(liftV) < 1e-4 && Math.abs(target - lift) < 1e-4) {
      lift = target;
      liftV = 0;
    }
    // Reposé : on rend la main quand le relief touche le plan, vue d'ensemble revenue
    if (retombe && lift < 0.01 && Math.abs(zoom - 1) < 0.01 && Math.hypot(pan.x, pan.y) < 1 && Math.abs(yaw) < 0.01) {
      lift = 0;
      liftV = 0;
      retombe();
      retombe = null;
    }
    uniforms.uZ.value = hauteurZ();
    uniforms.uLift.value = Math.max(0, lift);
    uniforms.uStep.value = s.equidistance;
    uniforms.uW.value = s.trait * dpr;
    uniforms.uEstomp.value = s.estompage;
    uniforms.uIncand.value = s.incandescence;
    uniforms.uFlou.value = s.flou;
    uniforms.uFleur.value = s.fleur;
    tilt.rotation.x = -pitchNow();
    spin.rotation.z = yaw;
    content.position.z = -0.3 * s.hauteur * S * Math.max(0, lift); // tourner autour du milieu du relief
    avancerVol(dt);
    if (vol) zoom = zoomT;
    // la page peut réserver une place (la création ouverte) : la vue glisse de côté
    const dec = decalage ? decalage() : 0;
    if (Math.abs(dec - decal) > 0.2) {
      decal += (dec - decal) * Math.min(1, dt * 5);
      camera.setViewOffset(w, h, w / 2 - (goal.x - decal), h / 2 - goal.y, w, h);
      camera.updateProjectionMatrix();
    }
    zoom += (zoomT - zoom) * Math.min(1, dt * 7);
    pan.x += (panT.x - pan.x) * Math.min(1, dt * 6);
    pan.y += (panT.y - pan.y) * Math.min(1, dt * 6);
    content.position.x = pan.x;
    content.position.y = pan.y;
    // Levé, on s'approche d'un tiers : la vue de biais écrase la profondeur ; à plat, tout le plan tient
    const proche = zoom * (1 + 0.3 * Math.min(1, Math.max(0, lift)));
    camera.position.z = D / proche;
    uniforms.uFocus.value = D / proche;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();

    // Le ciel : il paraît avec le relief levé, à l'heure de Paris ; les ombres se refont quand l'astre bouge
    // (le soleil sur le Plan coté, la lune sur la forge) ou que le relief monte
    if (direct) tCiel = Date.now();
    if (rejeu) {
      // le coucher rejoué : quarante minutes avant l'horizon jusqu'à la fin du crépuscule, en quatorze secondes
      const p = Math.min(1, (now - rejeu.t0) / 14000);
      tCiel = rejeu.de + (rejeu.a - rejeu.de) * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2) * 0.6 + (rejeu.a - rejeu.de) * p * 0.4;
      if (p >= 1) rejeu = null;
    }
    astres = ciel(tCiel);
    sun = astres.soleil;
    majHorloge();
    const vuLeve = smooth(0.15, 0.85, lift);
    cielVu = forge ? vuLeve : (s.soleil ?? 0) * vuLeve;
    horloge.style.opacity = String(vuLeve);
    horloge.style.pointerEvents = vuLeve > 0.5 ? 'auto' : 'none';
    uniforms.uSoleil.value = forge ? 0 : cielVu;
    const lumiere = forge ? astres.lune : sun;
    const elev = Math.asin(lumiere[2]);
    uniforms.uNuit.value = smooth(0.03, -0.06, Math.asin(sun[2]));
    const hautDeg = Math.asin(sun[2]) / RAD;
    couchant = forge ? 0 : cielVu * smooth(14, 2, hautDeg) * smooth(-6.5, -4.5, hautDeg);
    uniforms.uCouchant.value = couchant;
    uniforms.uCrepus.value = smooth(0.3, -6, hautDeg);
    uniforms.uLune.value.set(lumiere[0], lumiere[1], Math.max(lumiere[2], 0.01)).normalize();
    uniforms.uLuneF.value = forge ? cielVu * (0.25 + 0.75 * astres.eclairee) * smooth(-0.02, 0.12, elev) : 0;
    if (cielVu > 0) {
      uniforms.uPortee.value = s.portee ?? 0.75;
      const zw = uniforms.uZ.value * Math.max(0, lift); // un jour, en unités du monde
      uniforms.uKn.value = zw / S;
      const e = Math.max(elev, 0.01);
      uniforms.uSun.value.set(sun[0], sun[1], Math.max(sun[2], 0.01)).normalize();
      const cle = `${lumiere.map((v) => v.toFixed(3))}|${lift.toFixed(3)}|${s.hauteur}`;
      if (cle !== ombreCle && zw > 1e-3) {
        ombreCle = cle;
        const gw = g * S; // une case, en unités du monde
        const hz = Math.hypot(lumiere[0], lumiere[1]) || 1;
        ombreMat.uniforms.uDir.value.set(lumiere[0] / hz, lumiere[1] / hz);
        ombreMat.uniforms.uPente.value = (Math.tan(e) * gw) / zw;
        ombreMat.uniforms.uK.value = zw / gw;
        renderer.setRenderTarget(ombreRT);
        renderer.render(ombreScene, ombreCam);
        renderer.setRenderTarget(null);
      }
    }
    // La nuit tombe sur le Plan coté, le jour se lève sur la forge : la page passe à l'autre écriture, à la même heure
    if (surNuit && lift > 0.9 && !retombe && nuitA(tCiel) !== forge && now - nuitSignalee > 3000) {
      nuitSignalee = now;
      surNuit({ theme: forge ? 'clair' : 'sombre', instant: direct ? null : tCiel });
    }

    survol = trouverSommet();
    // la main sur la lune (forge) : son mois se déroule sous elle
    const surLune = forge && luneEcran && mouse.inside && !drag && Math.hypot(mouse.x - luneEcran[0], mouse.y - luneEcran[1]) < 18;
    luneTenue += ((surLune ? 1 : 0) - luneTenue) * Math.min(1, dt * (surLune ? 8 : 3));
    const actif = survol >= 0 ? survol : survolLegende;
    lignes.forEach((a) => {
      a.classList.toggle('on', +a.dataset.k === actif);
      a.classList.toggle('ici', +a.dataset.k === focus);
    });
    // La forge : le sommet sous la main chauffe, le souffle descend des crêtes
    if (actif >= 0) {
      const p = PAGES[actif];
      uniforms.uChaudXY.value.set(p.x * S, p.y * S);
      uniforms.uChaudR.value = s.largeur * (0.6 + 0.8 * Math.sqrt(p.j / MAXJ)) * S;
    }
    chaud += ((actif >= 0 ? 1 : 0) - chaud) * Math.min(1, dt * (actif >= 0 ? 5 : 2));
    uniforms.uChaud.value = chaud;
    if (vague >= 0) {
      vague += dt * 0.55;
      if (vague > 1.3) vague = -1;
    }
    uniforms.uVague.value = vague;

    renderer.domElement.style.cursor = drag ? 'grabbing' : survol >= 0 ? 'pointer' : 'grab';
    renderer.render(scene, camera);
    dessiner(actif);
  }

  // La main du film des heros (outils/filmer-heros.mjs) : de sommet en sommet, les quatre plus hauts qu'on voit
  let filmStops = null;
  function mainDuFilm(t) {
    if (!filmStops) {
      const seen = rang
        .map((p) => ecran(p.x, p.y, p.j))
        .filter(([x, y]) => x > w * 0.08 && x < w * 0.94 && y > h * 0.1 && y < h * 0.9 && !underText(x, y))
        .slice(0, 4);
      const cx = seen.reduce((a, o) => a + o[0], 0) / (seen.length || 1);
      const cy = seen.reduce((a, o) => a + o[1], 0) / (seen.length || 1);
      filmStops = seen.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    }
    if (!filmStops.length) return null;
    const m = filmStops.length;
    const ph = (((t % 1) + 1) % 1) * m;
    const i = Math.floor(ph);
    const k = THREE.MathUtils.smoothstep(ph - i, 0.6, 1);
    const [ax, ay] = filmStops[i];
    const [bx, by] = filmStops[(i + 1) % m];
    const r = renderer.domElement.getBoundingClientRect();
    return [(r.left + ax + (bx - ax) * k) / innerWidth, (r.top + ay + (by - ay) * k) / innerHeight];
  }
  window.__mainDuFilm = mainDuFilm;

  // ── Les gestes ──
  const onDown = (e) => {
    if (e.button > 2) return;
    if (e.button === 1) e.preventDefault();
    drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.button > 0 || e.shiftKey };
    if (e.button > 0 || e.shiftKey) vol = null; // la main reprend la carte : le vol s'arrête
    renderer.domElement.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.pan) {
      // L'écran ramené sur le plan : la main tire la carte
      const ppw = (pxPas / S) * zoom * (1 + 0.3 * Math.min(1, Math.max(0, lift)));
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const right = dx / ppw;
      const fore = -dy / ppw / Math.max(0.35, Math.cos(pitchNow()));
      panT.x = THREE.MathUtils.clamp(panT.x + right * c + fore * sn, -3 * S, 3 * S);
      panT.y = THREE.MathUtils.clamp(panT.y - right * sn + fore * c, -3 * S, 3 * S);
      pan.x = panT.x;
      pan.y = panT.y;
      focus = -1;
    } else {
      yaw += dx * 0.006;
      userPitch = THREE.MathUtils.clamp(userPitch + dy * 0.004, -1.2, 1.2);
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const onUp = () => {
    // Un clic sans glisser sur un sommet : la vue s'y pose ; un second clic ouvre sa page
    if (drag && drag.moved < 4 && !drag.pan && survol >= 0) allerA(survol);
    drag = null;
  };
  function allerA(k) {
    if (focus === k) return ouvrirSommet(k);
    if (voyage) return voler(k);
    const p = PAGES[k];
    focus = k;
    surFocus?.(k);
    panT.x = -p.x * S;
    panT.y = -p.y * S;
    zoomT = Math.max(zoomT, 2.3);
  }
  // Le vol : de là où l'on regarde au sommet k, le long d'un cercle de la fleur (rayon un pas de compas) qui passe par
  // les deux, centré sur le croisement le plus proche d'une page ; au-delà de deux pas, en ligne à peine courbée.
  // La vue recule un peu au milieu du vol et se repose sur le sommet.
  let vol = null;
  function voler(k) {
    const p = PAGES[k];
    const a = { x: -panT.x / S, y: -panT.y / S };
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    const d = Math.hypot(dx, dy);
    focus = -1;
    surFocus?.(-1);
    if (d < 1e-3) return (focus = k), surFocus?.(k);
    let centre = null;
    if (d <= 2) {
      const m = { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 };
      const hh = Math.sqrt(Math.max(0, 1 - (d / 2) ** 2));
      const cands = [1, -1].map((sg) => ({ x: m.x - (dy / d) * hh * sg, y: m.y + (dx / d) * hh * sg }));
      const pres = (c) => Math.min(...PAGES.map((q) => Math.hypot(q.x - c.x, q.y - c.y)));
      centre = pres(cands[0]) <= pres(cands[1]) ? cands[0] : cands[1];
    }
    const z0 = Math.max(zoomT, 1.75);
    const enVol = !!vol;
    vol = { k, a, p, centre, t0: performance.now(), t: 0, duree: (enVol ? 1 : 1.2) + 0.35 * Math.min(d, 4), z0, elan: enVol };
  }
  function avancerVol(dt) {
    if (!vol) return;
    vol.t = Math.min(1, (performance.now() - vol.t0) / 1000 / vol.duree); // l'horloge vraie : le vol garde sa durée même quand les images ralentissent
    // doux au départ et à l'arrivée ; relancé en plein vol, il part lancé et ne fait que se poser
    const u = vol.elan ? 1 - (1 - vol.t) ** 3 : vol.t < 0.5 ? 4 * vol.t ** 3 : 1 - (-2 * vol.t + 2) ** 3 / 2;
    let x;
    let y;
    if (vol.centre) {
      const c = vol.centre;
      const a0 = Math.atan2(vol.a.y - c.y, vol.a.x - c.x);
      let da = Math.atan2(vol.p.y - c.y, vol.p.x - c.x) - a0;
      da = ((da + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      x = c.x + Math.cos(a0 + da * u);
      y = c.y + Math.sin(a0 + da * u);
    } else {
      const bx = -(vol.p.y - vol.a.y) * 0.12;
      const by = (vol.p.x - vol.a.x) * 0.12;
      const b = Math.sin(Math.PI * u);
      x = vol.a.x + (vol.p.x - vol.a.x) * u + bx * b;
      y = vol.a.y + (vol.p.y - vol.a.y) * u + by * b;
    }
    panT.x = pan.x = -x * S;
    panT.y = pan.y = -y * S;
    zoomT = vol.z0 * (1 - 0.28 * Math.sin(Math.PI * u));
    if (vol.t >= 1) {
      focus = vol.k;
      zoomT = vol.z0;
      vol = null;
      surFocus?.(focus);
    }
  }
  function ensemble() {
    vol = null;
    if (focus >= 0) surFocus?.(-1);
    focus = -1;
    panT.x = panT.y = 0;
    zoomT = 1;
    yaw = 0;
    userPitch = 0;
  }
  const approcher = (f) => (zoomT = THREE.MathUtils.clamp(zoomT * f, 0.6, 6));
  const onDouble = () => ensemble();
  const onWheel = (e) => {
    e.preventDefault();
    approcher(Math.exp(-e.deltaY * 0.0015));
  };
  const onMenu = (e) => e.preventDefault();
  // Au clavier, la main sur la carte (sinon les flèches restent au labo et à la galerie) : ← → d'un sommet à l'autre (du plus haut au plus bas), + − pour approcher, Échap : vue d'ensemble
  const onKey = (e) => {
    if (!mouse.inside || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.stopImmediatePropagation();
      const ordre = voyage ? PAGES : rang; // dans le voyage, l'ordre du tracé
      const i = ordre.findIndex((p) => p.k === focus);
      const n = ordre.length;
      const j = i < 0 ? 0 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
      focus = -1;
      allerA(ordre[j].k);
      e.preventDefault();
    } else if (e.key === 'Escape') ensemble();
    else if (e.key === '+' || e.key === '=') approcher(1.3);
    else if (e.key === '-') approcher(1 / 1.3);
  };
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  renderer.domElement.addEventListener('contextmenu', onMenu);
  addEventListener('keydown', onKey, true);

  // Les commandes à l'écran : approcher, reculer, vue d'ensemble, et l'aide
  const commandes = document.createElement('div');
  commandes.className = 'commandes';
  commandes.innerHTML =
    `<button type="button" data-a="plus" aria-label="${mots.plus}">+</button><button type="button" data-a="moins" aria-label="${mots.moins}">−</button><button type="button" data-a="tout" aria-label="${mots.tout}">⌂</button><p>${mots.aide}</p>`;
  commandes.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'plus') approcher(1.4);
    else if (a === 'moins') approcher(1 / 1.4);
    else if (a === 'tout') ensemble();
  });
  calque.append(commandes);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);
  renderer.domElement.addEventListener('dblclick', onDouble);

  // Le bouton : lever le relief ou le reposer (Plan coté), souffler sur la forge
  const cta = ui?.text.querySelector('.hero-cta');
  const onCta = () => {
    if (forge) {
      vague = 0;
      return;
    }
    target = target < 0.5 ? 1 : 0;
    userPitch = 0;
    if (cta) cta.textContent = target ? 'Voir le plan' : 'Lever le relief';
  };
  cta?.addEventListener('click', onCta);

  // La page qui accueille le relevé le lève et le repose (aplat)
  let retombe = null;
  if (pilote) {
    pilote.lever = () => {
      target = 1;
      retombe = null;
    };
    pilote.poser = () =>
      new Promise((fin) => {
        ensemble();
        target = 0;
        retombe = fin;
      });
    pilote.cadrer = () => cadrer();
    pilote.allerA = (k) => allerA(k);
    pilote.ensemble = () => ensemble();
    pilote.pause = (oui) => renderer.setAnimationLoop(oui ? null : (t) => tick(t));
  }

  terrain();
  cadrer();
  const remesure = setTimeout(mesurerTexte, 900); // le texte du hero entre en scène : on le remesure posé
  renderer.setAnimationLoop(tick);
  let attente = 0;
  const refaire = () => {
    clearTimeout(attente);
    attente = setTimeout(terrain, 120);
  };
  settings.watch(['pointe', 'largeur', 'ravines', 'finesse'], refaire);
  settings.watch(['hauteur'], refaire); // l'estompage suit l'exagération
  addEventListener('resize', cadrer);

  return () => {
    renderer.setAnimationLoop(null);
    clearTimeout(remesure);
    clearTimeout(attente);
    detacher();
    mouse.detacher();
    renderer.domElement.removeEventListener('pointerdown', onDown);
    renderer.domElement.removeEventListener('pointermove', onMove);
    renderer.domElement.removeEventListener('pointerup', onUp);
    renderer.domElement.removeEventListener('pointercancel', onUp);
    renderer.domElement.removeEventListener('dblclick', onDouble);
    renderer.domElement.removeEventListener('wheel', onWheel);
    renderer.domElement.removeEventListener('contextmenu', onMenu);
    removeEventListener('keydown', onKey, true);
    cta?.removeEventListener('click', onCta);
    removeEventListener('resize', cadrer);
    mesh?.geometry.dispose();
    material.dispose();
    ombreMat.dispose();
    ombreRT.dispose();
    hTex?.dispose();
    renderer.dispose();
    ui?.root.style.removeProperty('--hero-ink');
    ui?.root.style.removeProperty('--hero-ink-soft');
    calque.remove();
    readout.remove();
    if (window.__mainDuFilm === mainDuFilm) delete window.__mainDuFilm;
  };
}
