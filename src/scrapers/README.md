# Scrapers

Each scraper implements the `Scraper` interface in `src/scrapers/types.ts` and returns `ScrapedPost[]`.

- Keep scrapers focused on collection only.
- Let the pipeline handle detection, extraction, and submission.
- Use `src/scrapers/_template.ts` to start a new provider.
