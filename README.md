# Robotaxi Plate Scraper

Open-source scraper pipeline for finding robotaxi license plates, uploading evidence, and creating moderation submissions in a Supabase-backed tracker.


More providers can be added by dropping a new scraper into `src/scrapers/` and registering it in `src/index.ts`.

## How it runs

This project is designed to run via GitHub Actions once per hour.

Workflow: `.github/workflows/scrape.yml`

## Quick start (local)

1) Install dependencies

```bash
npm install
```

2) Create `.env`

```bash
cp .env.example .env
npm run setup
```

3) Run the scraper once

```bash
npm run scrape:once
```

## GitHub Actions setup

Add the following repo secrets:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BOT_USER_ID`

The scheduled workflow runs hourly and can be triggered manually.

## Project layout

- `src/index.ts`: pipeline orchestration
- `src/scrapers/`: provider scrapers
- `src/config/`: env + search terms
- `src/vision/`: robotaxi detection + plate extraction
- `src/database/`: Supabase reads/writes
- `src/storage/`: image upload helpers

## Add a new provider

Start here: `docs/ADDING_PROVIDER.md`.

## Contributing

See `CONTRIBUTING.md` for the fastest path to a clean PR.
