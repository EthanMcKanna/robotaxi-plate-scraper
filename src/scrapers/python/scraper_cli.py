#!/usr/bin/env python3
"""
CLI interface for Python LLM scrapers.
Called from TypeScript to scrape posts and return JSON.
"""
import json
import sys
import os
import logging
import argparse
from datetime import datetime, UTC
from typing import List, Dict, Any

# Add parent directory to path so we can import as package
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(script_dir)
grandparent_dir = os.path.dirname(parent_dir)
if grandparent_dir not in sys.path:
    sys.path.insert(0, grandparent_dir)

from src.scrapers.python.config import Config
from src.scrapers.python.models import SightingCandidate
from src.scrapers.python.reddit_poller import RedditPoller
from src.scrapers.python.x_poller import XPoller
from src.scrapers.python.llm_analyzer import LLMAnalyzer

# Disable verbose logging for CLI
logging.basicConfig(level=logging.WARNING)


def candidate_to_scraped_post(candidate: SightingCandidate, source: str) -> Dict[str, Any]:
    """
    Convert SightingCandidate to ScrapedPost format.
    
    Args:
        candidate: SightingCandidate from poller/analyzer
        source: Source type ('reddit' or 'x')
    
    Returns:
        Dict matching ScrapedPost interface
    """
    image_urls = []
    if candidate.media.image_url:
        image_urls.append(candidate.media.image_url)
    
    # Extract subreddit from URL if Reddit
    subreddit = None
    if source == 'reddit' and candidate.source_url:
        try:
            parts = candidate.source_url.split('/')
            if 'r' in parts:
                idx = parts.index('r')
                if idx + 1 < len(parts):
                    subreddit = parts[idx + 1]
        except Exception:
            pass
    
    result: Dict[str, Any] = {
        "source": source,
        "sourceId": candidate.source_id.replace(f"{source}_", ""),  # Remove prefix for compatibility
        "sourceUrl": candidate.source_url,
        "authorUsername": candidate.author_username or "unknown",
        "title": candidate.title or "",
        "text": candidate.raw_text,
        "imageUrls": image_urls,
        "createdAt": candidate.timestamp_detected.isoformat() + "Z",
    }
    
    if subreddit:
        result["subreddit"] = subreddit
    
    return result


def scrape_reddit(since: datetime) -> List[Dict[str, Any]]:
    """Scrape Reddit posts and analyze with LLM."""
    Config.validate()
    
    poller = RedditPoller()
    analyzer = LLMAnalyzer()
    
    # Fetch candidates
    if since:
        candidates = poller.fetch_new_posts_since(since)
    else:
        # Fetch recent posts from last day
        candidates = poller.fetch_recent_posts(limit=50, time_filter="day")
    
    # Analyze with LLM and filter to valid sightings only
    scraped_posts = []
    for candidate in candidates:
        try:
            analyzed = analyzer.analyze(candidate)
            # Only include if valid sighting with decent confidence
            if analyzed.confidence_score >= 0.5 and analyzed.status != "REJECTED":
                scraped_post = candidate_to_scraped_post(analyzed, "reddit")
                scraped_posts.append(scraped_post)
        except Exception as e:
            # Skip candidates that fail analysis
            continue
    
    return scraped_posts


def scrape_x(since: datetime) -> List[Dict[str, Any]]:
    """Scrape X/Twitter posts and analyze with LLM."""
    Config.validate()
    
    if not Config.GOOGLE_API_KEY or not Config.GOOGLE_CSE_ID:
        return []  # X scraper requires Google API keys
    
    poller = XPoller()
    analyzer = LLMAnalyzer()
    
    # Fetch candidates
    if since:
        candidates = poller.fetch_new_posts_since(since)
    else:
        candidates = poller.fetch_recent_posts(limit=10)
    
    # Analyze with LLM and filter to valid sightings only
    scraped_posts = []
    for candidate in candidates:
        try:
            analyzed = analyzer.analyze(candidate)
            # Only include if valid sighting with decent confidence
            if analyzed.confidence_score >= 0.5 and analyzed.status != "REJECTED":
                scraped_post = candidate_to_scraped_post(analyzed, "x")
                scraped_posts.append(scraped_post)
        except Exception as e:
            # Skip candidates that fail analysis
            continue
    
    return scraped_posts


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="LLM scraper CLI")
    parser.add_argument("source", choices=["reddit", "x"], help="Source to scrape")
    parser.add_argument("--since", type=str, help="ISO timestamp to fetch posts since")
    
    args = parser.parse_args()
    
    # Parse since timestamp
    since = None
    if args.since:
        try:
            since_str = args.since.rstrip("Z").replace("+00:00", "")
            since = datetime.fromisoformat(since_str).replace(tzinfo=UTC)
        except Exception:
            since = None
    
    # Scrape based on source
    try:
        if args.source == "reddit":
            posts = scrape_reddit(since)
        elif args.source == "x":
            posts = scrape_x(since)
        else:
            posts = []
        
        # Output JSON to stdout
        print(json.dumps(posts, indent=2))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

