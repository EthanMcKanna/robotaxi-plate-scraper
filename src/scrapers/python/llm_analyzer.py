"""
LLM Analyzer for extracting structured data from posts using OpenAI API.
"""
import json
import logging
from typing import Optional
from openai import OpenAI
from .config import Config
from .models import SightingCandidate, ExtractedData

logger = logging.getLogger(__name__)


class LLMAnalyzer:
    """Uses OpenAI GPT-4o-mini to analyze posts and extract structured data."""
    
    SYSTEM_PROMPT = """You are an OSINT analyst tracking autonomous vehicle fleets, specifically Tesla's robotaxi test vehicles.

Analyze the provided post and any attached images to determine if it describes a genuine sighting of a Tesla test vehicle.

Look for these indicators:
- Manufacturer plates (MFG or DST plates) - typically California format like "123MFG456" or "DST1234"
- Camouflage wrapping or unusual coverings
- Test equipment (LiDAR sensors, additional cameras)
- References to "robotaxi", "cybercab", or autonomous testing
- Locations known for Tesla testing (Palo Alto, SF Bay Area, Austin, etc.)

IMPORTANT - If an image is provided, carefully examine it for:
- License plate numbers (read them directly from the image if visible)
- Vehicle color and appearance
- Any visible test equipment or modifications
- Manufacturer plate indicators (MFG, DST, or test plate formats)

Extract the following information if available:
1. License Plate (e.g., '934MFG231', 'DST1234') - READ DIRECTLY FROM IMAGES if visible
2. Vehicle Type (Model 3, Model Y, Cybercab, etc.)
3. Vehicle Color (if visible in image or mentioned in text)
4. Location (City/State or coordinates if mentioned)

Respond ONLY with valid JSON in this exact format. Do not include any markdown, code blocks, or additional text:
{
  "is_valid_sighting": true or false,
  "confidence": 0.0 to 1.0,
  "license_plate": "plate number or null",
  "vehicle_type": "vehicle model or null",
  "vehicle_color": "color description or null",
  "location": "location string or null",
  "reasoning": "brief explanation"
}

If the post is clearly not about a Tesla test vehicle, set is_valid_sighting to false and confidence below 0.3.
Return ONLY the JSON object, nothing else."""
    
    def __init__(self):
        """Initialize the OpenAI client."""
        self.client = OpenAI(api_key=Config.OPENAI_API_KEY)
        logger.info("LLMAnalyzer initialized with OpenAI API")
    
    def analyze(self, candidate: SightingCandidate) -> SightingCandidate:
        """
        Analyze a candidate using the LLM and update its extracted data.
        
        Args:
            candidate: The SightingCandidate to analyze
        
        Returns:
            Updated SightingCandidate with extracted data and confidence score
        """
        result = self._call_openai(candidate)
        
        # Update candidate with results
        if result["is_valid_sighting"]:
            candidate.confidence_score = result["confidence"]
            candidate.extracted_data = ExtractedData(
                license_plate=result.get("license_plate"),
                vehicle_type=result.get("vehicle_type"),
                vehicle_color=result.get("vehicle_color"),
                location=result.get("location")
            )
            logger.info(f"Valid sighting detected: {candidate.source_id} (confidence: {result['confidence']})")
        else:
            candidate.confidence_score = result["confidence"]
            candidate.status = "REJECTED"
            logger.info(f"Rejected: {candidate.source_id} - {result.get('reasoning', 'Low confidence')}")
        
        return candidate
    
    def _call_openai(self, candidate: SightingCandidate) -> dict:
        """Make actual API call to OpenAI."""
        try:
            # Prepare the user message
            user_content = [
                {
                    "type": "text",
                    "text": f"Post Text:\n{candidate.raw_text}\n\nSource: {candidate.source_url}"
                }
            ]
            
            # Add image if available
            if candidate.media.image_url:
                user_content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": candidate.media.image_url
                    }
                })
            
            # Make API call
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.2,
                max_tokens=500,
                response_format={"type": "json_object"}
            )
            
            # Parse response
            response_text = response.choices[0].message.content
            
            # Handle empty or None response
            if not response_text or not response_text.strip():
                logger.warning(f"Empty response from OpenAI for {candidate.source_id}")
                raise ValueError("Empty response from OpenAI")
            
            # Try to extract JSON if response contains markdown code blocks
            response_text = response_text.strip()
            if response_text.startswith("```"):
                # Extract JSON from code block
                lines = response_text.split("\n")
                json_lines = []
                in_code_block = False
                for line in lines:
                    if line.strip().startswith("```"):
                        in_code_block = not in_code_block
                        continue
                    if in_code_block or (not in_code_block and line.strip()):
                        json_lines.append(line)
                response_text = "\n".join(json_lines)
            
            result = json.loads(response_text)
            logger.info(f"OpenAI analysis complete for {candidate.source_id}")
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response: {e}")
            return {
                "is_valid_sighting": False,
                "confidence": 0.0,
                "license_plate": None,
                "vehicle_type": None,
                "location": None,
                "reasoning": "JSON parse error"
            }
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            return {
                "is_valid_sighting": False,
                "confidence": 0.0,
                "license_plate": None,
                "vehicle_type": None,
                "location": None,
                "reasoning": f"API error: {str(e)}"
            }

