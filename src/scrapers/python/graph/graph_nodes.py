"""
LangGraph node functions for the OSINT agent.
"""
import logging
from typing import Dict, Any
from datetime import datetime, UTC
from .graph_state import AgentState
from ..models import SightingCandidate
from ..reddit_poller import RedditPoller
from ..x_poller import XPoller
from ..llm_analyzer import LLMAnalyzer
from ..config import Config

logger = logging.getLogger(__name__)


def fetch_posts_node(state: AgentState) -> Dict[str, Any]:
    """Fetch posts from all sources."""
    logger.info("Fetching posts from all sources...")
    
    reddit_poller = RedditPoller()
    x_poller = None
    
    # Initialize X poller if available
    try:
        if Config.GOOGLE_API_KEY and Config.GOOGLE_CSE_ID:
            x_poller = XPoller()
            logger.info("XPoller initialized for graph")
    except Exception as e:
        logger.warning(f"Failed to initialize XPoller: {e}")
    
    candidates = []
    new_errors = []
    stats = state.get("stats", {})
    
    # Fetch from Reddit
    try:
        if state.get("last_check"):
            reddit_candidates = reddit_poller.fetch_new_posts_since(state["last_check"])
        else:
            logger.info("No previous state found, fetching recent posts from last day")
            reddit_candidates = reddit_poller.fetch_recent_posts(limit=50, time_filter="day")
        candidates.extend(reddit_candidates)
        logger.info(f"Fetched {len(reddit_candidates)} candidates from Reddit")
    except Exception as e:
        logger.error(f"Error fetching Reddit posts: {e}")
        new_errors.append(f"Reddit fetch error: {str(e)}")
    
    # Fetch from X/Twitter if available
    if x_poller:
        try:
            if state.get("last_check"):
                x_candidates = x_poller.fetch_new_posts_since(state["last_check"])
            else:
                x_candidates = x_poller.fetch_recent_posts(limit=10)
            candidates.extend(x_candidates)
            logger.info(f"Fetched {len(x_candidates)} candidates from X/Twitter")
        except Exception as e:
            logger.error(f"Error fetching X posts: {e}")
            new_errors.append(f"X fetch error: {str(e)}")
    
    return {
        "candidates": candidates,
        "errors": new_errors,  # Will be added to existing errors via operator.add
        "stats": stats | {"candidates_fetched": len(candidates)}
    }


def analyze_candidates_node(state: AgentState) -> Dict[str, Any]:
    """Analyze candidates using LLM."""
    logger.info("Analyzing candidates with LLM...")
    
    analyzer = LLMAnalyzer()
    candidates = state.get("candidates", [])
    analyzed = []
    new_errors = []
    stats = state.get("stats", {})
    
    for candidate in candidates:
        try:
            result = analyzer.analyze(candidate)
            analyzed.append(result)
        except Exception as e:
            logger.error(f"Error analyzing candidate {candidate.source_id}: {e}")
            new_errors.append(f"Analysis error for {candidate.source_id}: {str(e)}")
            # Add with low confidence
            candidate.confidence_score = 0.0
            candidate.status = "ERROR"
            analyzed.append(candidate)
    
    return {
        "analyzed_candidates": analyzed,
        "errors": new_errors,  # Will be added to existing errors via operator.add
        "stats": stats | {"candidates_analyzed": len(analyzed)}
    }


def route_candidates_node(state: AgentState) -> Dict[str, Any]:
    """Route candidates based on confidence and validity."""
    logger.info("Routing candidates...")
    
    valid = []
    rejected = []
    analyzed = state.get("analyzed_candidates", [])
    
    for candidate in analyzed:
        if candidate.confidence_score >= 0.5 and candidate.status != "REJECTED":
            valid.append(candidate)
        else:
            rejected.append(candidate)
    
    stats = state.get("stats", {}) | {
        "valid_count": len(valid),
        "rejected_count": len(rejected)
    }
    
    return {
        "valid_candidates": valid,
        "rejected_candidates": rejected,
        "stats": stats
    }

