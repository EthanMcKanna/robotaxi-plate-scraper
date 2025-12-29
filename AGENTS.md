# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the TypeScript pipeline. Key areas: `src/index.ts` (orchestration), `src/scrapers/` (provider scrapers), `src/vision/` (detection + plate extraction), `src/database/` (Supabase reads/writes), and `src/storage/` (uploads).
- `src/config/` contains env configuration and search terms.
- `scripts/` includes one-off tasks like setup and seeding.
- `docs/ADDING_PROVIDER.md` documents the provider onboarding flow.
- GitHub Actions live in `.github/workflows/` (hourly scrape).

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run setup`: interactive setup for `.env` values.
- `npm run scrape:once`: run a single scrape pass locally.
- `npm start`: run the full pipeline locally via `tsx`.
- `npm run build`: TypeScript compile to `dist/`.
- `npm run lint`: run ESLint over `src/`.

## Coding Style & Naming Conventions
- TypeScript, ESM (`"type": "module"`), strict TS config.
- Format matches existing files: 2-space indentation, single quotes, no semicolons.
- Prefer descriptive, provider-specific names (e.g., `RedditScraper`, `sourceId`).

## Testing Guidelines
- No test framework is configured in this repo. If you add tests, call out the runner and update this guide.
- Use `npm run scrape:once` for a quick functional check against configured providers.

## Commit & Pull Request Guidelines
- PR expectations from `CONTRIBUTING.md`: add new scrapers in `src/scrapers/`, register them in `src/index.ts`, update `src/config/index.ts` and `.env.example` if needed, and refresh `docs/ADDING_PROVIDER.md`. Run `npm run lint` when possible.

## Security & Configuration Tips
- Keep scrapers read-only and respect rate limits.
- Required secrets for CI: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BOT_USER_ID`.
- Never commit `.env`; use `.env.example` for new variables.
