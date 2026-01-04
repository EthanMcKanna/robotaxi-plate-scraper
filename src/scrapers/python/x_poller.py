"""
X/Twitter Poller for monitoring X/Twitter posts for robotaxi sightings.
Uses Google Custom Search API to find X/Twitter posts by keywords.
"""
import requests
import logging
import time
import re
from typing import List, Optional, Dict, Any
from datetime import datetime, UTC
from .config import Config
from .models import SightingCandidate, MediaData

logger = logging.getLogger(__name__)


class XPoller:
    """Polls X/Twitter for potential robotaxi sightings via Google Custom Search."""
    
    GOOGLE_SEARCH_API_URL = "https://www.googleapis.com/customsearch/v1"
    
    def __init__(self):
        """Initialize the X poller."""
        self.keywords = [kw.lower() for kw in Config.KEYWORDS]
        self.google_api_key = Config.GOOGLE_API_KEY
        self.google_cse_id = Config.GOOGLE_CSE_ID
        logger.info("XPoller initialized (using Google Custom Search API)")
    
    def _contains_keywords(self, text: str) -> bool:
        """Check if text contains any of the target keywords."""
        if not text:
            return False
        text_lower = text.lower()
        return any(keyword in text_lower for keyword in self.keywords)
    
    def _build_search_query(self, since: Optional[datetime] = None) -> str:
        """
        Build Google search query for X/Twitter posts with keywords.
        
        Args:
            since: Optional datetime to filter results by date (not used - Google API limitation)
            
        Returns:
            Search query string
        """
        # Build keyword query
        keyword_query = " OR ".join(f'"{kw}"' for kw in self.keywords[:3])  # Limit keywords to avoid query length issues
        
        # Search for keywords across all of X/Twitter (no account restriction)
        query = f'site:x.com ({keyword_query})'
        
        return query
    
    def _search_google(self, query: str, num_results: int = 10) -> Optional[List[Dict[str, Any]]]:
        """
        Search Google Custom Search API.
        
        Args:
            query: Search query string
            num_results: Number of results to return (max 10 per request)
            
        Returns:
            List of search result items, or None if error
        """
        if not self.google_api_key or not self.google_cse_id:
            logger.error("Google API key or CSE ID not configured")
            return None
        
        params = {
            "key": self.google_api_key,
            "cx": self.google_cse_id,
            "q": query,
            "num": min(num_results, 10)  # Google allows max 10 per request
        }
        
        try:
            # Small delay to avoid rate limiting
            time.sleep(1)
            
            response = requests.get(
                self.GOOGLE_SEARCH_API_URL,
                params=params,
                timeout=10
            )
            
            response.raise_for_status()
            data = response.json()
            
            items = data.get("items", [])
            logger.info(f"Google search returned {len(items)} results for query: {query[:100]}...")
            
            return items
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error searching Google: {e}")
            return None
        except (KeyError, ValueError) as e:
            logger.error(f"Error parsing Google search response: {e}")
            return None
    
    def _extract_tweet_id_from_url(self, url: str) -> Optional[str]:
        """Extract tweet ID from X/Twitter URL."""
        # URLs can be like: https://x.com/SawyerMerritt/status/1234567890
        # or https://twitter.com/SawyerMerritt/status/1234567890
        match = re.search(r'/status/(\d+)', url)
        return match.group(1) if match else None
    
    def _extract_image_from_tweet(self, search_result: Dict[str, Any]) -> Optional[str]:
        """
        Extract image URL from Google search result.
        
        Note: Google search results may include image thumbnails in pagemap.
        For full images, we'd need to scrape the actual tweet, which is complex.
        For now, we'll try to extract from pagemap if available.
        """
        try:
            pagemap = search_result.get("pagemap", {})
            
            # Try to find images in pagemap
            cse_image = pagemap.get("cse_image", [])
            if cse_image and len(cse_image) > 0:
                image_url = cse_image[0].get("src")
                if image_url:
                    return image_url
            
            # Try metatags for og:image
            metatags = pagemap.get("metatags", [])
            if metatags and len(metatags) > 0:
                og_image = metatags[0].get("og:image")
                if og_image:
                    return og_image
            
        except (KeyError, IndexError, AttributeError):
            pass
        
        return None
    
    def _search_result_to_candidate(self, result: Dict[str, Any]) -> SightingCandidate:
        """
        Convert a Google search result to a SightingCandidate.
        
        Args:
            result: Google Custom Search API result item
            
        Returns:
            SightingCandidate object
        """
        title = result.get("title", "")
        snippet = result.get("snippet", "")
        link = result.get("link", "")
        
        combined_text = f"{title} {snippet}"
        
        # Extract tweet ID from URL for source_id
        tweet_id = self._extract_tweet_id_from_url(link) or "unknown"
        source_id = f"x_{tweet_id}"
        
        # Extract author from URL if available (x.com/username/status/...)
        author = "unknown"
        try:
            import re
            match = re.search(r'x\.com/([^/]+)/', link)
            if match:
                author = match.group(1)
        except Exception:
            pass
        
        # Extract image if available
        image_url = self._extract_image_from_tweet(result)
        
        # Try to parse date from result (Google sometimes includes dates)
        detected_time = datetime.now(UTC)
        try:
            # Google search results may have formattedDate or htmlFormattedDate
            # But these are often not present, so we'll use current time
            pass
        except Exception:
            pass
        
        return SightingCandidate(
            source_id=source_id,
            source_url=link,
            timestamp_detected=detected_time,
            raw_text=combined_text[:500],  # Truncate for storage
            media=MediaData(image_url=image_url),
            author_username=author,
            title=title
        )
    
    def fetch_recent_posts(self, limit: int = 10) -> List[SightingCandidate]:
        """
        Fetch recent posts from X/Twitter via Google search using keywords.
        
        Args:
            limit: Maximum number of posts to fetch (Google allows 10 per request)
        
        Returns:
            List of SightingCandidate objects that pass initial filtering
        """
        candidates = []
        
        logger.info("Searching X/Twitter for recent posts with keywords")
        
        # Build search query
        query = self._build_search_query()
        
        # Search Google
        results = self._search_google(query, num_results=limit)
        
        if not results:
            logger.info("No search results returned")
            return candidates
        
        for result in results:
            # Convert all search results to candidates - let LLM filter them
            # (Keywords are still used in the Google search query to find relevant posts)
            title = result.get("title", "")
            logger.info(f"Processing result: {title[:50]}...")
            
            # Convert to candidate
            candidate = self._search_result_to_candidate(result)
            candidates.append(candidate)
        
        logger.info(f"Found {len(candidates)} results to analyze with LLM")
        return candidates
    
    def fetch_new_posts_since(self, last_check: datetime, limit: int = 10) -> List[SightingCandidate]:
        """
        Fetch posts created since the last check.
        
        Note: Google Custom Search API has limited date filtering capabilities.
        We'll fetch recent posts and filter by checking if we've seen them before.
        For a more robust solution, we'd need to track seen tweet IDs separately.
        
        Args:
            last_check: Timestamp of last check (used for query context, not strict filtering)
            limit: Maximum posts to fetch
        
        Returns:
            List of new SightingCandidate objects
        """
        # For now, we'll just fetch recent posts
        # In a full implementation, we'd track seen tweet IDs in the state file
        logger.info(f"Checking X/Twitter for new posts since {last_check}")
        
        candidates = self.fetch_recent_posts(limit=limit)
        
        logger.info(f"Found {len(candidates)} candidates from X/Twitter since last check")
        return candidates

