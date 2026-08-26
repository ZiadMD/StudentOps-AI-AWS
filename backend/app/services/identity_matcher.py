"""
Student Identity Matcher for Google Meet participants.
"""
import re
from typing import Optional
from dataclasses import dataclass


@dataclass
class MatchResult:
    student_id: Optional[str]
    confidence: float
    matched_by: str  # "EXACT_EMAIL", "ARABIC_NAME", "LATIN_NAME", "NONE"


class IdentityMatcher:
    """Matches raw Google Meet participant records to internal Student entities."""

    @staticmethod
    def normalize_text(text: str) -> str:
        if not text:
            return ""
        t = text.lower().strip()
        # Remove common honorifics / tags
        t = re.sub(r'[\(\[\{].*?[\)\]\}]', '', t)
        # Arabic character normalizations
        t = re.sub(r'[إأآا]', 'ا', t)
        t = re.sub(r'[ىي]', 'ي', t)
        t = re.sub(r'ة', 'ه', t)
        t = re.sub(r'\s+', ' ', t).strip()
        return t

    @classmethod
    def match_participant(
        cls,
        display_name: str,
        email: Optional[str],
        students: list[dict]
    ) -> MatchResult:
        """
        Match participant with deterministic priority:
        1. Exact Google Email
        2. Normalized Arabic Name
        3. Normalized English Name
        """
        # Tier 1: Exact Email Match
        if email and email.strip():
            clean_email = email.strip().lower()
            for s in students:
                if s.get("email", "").strip().lower() == clean_email:
                    return MatchResult(student_id=s["id"], confidence=1.0, matched_by="EXACT_EMAIL")

        # Tier 2: Arabic / Normalized Name Match
        norm_name = cls.normalize_text(display_name)
        if norm_name:
            for s in students:
                norm_arabic = cls.normalize_text(s.get("arabic_name", ""))
                if norm_arabic and (norm_name == norm_arabic or norm_name in norm_arabic or norm_arabic in norm_name):
                    return MatchResult(student_id=s["id"], confidence=0.95, matched_by="ARABIC_NAME")
                
                norm_full = cls.normalize_text(s.get("full_name", ""))
                if norm_full and (norm_name == norm_full or norm_name in norm_full or norm_full in norm_name):
                    return MatchResult(student_id=s["id"], confidence=0.90, matched_by="LATIN_NAME")

        return MatchResult(student_id=None, confidence=0.0, matched_by="NONE")
