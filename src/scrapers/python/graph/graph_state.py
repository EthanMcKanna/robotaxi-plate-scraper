"""
State schema for LangGraph workflow.
"""
import operator
from typing import TypedDict, List, Optional, Annotated
from datetime import datetime
from ..models import SightingCandidate


class AgentState(TypedDict):
    """State that flows through the LangGraph."""
    # Input
    last_check: Optional[datetime]
    
    # Processing
    candidates: List[SightingCandidate]  # Filtered candidates from pollers
    analyzed_candidates: List[SightingCandidate]  # After LLM analysis
    
    # Output
    valid_candidates: List[SightingCandidate]
    rejected_candidates: List[SightingCandidate]
    
    # Metadata
    errors: Annotated[List[str], operator.add]  # Accumulate errors across nodes
    stats: dict  # Processing statistics

