# Le relevé

**Your git history, raised as a landscape on the flower of life.**

![The survey of davidvuillet.fr at night: the forge under the moon](apercu.png)

Each creation is a **peak**, as high as its **working days** (the days git saw it change). Peaks are set **with a compass** on the flower of life: each circle starts from the previous one, with the same opening. You travel from one peak to the next along the circles, and each creation opens in place.

The sky is real: the sun and moon of the chosen place, at its local time. By day the survey is a contour map shaded by the sun. At nightfall it turns to a forge, under the moon and its phase.

Demo: [labskull-33.github.io/le-releve](https://labskull-33.github.io/le-releve/) · in context: [davidvuillet.fr/voyage](https://davidvuillet.fr/voyage/) · *Français : [LISEZMOI.md](LISEZMOI.md)*

## Try it

Nothing to install: native ES modules, with Three.js loaded from a CDN.

```sh
git clone https://github.com/labskull-33/le-releve.git
cd le-releve
python -m http.server 8000      # or any small static server
```

Open http://localhost:8000. Any static host works, GitHub Pages included (Settings → Pages → deploy from branch).

## Your work

Everything lives in **`oeuvre.json`** ("the work"); the page needs no change. Field names are French:

- **`auteur`** (author: `nom` = name, `site`), **`site`**: the base address of your creations.
- **`ciel`** (sky): `lieu` (place name), `latitude`, `longitude`, `fuseau` (IANA time zone).
- **`depots`** (repositories): names → paths relative to `oeuvre.json`.
- **`creations`**, in order:
  - Optional **`depots.local.json`** (ignored by git): the same repository names with their paths on your machine, if they differ.
  - `nom` (name), `url` (relative to `site`), `fr` / `en` (`titre` = title, `texte` = text; `en.nom` = English name).
  - **`pas`** (compass steps): `[]` for the first creation, at the heart. Each number is one step of the same opening: `1` up, then `2` to `6` every 60° clockwise. `[1, 2]` = one step up, then one at 60°.
  - **`releve`** (where to count days): a `depot` and `chemins` (paths; `"."` = the whole repo, `":!folder"` = except that folder), or a `grep` on commit messages. Days from several sources add up without duplicates.

## Count the days

```sh
node relever.mjs                 # reads oeuvre.json, writes jours.json
```

Run it whenever you like: the mountains grow with your work. A commit making tiny edits across five creations or more (an icon, a shared script) counts for none.

For a nightly survey on GitHub, copy `exemples/releve-chaque-nuit.yml` into `.github/workflows/`. The action only sees repositories on GitHub, not the ones on your computer.

## License

Code under the **MIT** license. The example (texts, data, preview and linked works) remains © David Vuillet, all rights reserved: replace it with your own. Fonts under the SIL Open Font License. See [LICENSE](LICENSE).

Born on 12 October 2026 on [davidvuillet.fr](https://davidvuillet.fr), made with Claude.
