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
    
    # Subreddits to monitor
    SUBREDDITS: List[str] = ["TeslaLounge", "SelfDrivingCars", "teslamotors"]
    
    # Keywords for filtering
    KEYWORDS: List[str] = [
        "robotaxi",
        "cybercab",
        "camouflage",
        "lidar",
        "test vehicle",
        "prototype",
        "manufacturer plate",
        "mfg plate",
        "dst plate"
    ]
    
    @classmethod
    def validate(cls) -> bool:
        """Validate that required configuration is present."""
        if not cls.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is required")
        # Google API keys are optional (only needed for X/Twitter polling)
        return True

