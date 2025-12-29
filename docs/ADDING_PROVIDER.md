# Adding a provider

This guide keeps provider PRs small and predictable.

## 1) Copy the template

Start from:

`src/scrapers/_template.ts`

Rename the file (e.g. `src/scrapers/threads.ts`) and update the class name.

## 2) Update types

Add the new provider to `PostSource` in `src/scrapers/types.ts`.

## 3) Register the scraper

Import and register it in `src/index.ts` with a priority:

- Lower number = higher priority
- Keep existing providers stable

## 4) Add config (only if needed)

If the provider needs API keys or base URLs:

- Add fields in `src/config/index.ts`
- Add prompts in `src/config/interactive-setup.ts`
- Add env vars to `.env.example`

## 5) Validate output

Your `scrape()` must return `ScrapedPost[]` that include:

- `sourceId`: stable, unique ID (use `${instance}|${id}` for federated sources)
- `sourceUrl`: direct link to the post
- `imageUrls`: direct image URLs only
- `createdAt`: original post time

## 6) Share anything special

If the provider has rate limits or quirks, add a note to `README.md`.
