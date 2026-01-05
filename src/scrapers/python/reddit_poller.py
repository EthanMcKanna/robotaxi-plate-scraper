"""
Reddit Poller for monitoring subreddits for robotaxi sightings.
Uses Reddit's public JSON endpoints (no API credentials required).
"""
import requests
import logging
import time
from typing import List, Optional, Dict, Any
from datetime import datetime, UTC
from .config import Config
from .models import SightingCandidate, MediaData

logger = logging.getLogger(__name__)


class RedditPoller:
    """Polls Reddit for potential robotaxi sightings using JSON endpoints."""
    
    BASE_URL = "https://www.reddit.com/r"
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Referer": "https://www.reddit.com/"
    }
    
    def __init__(self):
        """Initialize the Reddit poller."""
        # Set up Tor proxy if available (optional)
        self.proxies = None
        try:
            import socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('127.0.0.1', 9050))
            sock.close()
            if result == 0:
                # Tor is running on port 9050
                self.proxies = {
                    "http": "socks5h://127.0.0.1:9050",
                    "https": "socks5h://127.0.0.1:9050"
                }
                logger.info("RedditPoller initialized (using JSON endpoints with Tor proxy)")
            else:
                logger.info("RedditPoller initialized (using JSON endpoints, no Tor proxy)")
        except Exception as e:
            logger.info(f"RedditPoller initialized (using JSON endpoints, no Tor proxy: {e})")
    
    def _extract_image_url(self, post_data: Dict[str, Any]) -> Optional[str]:
        """Extract image URL from a Reddit post JSON data."""
        # Check for direct image URL
        url = post_data.get('url', '')
        if url and any(url.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
            return url
        
        # Check for preview images (higher quality than thumbnail)
        if 'preview' in post_data and 'images' in post_data['preview']:
            try:
                images = post_data['preview']['images']
                if images and len(images) > 0:
                    # Try to get the highest resolution source
                    source = images[0].get('source', {})
                    if source and 'url' in source:
                        # Reddit sometimes HTML-encodes URLs in previews
                        image_url = source['url'].replace('&amp;', '&')
                        return image_url
                    # Fallback to variants if source not available
                    variants = images[0].get('variants', {})
                    if variants:
                        # Prefer original or highest quality variant
                        for variant_name in ['original', 'gif', 'mp4']:
                            if variant_name in variants:
                                variant_source = variants[variant_name].get('source', {})
                                if variant_source and 'url' in variant_source:
                                    return variant_source['url'].replace('&amp;', '&')
            except (KeyError, IndexError, AttributeError):
                pass
        
        # Check for gallery (multiple images)
        if 'gallery_data' in post_data and 'media_metadata' in post_data:
            try:
                # Get first image from gallery
                gallery_items = post_data['gallery_data'].get('items', [])
                if gallery_items:
                    first_item_id = gallery_items[0].get('media_id')
                    if first_item_id and first_item_id in post_data['media_metadata']:
                        metadata = post_data['media_metadata'][first_item_id]
                        # Try to get the highest quality image
                        if 's' in metadata and 'u' in metadata['s']:
                            return metadata['s']['u'].replace('&amp;', '&')
                        # Fallback to other formats
                        for key in ['mp4', 'gif']:
                            if key in metadata and 's' in metadata[key] and 'u' in metadata[key]['s']:
                                return metadata[key]['s']['u'].replace('&amp;', '&')
            except (KeyError, IndexError, AttributeError):
                pass
        
        return None
    
    def _fetch_subreddit_json(self, subreddit: str, sort: str = "new", limit: int = 50) -> Optional[List[Dict[str, Any]]]:
        """Fetch posts from a subreddit using JSON endpoint."""
        url = f"{self.BASE_URL}/{subreddit}/{sort}.json"
        params = {"limit": limit}
        
        max_retries = 3 if self.proxies else 1
        timeout = 45 if self.proxies else 10
        
        for attempt in range(max_retries):
            try:
                # Add a delay to avoid rate limiting (longer for Tor to be safe)
                delay = 5 if self.proxies else 1
                time.sleep(delay)
                
                response = requests.get(
                    url, 
                    headers=self.HEADERS, 
                    params=params, 
                    timeout=timeout,
                    proxies=self.proxies
                )
                
                # Handle rate limiting with retry
                if response.status_code == 429:
                    logger.warning(f"Rate limited for r/{subreddit}, waiting 10 seconds and retrying...")
                    time.sleep(10)
                    response = requests.get(
                        url, 
                        headers=self.HEADERS, 
                        params=params, 
                        timeout=timeout,
                        proxies=self.proxies
                    )
                
                response.raise_for_status()
                
                # Parse response
                data = response.json()
                posts = []
                
                # Reddit JSON format: data.children[].data
                if 'data' in data and 'children' in data['data']:
                    for child in data['data']['children']:
                        if 'data' in child:
                            posts.append(child['data'])
                
                logger.info(f"Fetched {len(posts)} posts from r/{subreddit} ({sort})")
                return posts
                
            except (requests.exceptions.ConnectTimeout, requests.exceptions.Timeout) as e:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 10
                    logger.warning(f"Connection timeout for r/{subreddit} (attempt {attempt + 1}/{max_retries}), waiting {wait_time}s before retry...")
                    time.sleep(wait_time)
                    continue
                else:
                    # If Tor keeps timing out, disable it and try without proxy
                    if self.proxies and attempt == max_retries - 1:
                        logger.error(f"Tor connection timeout for r/{subreddit} after {max_retries} attempts. Tor may be blocked or unavailable.")
                        logger.warning("Note: Reddit may block requests without Tor proxy")
                    else:
                        logger.error(f"Error fetching r/{subreddit}: {e}")
                    return None
            except requests.exceptions.RequestException as e:
                logger.error(f"Error fetching r/{subreddit}: {e}")
                return None
            except (KeyError, ValueError) as e:
                logger.error(f"Error parsing JSON from r/{subreddit}: {e}")
                return None
        
        return None
    
    def _post_to_candidate(self, post_data: Dict[str, Any]) -> SightingCandidate:
        """Convert a Reddit post JSON data to a SightingCandidate."""
        title = post_data.get('title', '')
        selftext = post_data.get('selftext', '')
        combined_text = f"{title} {selftext}"
        
        # Extract image
        image_url = self._extract_image_url(post_data)
        
        # Create candidate
        post_id = post_data.get('id', '')
        permalink = post_data.get('permalink', '')
        
        author = post_data.get('author', 'unknown')
        created_utc = post_data.get('created_utc', 0)
        post_time = datetime.fromtimestamp(created_utc, tz=UTC) if created_utc else datetime.now(UTC)
        
        return SightingCandidate(
            source_id=f"reddit_{post_id}",
            source_url=f"https://reddit.com{permalink}",
            timestamp_detected=post_time,
            raw_text=combined_text[:500],  # Truncate for storage
            media=MediaData(image_url=image_url),
            author_username=author,
            title=title
        )
    
    def fetch_recent_posts(self, limit: int = 50, time_filter: str = "day") -> List[SightingCandidate]:
        """
        Fetch recent posts from configured subreddits.
        
        Args:
            limit: Maximum number of posts to fetch per subreddit
            time_filter: Time period to search (not used with JSON endpoints, kept for compatibility)
        
        Returns:
            List of SightingCandidate objects that pass initial filtering
        """
        candidates = []
        
        for subreddit_name in Config.SUBREDDITS:
            logger.info(f"Fetching posts from r/{subreddit_name}")
            
            # Fetch both new and hot posts
            posts = self._fetch_subreddit_json(subreddit_name, sort="new", limit=limit)
            
            if not posts:
                continue
            
            for post_data in posts:
                # Convert all posts to candidates - let LLM filter them
                title = post_data.get('title', '')
                logger.info(f"Processing post: {title[:50]}...")
                
                # Convert to candidate
                candidate = self._post_to_candidate(post_data)
                candidates.append(candidate)
        
        logger.info(f"Found {len(candidates)} posts to analyze with LLM")
        return candidates
    
    def fetch_new_posts_since(self, last_check: datetime, limit: int = 100) -> List[SightingCandidate]:
        """
        Fetch posts created since the last check.
        
        Args:
            last_check: Timestamp of last check
            limit: Maximum posts to fetch per subreddit
        
        Returns:
            List of new SightingCandidate objects
        """
        candidates = []
        
        for subreddit_name in Config.SUBREDDITS:
            logger.info(f"Checking r/{subreddit_name} for new posts since {last_check}")
            
            posts = self._fetch_subreddit_json(subreddit_name, sort="new", limit=limit)
            
            if not posts:
                continue
            
            for post_data in posts:
                # Convert Reddit timestamp (seconds since epoch) to datetime (UTC)
                created_utc = post_data.get('created_utc', 0)
                submission_time = datetime.fromtimestamp(created_utc, tz=UTC)
                
                # Skip if older than last check
                if submission_time <= last_check:
                    break  # Posts are sorted by newest first, so we can break
                
                # Convert all posts to candidates - let LLM filter them
                title = post_data.get('title', '')
                logger.info(f"Processing new post: {title[:50]}...")
                
                # Convert to candidate
                candidate = self._post_to_candidate(post_data)
                candidates.append(candidate)
        
        logger.info(f"Found {len(candidates)} new candidates since last check")
        return candidates
