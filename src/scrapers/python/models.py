"""
Data models for the Python LLM scrapers.
"""
from datetime import datetime, UTC
from typing import Optional, List
from pydantic import BaseModel, Field, field_serializer


class ExtractedData(BaseModel):
    """Structured data extracted from a sighting."""
    license_plate: Optional[str] = None
    vehicle_type: Optional[str] = None
    vehicle_color: Optional[str] = None
    location: Optional[str] = None
    coordinates_approx: Optional[List[float]] = None


class MediaData(BaseModel):
    """Media attachments from a post."""
    image_url: Optional[str] = None


class SightingCandidate(BaseModel):
    """A candidate robotaxi sighting."""
    source_id: str
    source_url: str
    timestamp_detected: datetime = Field(default_factory=lambda: datetime.now(UTC))
    confidence_score: float = 0.0
    extracted_data: ExtractedData = Field(default_factory=ExtractedData)
    media: MediaData = Field(default_factory=MediaData)
    status: str = "PENDING_REVIEW"
    raw_text: str = ""
    author_username: Optional[str] = None
    title: Optional[str] = None
    
    @field_serializer('timestamp_detected')
    def serialize_datetime(self, dt: datetime, _info) -> str:
        """Serialize datetime to ISO format with Z suffix."""
        return dt.isoformat() + "Z"

