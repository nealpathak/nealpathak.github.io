# nealpathak.github.io

Personal site: small indie games and interactive tools for insurance and legal
professionals. Served straight from `main` by GitHub Pages — no build step.

## Layout

```
index.html            the index; every project is one <li>
404.html
assets/               shared across every page
  css/base.css          tokens, reset, layout primitives
  favicon.svg
  vendor/three/         three.js r185, committed (MIT) so there's no CDN
games/<slug>/         one self-contained folder per game
tools/<slug>/         one self-contained folder per tool
scripts/serve.py      local preview
```

Vendoring three.js rather than pulling it from a CDN keeps the no-build promise
honest: the site has no runtime dependency on anyone else's uptime, and it works
offline. Pages serves it gzipped at roughly 180 KB.

## Rules that keep it scaling

- **A project is a folder with an `index.html`.** It owns its own CSS and JS.
  Nothing outside `assets/` is shared between projects, so one can never break
  another.
- **Paths are absolute** (`/assets/css/base.css`), which works the same from the
  root and from any nested project folder.
- **No build step.** Plain HTML, CSS and ES modules. If one project someday
  needs bundling, it can get its own build that outputs into its own folder —
  the rest of the site is unaffected.
- Adding a project to the index is one `<li>` in `index.html`.

## Local preview

```
python scripts/serve.py
```

Then open <http://localhost:8000>. The server sends `no-store`, so a reload
always shows the code you just saved — never a stale cached copy.

## Nightshift

`games/zombies/` is a closed campaign, not an endless mode: six hand-authored
levels, three difficulties, roughly an hour. Dying restarts the level you're on,
never the run, and progress is saved to `localStorage` at each level boundary.

Replay variety comes from the draft — after every level you pick one of three
random upgrades from a pool of ten, so two runs diverge quickly. Level and wave
data all live in `src/levels.js`; every balance number is in `src/upgrades.js`
or the level's own `enemy` block, so tuning never means touching engine code.

## Tests

A project that has logic worth breaking gets a `_selftest.html` next to it,
which imports the real modules and exercises them headlessly — no renderer, no
input device. Open it in a browser and read the list:

    http://localhost:8000/games/zombies/_selftest.html

It has to mirror the game loop's step order to be worth anything, so if you
change that order, change it in both places.

## Deploying

Push to `main`. GitHub Pages serves the repo root. `.nojekyll` is present so
Jekyll doesn't touch the files or hide anything beginning with `_`.
