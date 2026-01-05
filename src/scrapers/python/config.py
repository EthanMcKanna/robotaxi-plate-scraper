"""
Configuration settings for Python LLM scrapers.
"""
import os
from typing import List
from dotenv import load_dotenv

# Load .env from project root (two levels up)
load_dotenv()


class Config:
    """Application configuration."""
    
    # OpenAI API
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    
    # Google Custom Search API (for X/Twitter polling)
    GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")
    GOOGLE_CSE_ID: str = os.getenv("GOOGLE_CSE_ID", "")
    
    # Subreddits to monitor (matches TARGET_SUBREDDITS from old scraper)
    SUBREDDITS: List[str] = [
        # Company-specific
        "Waymo",
        "TeslaMotors",
        "TeslaLounge",
        "TeslaFSD",
        # Service cities
        "Austin",
        "Atlanta",
        "LosAngeles",
        "Phoenix",
        # Bay Area cities (general subreddits)
        "bayarea",
        "sanfrancisco",
        "Oakland",
        "SanJose",
        "berkeley",
        "DalyCity",
        "SanMateo",
        "RedwoodCity",
        "Fremont",
        "Sunnyvale",
        "MountainView",
        "PaloAlto",
        "MenloPark",
        "LosAltos",
    ]
    
    # Robotaxi-specific subreddits (skip keyword filtering for these in old scraper)
    # Note: Python scraper uses LLM filtering instead, but kept for reference
    ROBOTAXI_SUBREDDITS: List[str] = ["Waymo", "TeslaFSD"]
    
    # Keywords for X/Twitter search query building (not used by Reddit poller)
    KEYWORDS: List[str] = [
        "waymo",
        "waymo one",
        "tesla",
        "tesla robotaxi",
        "tesla robo taxi",
        "cybercab",
        "fsd",
        "full self driving",
        "full self-driving",
        "autopilot",
        "tesla autonomy",
        # Additional keywords for broader coverage
        "robotaxi",
        "camouflage",
        "lidar",
        "test vehicle",
        "prototype",
        "manufacturer plate",
        "mfg plate",
        "dst plate",
    ]
    
    @classmethod
    def validate(cls) -> bool:
        """Validate that required configuration is present."""
        if not cls.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is required")
        # Google API keys are optional (only needed for X/Twitter polling)
        return True

