# Lunchpad docs

User documentation for [Lunchpad](https://github.com/ruohki/lunchpad), the macro app for Novation
Launchpads. Built with Astro Starlight in the app's own look; every action has a page with a
screenshot taken from the real interface.

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
```

The site is fully static: no server, search runs in the browser. Pushing a tag that starts with
`v` publishes it to bunny.net:

```bash
git tag v1.0.1 && git push origin v1.0.1
```

Screenshots, the action data sync, publishing and what to do when the app ships a new action are
in [CONTRIBUTING.md](CONTRIBUTING.md).
