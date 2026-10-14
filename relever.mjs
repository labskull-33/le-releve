// Le relevé des jours de travail : l'altitude de chaque création = les jours distincts où git l'a vue changer.
//   node relever.mjs [chemin/vers/oeuvre.json]
// Lit oeuvre.json (par défaut celui d'à côté) et écrit jours.json à côté de lui : la page le lit pour lever le relief.
// Les dépôts (« depots ») sont des chemins relatifs à oeuvre.json. Chaque création dit où compter ses jours
// (« releve ») : des chemins dans un dépôt (« . » = tout le dépôt, « :!x » = sauf x), ou un grep sur les messages.
// Les jours de plusieurs sources s'additionnent sans doublon.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FICHIER = resolve(process.argv[2] ?? fileURLToPath(new URL('./oeuvre.json', import.meta.url)));
const ICI = dirname(FICHIER);
const OEUVRE = JSON.parse(readFileSync(FICHIER, 'utf8'));
// depots.local.json (à côté, hors de git) remplace les chemins des dépôts sur votre machine
const LOCAL = resolve(ICI, 'depots.local.json');
const DEPOTS = { ...OEUVRE.depots, ...(existsSync(LOCAL) ? JSON.parse(readFileSync(LOCAL, 'utf8')) : {}) };
const depot = (nom) => resolve(ICI, DEPOTS[nom] ?? nom) + '/';

// [dépôt, chemins] ou [dépôt, { grep }] : les jours de chaque source s'additionnent sans doublon
const SOURCES = Object.fromEntries(
  OEUVRE.creations.map((c) => [c.nom, c.releve.map((s) => [depot(s.depot), s.chemins ?? { grep: s.grep }])]),
);

// Une même petite ligne posée sur cinq pages ou plus à la fois (une icône, un script commun) n'est pas une journée
// de travail sur chacune : un tel commit (au plus RETOUCHE lignes changées par fichier) ne compte pour aucune
const TRANSVERSAL = 5;
const RETOUCHE = 4;
const journal = new Map(); // dépôt → [{ date, fichiers, message }]
function lire(depot) {
  if (!journal.has(depot)) {
    let sortie = '';
    try {
      sortie = execFileSync('git', ['-C', depot, 'log', '--format=@@%ad%x09%s', '--date=short', '--numstat'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    } catch {
      console.warn(`  (dépôt illisible : ${depot})`);
    }
    journal.set(depot, sortie.split('@@').filter(Boolean).map((bloc) => {
      const [tete, ...lignes] = bloc.split('\n');
      const [date, message = ''] = tete.split('\t');
      // numstat : ajoutées, retirées, chemin (« - » pour un fichier binaire) ; le relevé lui-même (jours.json) ne compte pas
      const stats = lignes.map((l) => l.split('	')).filter((c) => c.length >= 3 && !/(^|\/)jours\.json$/.test(c.slice(2).join('	')));
      return { date, message, fichiers: stats.map((c) => c.slice(2).join('	')), stats };
    }));
  }
  return journal.get(depot);
}
// Un chemin de SOURCES (« . » = tout le dépôt, « :!x » = sauf x) couvre-t-il ce fichier ?
const couvre = (chemins, f) => {
  const oui = chemins.filter((c) => !c.startsWith(':!'));
  const non = chemins.filter((c) => c.startsWith(':!')).map((c) => c.slice(2));
  const dans = (c) => c === '.' || f === c || f.startsWith(c + '/');
  return oui.some(dans) && !non.some(dans);
};
const pagesDe = (depot, c) => Object.entries(SOURCES).filter(([, srcs]) => srcs.some(([d, q]) => d === depot && Array.isArray(q) && c.fichiers.some((f) => couvre(q, f)))).length;
// petit sur chaque fichier de page (les fichiers hors des pages, outils ou essais, n'y changent rien)
const dansUnePage = (depot, f) => Object.values(SOURCES).some((srcs) => srcs.some(([d, q]) => d === depot && Array.isArray(q) && couvre(q, f)));
const transversal = (depot, c) =>
  pagesDe(depot, c) >= TRANSVERSAL &&
  c.stats.filter((st) => dansUnePage(depot, st.slice(2).join('	'))).every(([a, d]) => a === '-' || +a + +d <= RETOUCHE);
function jours(depot, quoi) {
  return lire(depot)
    .filter((c) => !transversal(depot, c))
    .filter((c) => (quoi.grep ? new RegExp(quoi.grep, 'i').test(c.message) : c.fichiers.some((f) => couvre(quoi, f))))
    .map((c) => c.date);
}

const releve = {};
for (const [nom, sources] of Object.entries(SOURCES)) {
  releve[nom] = new Set(sources.flatMap(([d, q]) => jours(d, q))).size || 1;
}

const SORTIE = resolve(ICI, 'jours.json');
const avant = existsSync(SORTIE) ? JSON.parse(readFileSync(SORTIE, 'utf8')).jours ?? {} : {};
const date = new Date().toISOString().slice(0, 10);
writeFileSync(SORTIE, JSON.stringify({ releve: date, jours: releve }, null, 1) + '\n');
for (const [n, j] of Object.entries(releve)) {
  const a = avant[n];
  console.log(`${n.padEnd(18)} ${String(j).padStart(3)} j${a != null && a !== j ? `  (avant ${a})` : ''}`);
}
console.log(`\nÉcrit : ${SORTIE} — relevé du ${date}`);
