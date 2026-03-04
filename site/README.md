# Site Deployment Notes

This folder contains a static multi-page promo site:

- `index.html`: growth-oriented product landing page
- `competitive.html`: benchmark and capability-diff page
- `blueprint.html`: fission growth blueprint page
- `assets/`: shared styles and interactions

Last updated: 2026-03-04

## Local Preview

```bash
npx serve site
```

Then open:

- `http://localhost:3000/index.html`
- `http://localhost:3000/competitive.html`
- `http://localhost:3000/blueprint.html`

## GitHub Pages (recommended for OSS)

This repository already includes `.github/workflows/pages.yml`.

1. In repository settings, open `Pages`.
2. Set `Build and deployment` source to `GitHub Actions`.
3. Push changes under `site/` (or run `Deploy Site` workflow manually).
4. The default URL becomes `https://laplaceyoung.github.io/repo-sleep-doctor/`.

## Recommended live assets

Pair the landing page with generated reports:

```bash
node src/cli.js . --format html --out reports/scan.html --cache-file reports/scan.cache.json --fail-on none
node src/cli.js fleet-scan ../repo-a ../repo-b --history-dir reports/fleet-history --scan-out-dir reports/fleet-reports --scan-format html --format html --out reports/fleet.html --fail-on none
```

## Netlify / Vercel / Cloudflare Pages

Use `site` as the publish directory.
