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

## Netlify / Vercel / Cloudflare Pages

Use `site` as the publish directory.
