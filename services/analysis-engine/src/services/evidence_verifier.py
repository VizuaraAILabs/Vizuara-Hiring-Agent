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
            - "_evidence_verification" metadata added
        """
        total_evidence = 0
        verified_count = 0
        unverified_count = 0
        honest_no_evidence_count = 0
        flagged_dimensions: list[str] = []

        dimensions = analysis.get("dimensions", {})

        for dim_name, dim_data in dimensions.items():
            if not isinstance(dim_data, dict):
                continue

            evidence_list = dim_data.get("evidence", [])
            verified_evidence: list[str] = []
            dim_unverified = 0

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
                    verified_evidence.append(f"[UNVERIFIED] {item}")
                    logger.debug(
                        "Unverified evidence in %s (score=%.2f): %s",
                        dim_name, score, item[:100],
                    )

            dim_data["evidence"] = verified_evidence

            # Flag dimensions where most evidence is unverified
            if dim_unverified > 0 and len(evidence_list) > 0:
                unverified_ratio = dim_unverified / len(evidence_list)
                if unverified_ratio > 0.5:
                    flagged_dimensions.append(dim_name)
                    logger.warning(
                        "Dimension '%s' has %.0f%% unverified evidence — "
                        "analysis may be unreliable",
                        dim_name, unverified_ratio * 100,
                    )

        # Attach verification metadata
        verification_rate = (
            verified_count / total_evidence * 100 if total_evidence > 0 else 100
        )

        analysis["_evidence_verification"] = {
            "total_evidence_items": total_evidence,
            "verified": verified_count,
            "unverified": unverified_count,
            "honest_no_evidence": honest_no_evidence_count,
            "verification_rate_pct": round(verification_rate, 1),
            "flagged_dimensions": flagged_dimensions,
        }

        logger.info(
            "Evidence verification: %d/%d verified (%.1f%%), %d flagged dimensions",
            verified_count, total_evidence, verification_rate, len(flagged_dimensions),
        )

        return analysis
