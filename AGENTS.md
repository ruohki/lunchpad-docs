# Lunchpad docs: notes for coding agents

Astro Starlight site documenting the Lunchpad app, which lives at `../../lunchpad`
(`LUNCHPAD_DIR` overrides). Read `CONTRIBUTING.md` first; it has the layout, the page template
and the new-action workflow.

- Facts come from the app's source, never from memory: labels from `src/i18n/en.json`,
  behaviour from `src-tauri/src/macros/{model,engine,exec}.rs` and the editors in
  `src/components/actions/`. The app checkout is read-only from here.
- Generated, do not edit by hand: `src/data/actions.json` (`npm run actions:sync`) and
  `src/assets/screenshots/**` (`npm run screenshots`).
- Before finishing: `npm run actions:check` and `npm run build`.
- Dev server: `astro dev --background`; manage it with `astro dev stop|status|logs`.
