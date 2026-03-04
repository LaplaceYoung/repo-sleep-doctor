# Site Deployment Notes

This folder contains a static landing page (`index.html`) for product promotion.

## Local Preview

```bash
npx serve site
```

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
