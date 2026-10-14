// Le relevé : monte le relief d'une œuvre dans un élément de la page.
//   const { releve, nuitA, placerCiel } = await import('./src/releve.js');
//   placerCiel(oeuvre.ciel);                  // le lieu du ciel (Paris par défaut)
//   const arret = releve(scene, { theme: 'clair' | 'sombre', trace, jours, pilote, langue, noms, voyage: true, … });
// Les options sont décrites dans relief.js, au-dessus de MOTS.
import monter, { nuitA, placerCiel } from './relief.js';
import reglages from './reglages.js';

export { nuitA, placerCiel };

export function releve(stage, { theme = 'clair', ...options } = {}) {
  const values = Object.fromEntries(Object.entries(reglages).map(([k, d]) => [k, d.value]));
  return monter(stage, {
    variant: { id: theme === 'sombre' ? 'forge' : 'pose' },
    settings: { values, watch() {} },
    site: '',
    nouvelOnglet: false,
    aplat: true,
    ...options,
  });
}
