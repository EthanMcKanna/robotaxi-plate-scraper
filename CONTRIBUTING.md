# Contributing

Thanks for helping expand the scraper ecosystem. This guide is optimized for quick, low-friction PRs.

## TL;DR

1) Add a new scraper in `src/scrapers/` (use `src/scrapers/_template.ts`).
2) Register it in `src/index.ts`.
3) Add any config + env vars in `src/config/index.ts` and `.env.example`.
4) Update docs (`docs/ADDING_PROVIDER.md`).
5) Run `npm run lint` if you can.

## Ground rules

- Keep scrapers read-only.
- Be respectful of rate limits.
- Avoid breaking existing providers.

## What makes a great PR

- Clear provider name + source URL stored in each `ScrapedPost`.
- Deterministic dedupe key (`sourceId`).
- Helpful logs when failures happen.
- Minimal env/config additions.

## Running locally

```bash
npm install
cp .env.example .env
npm run setup
npm run scrape:once
```

## Need help

Open an issue or start a draft PR with questions in the description.
