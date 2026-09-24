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
    def _get_tokens(cls, normalized_text: str) -> set[str]:
        """Extract meaningful tokens (length >= 3)."""
        return {tok for tok in normalized_text.split() if len(tok) >= 3}

    @classmethod
    def _match_name_tokens(cls, query_norm: str, target_norm: str) -> tuple[bool, float]:
        """
        Evaluate token similarity between query name and target student name.
        Avoids false positives from short substrings (e.g., 'ali' in 'khalid').
        Returns (is_match, confidence).
        """
        if not query_norm or not target_norm:
            return False, 0.0

        if query_norm == target_norm:
            return True, 0.95

        tokens_q = cls._get_tokens(query_norm)
        tokens_t = cls._get_tokens(target_norm)

        if not tokens_q or not tokens_t:
            return False, 0.0

        if tokens_q == tokens_t:
            return True, 0.95

        common = tokens_q & tokens_t
        # Require at least 2 tokens matched, or all tokens if query is specific
        if len(common) >= 2 or (len(common) == len(tokens_q) and len(tokens_q) >= 1 and len(tokens_t) <= 2):
            jaccard = len(common) / len(tokens_q | tokens_t)
            confidence = round(0.70 + (0.25 * jaccard), 2)
            return True, confidence

        return False, 0.0

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
        if not norm_name:
            return MatchResult(student_id=None, confidence=0.0, matched_by="NONE")

        best_candidates = []
        highest_conf = 0.0

        for s in students:
            student_best_conf = 0.0
            student_matched_by = ""

            norm_arabic = cls.normalize_text(s.get("arabic_name", ""))
            matched_ar, conf_ar = cls._match_name_tokens(norm_name, norm_arabic)
            if matched_ar and conf_ar > student_best_conf:
                student_best_conf = conf_ar
                student_matched_by = "ARABIC_NAME"

            norm_full = cls.normalize_text(s.get("full_name", ""))
            matched_en, conf_en = cls._match_name_tokens(norm_name, norm_full)
            if matched_en and conf_en > student_best_conf:
                student_best_conf = conf_en
                student_matched_by = "LATIN_NAME"

            if student_best_conf > 0.0:
                # Epsilon for float comparison
                if student_best_conf > highest_conf + 0.001:
                    highest_conf = student_best_conf
                    best_candidates = [(s["id"], student_best_conf, student_matched_by)]
                elif abs(student_best_conf - highest_conf) <= 0.001:
                    best_candidates.append((s["id"], student_best_conf, student_matched_by))

        if best_candidates:
            if len(best_candidates) == 1:
                return MatchResult(
                    student_id=best_candidates[0][0],
                    confidence=best_candidates[0][1],
                    matched_by=best_candidates[0][2]
                )
            else:
                return MatchResult(student_id=None, confidence=highest_conf, matched_by="AMBIGUOUS")

        return MatchResult(student_id=None, confidence=0.0, matched_by="NONE")

