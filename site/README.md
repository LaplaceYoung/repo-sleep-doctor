# Site Deployment Notes

This folder contains a static landing page (`index.html`) for product promotion.

## Local Preview

```bash
npx serve site
```

## GitHub Pages (recommended for OSS)

1. Push `site/` to your repository.
2. In repo settings: `Pages` -> source `Deploy from a branch`.
3. Select branch `main` and folder `/site`.
4. Publish and bind a custom domain if needed.

## Netlify / Vercel / Cloudflare Pages

Use `site` as the publish directory.

