from __future__ import annotations

import logging
import re
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

# Minimum similarity ratio (0-1) for a fuzzy match to count as verified
_MIN_SIMILARITY = 0.4

# Phrases that indicate the model honestly reported no evidence
_HONEST_NO_EVIDENCE = [
    "insufficient evidence",
    "no direct evidence",
    "no evidence in transcript",
    "not enough data",
    "not observed",
    "no meaningful",
    "cannot be evaluated",
]

_UNVERIFIED_PREFIX = "[UNVERIFIED]"


class EvidenceVerifier:
    """Verifies that evidence citations in the analysis actually exist in the transcript.

    After Gemini produces an analysis, this post-processor checks each evidence
    string against the actual transcript content. Evidence that cannot be matched
    is flagged as unverified, and verification metadata is attached to the result.
    """

    def __init__(self, transcript: str) -> None:
        self.transcript = transcript
        # Build a normalized version for fuzzy matching
        self.transcript_lower = transcript.lower()
        # Extract all text segments for chunk-level matching
        self._chunks = self._extract_chunks(transcript)

    @staticmethod
    def _extract_chunks(transcript: str) -> list[str]:
        """Split transcript into meaningful chunks for matching."""
        # Split on segment headers
        segments = re.split(r"---\s*\[.*?\].*?---", transcript)
        chunks: list[str] = []
        for seg in segments:
            seg = seg.strip()
            if seg and len(seg) > 10:
                chunks.append(seg.lower())
        return chunks

    def _is_honest_no_evidence(self, evidence: str) -> bool:
        """Check if the evidence string honestly says there's no evidence."""
        lower = evidence.lower()
        return any(phrase in lower for phrase in _HONEST_NO_EVIDENCE)

    @staticmethod
    def _mark_unverified(text: str) -> str:
        if text.startswith(_UNVERIFIED_PREFIX):
            return text
        return f"{_UNVERIFIED_PREFIX} {text}"

    def _fuzzy_match(self, evidence: str) -> tuple[bool, float]:
        """Check if evidence string fuzzy-matches any part of the transcript.

        Returns (is_verified, best_similarity_score).
        """
        evidence_lower = evidence.lower().strip()

        # Quick exact substring check
        if evidence_lower in self.transcript_lower:
            return True, 1.0

        # Extract quoted text from evidence (e.g., "the candidate typed: 'fix the bug'")
        quoted = re.findall(r"['\"]([^'\"]{5,})['\"]", evidence)
        for quote in quoted:
            if quote.lower() in self.transcript_lower:
                return True, 1.0

        # Check for segment references like "#5", "segment #5", "interaction #5"
        seg_refs = re.findall(r"#(\d+)", evidence)
        if seg_refs:
            # If the evidence references a segment number that exists, partial match
            for ref in seg_refs:
                pattern = f"(#{ref})"
                if pattern in self.transcript:
                    return True, 0.7

        # Fuzzy match against transcript chunks
        best_score = 0.0
        for chunk in self._chunks:
            # Use SequenceMatcher on shorter evidence vs longer chunk
            # Only compare first 200 chars of each to keep it fast
            ratio = SequenceMatcher(
                None,
                evidence_lower[:200],
                chunk[:500],
            ).ratio()
            best_score = max(best_score, ratio)
            if ratio >= _MIN_SIMILARITY:
                return True, ratio

        return best_score >= _MIN_SIMILARITY, best_score

    def verify(self, analysis: dict) -> dict:
        """Verify all evidence in the analysis and attach verification metadata.

        Args:
            analysis: The analysis dict from ClaudeAnalyzer.

        Returns:
            The same analysis dict with:
            - Unverified evidence items annotated with "[UNVERIFIED]" prefix
            - Unverified observed_points transcript_quote values annotated likewise
            - "_evidence_verification" metadata added
        """
        total_evidence = 0
        verified_count = 0
        unverified_count = 0
        honest_no_evidence_count = 0
        total_observed_points = 0
        verified_observed_points = 0
        unverified_observed_points = 0
        flagged_dimensions: list[str] = []

        dimensions = analysis.get("dimensions", {})

        for dim_name, dim_data in dimensions.items():
            if not isinstance(dim_data, dict):
                continue

            evidence_list = dim_data.get("evidence", [])
            verified_evidence: list[str] = []
            observed_points = dim_data.get("observed_points", [])
            verified_observed: list[dict] = []
            dim_unverified = 0
            dim_observed_total = 0
            dim_observed_unverified = 0

            for item in evidence_list:
                if not isinstance(item, str) or not item.strip():
                    continue

                total_evidence += 1

                if self._is_honest_no_evidence(item):
                    honest_no_evidence_count += 1
                    verified_count += 1
                    verified_evidence.append(item)
                    continue

                is_verified, score = self._fuzzy_match(item)

                if is_verified:
                    verified_count += 1
                    verified_evidence.append(item)
                else:
                    unverified_count += 1
                    dim_unverified += 1
                    verified_evidence.append(self._mark_unverified(item))
                    logger.debug(
                        "Unverified evidence in %s (score=%.2f): %s",
                        dim_name, score, item[:100],
                    )

            dim_data["evidence"] = verified_evidence

            for point in observed_points if isinstance(observed_points, list) else []:
                if not isinstance(point, dict):
                    verified_observed.append(point)
                    continue

                normalized_point = dict(point)
                quote = normalized_point.get("transcript_quote")
                if not isinstance(quote, str) or not quote.strip():
                    verified_observed.append(normalized_point)
                    continue

                total_observed_points += 1
                dim_observed_total += 1

                if self._is_honest_no_evidence(quote):
                    honest_no_evidence_count += 1
                    verified_observed_points += 1
                    normalized_point["quote_verified"] = True
                    normalized_point["quote_similarity"] = 1.0
                    verified_observed.append(normalized_point)
                    continue

                is_verified, score = self._fuzzy_match(quote)
                normalized_point["quote_verified"] = is_verified
                normalized_point["quote_similarity"] = round(score, 3)

                if is_verified:
                    verified_observed_points += 1
                else:
                    unverified_observed_points += 1
                    dim_observed_unverified += 1
                    normalized_point["transcript_quote"] = self._mark_unverified(quote)
                    logger.debug(
                        "Unverified observed point quote in %s (score=%.2f): %s",
                        dim_name, score, quote[:100],
                    )

                verified_observed.append(normalized_point)

            if isinstance(observed_points, list):
                dim_data["observed_points"] = verified_observed

            # Flag dimensions where most evidence is unverified
            dim_total_items = len(evidence_list) + dim_observed_total
            dim_total_unverified = dim_unverified + dim_observed_unverified
            if dim_total_unverified > 0 and dim_total_items > 0:
                unverified_ratio = dim_total_unverified / dim_total_items
                if unverified_ratio > 0.5:
                    flagged_dimensions.append(dim_name)
                    logger.warning(
                        "Dimension '%s' has %.0f%% unverified evidence — "
                        "analysis may be unreliable",
                        dim_name, unverified_ratio * 100,
                    )

        # Attach verification metadata
        total_verified_items = verified_count + verified_observed_points
        total_items = total_evidence + total_observed_points
        verification_rate = (
            total_verified_items / total_items * 100 if total_items > 0 else 100
        )
        evidence_verification_rate = (
            verified_count / total_evidence * 100 if total_evidence > 0 else 100
        )
        observed_points_verification_rate = (
            verified_observed_points / total_observed_points * 100
            if total_observed_points > 0
            else 100
        )

        analysis["_evidence_verification"] = {
            "total_evidence_items": total_evidence,
            "verified": verified_count,
            "unverified": unverified_count,
            "honest_no_evidence": honest_no_evidence_count,
            "total_observed_points": total_observed_points,
            "observed_points_verified": verified_observed_points,
            "observed_points_unverified": unverified_observed_points,
            "evidence_verification_rate_pct": round(evidence_verification_rate, 1),
            "observed_points_verification_rate_pct": round(
                observed_points_verification_rate, 1
            ),
            "verification_rate_pct": round(verification_rate, 1),
            "flagged_dimensions": flagged_dimensions,
        }

        logger.info(
            "Evidence verification: %d/%d items verified (%.1f%%), %d flagged dimensions",
            total_verified_items,
            total_items,
            verification_rate,
            len(flagged_dimensions),
        )

        return analysis
