from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

google_module = types.ModuleType("google")
genai_module = types.ModuleType("google.genai")
genai_types_module = types.ModuleType("google.genai.types")
genai_module.types = genai_types_module

sys.modules.setdefault("google", google_module)
sys.modules.setdefault("google.genai", genai_module)
sys.modules.setdefault("google.genai.types", genai_types_module)

from src.services.claude_analyzer import ClaudeAnalyzer


class ClaudeAnalyzerChunkingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.analyzer = object.__new__(ClaudeAnalyzer)

    def test_splits_large_transcript_on_segment_boundaries(self) -> None:
        transcript = "\n\n".join(
            [
                "============================================================\nCANDIDATE SESSION TRANSCRIPT",
                "--- [CANDIDATE COMMAND] (#1) [t1] ---\npython one.py",
                "--- [AI RESPONSE] (#2) [t2] ---\n" + ("A" * 120),
                "--- [CANDIDATE COMMAND] (#3) [t3] ---\npytest",
                "--- [AI RESPONSE] (#4) [t4] ---\n" + ("B" * 120),
            ]
        )

        with patch("src.services.claude_analyzer._TRANSCRIPT_CHUNK_TARGET_CHARS", 180):
            chunks = self.analyzer._split_transcript_for_pass1(transcript)

        self.assertGreater(len(chunks), 1)
        combined = "\n".join(chunks)
        self.assertIn("#1", combined)
        self.assertIn("#2", combined)
        self.assertIn("#3", combined)
        self.assertIn("#4", combined)

    def test_splits_large_single_segment_with_segment_ref_on_each_part(self) -> None:
        block = "--- [AI RESPONSE] (#12) [t2] ---\n" + ("A" * 260)

        with patch("src.services.claude_analyzer._TRANSCRIPT_CHUNK_TARGET_CHARS", 120):
            chunks = self.analyzer._split_transcript_for_pass1(block)

        self.assertGreater(len(chunks), 1)
        for chunk in chunks:
            self.assertIn("--- [AI RESPONSE] (#12) [t2] ---", chunk)
            self.assertIn("Continuation", chunk)

    def test_does_not_emit_prefix_only_chunk_for_large_first_segment(self) -> None:
        transcript = "\n\n".join(
            [
                "============================================================\nCANDIDATE SESSION TRANSCRIPT",
                "--- [AI RESPONSE] (#1) [t1] ---\n" + ("A" * 260),
            ]
        )

        with patch("src.services.claude_analyzer._TRANSCRIPT_CHUNK_TARGET_CHARS", 120):
            chunks = self.analyzer._split_transcript_for_pass1(transcript)

        self.assertGreater(len(chunks), 1)
        for chunk in chunks:
            self.assertIn("--- [AI RESPONSE] (#1) [t1] ---", chunk)

    def test_merge_observation_chunks_dedupes_and_combines_summary(self) -> None:
        observations = self.analyzer._merge_observation_chunks(
            [
                {
                    "candidate_actions": [
                        {
                            "segment_ref": "#1",
                            "action_type": "command",
                            "description": "Listed files",
                            "verbatim_quote": "ls",
                        },
                        {
                            "segment_ref": "#1",
                            "action_type": "command",
                            "description": "Listed files duplicate",
                            "verbatim_quote": "ls",
                        },
                    ],
                    "ai_interactions": [
                        {"segment_ref": "#2", "summary": "AI suggested tests"}
                    ],
                    "session_summary": {
                        "session_duration_estimate_minutes": 10,
                        "tools_used": ["pytest"],
                        "problem_solving_attempted": True,
                        "bugs_identified": 1,
                        "bugs_fixed": 0,
                        "tests_run": False,
                        "code_written_or_modified": False,
                    },
                },
                ["unexpected"],
                {
                    "candidate_actions": [
                        {
                            "segment_ref": "#3",
                            "action_type": "testing",
                            "description": "Ran tests",
                            "verbatim_quote": "pytest",
                        }
                    ],
                    "ai_interactions": [
                        {"segment_ref": "#4", "summary": "AI interpreted failure"}
                    ],
                    "session_summary": {
                        "session_duration_estimate_minutes": 25,
                        "tools_used": ["pytest", "rg"],
                        "problem_solving_attempted": False,
                        "bugs_identified": 2,
                        "bugs_fixed": 1,
                        "tests_run": True,
                        "code_written_or_modified": True,
                    },
                },
            ]
        )

        self.assertEqual(len(observations["candidate_actions"]), 2)
        self.assertEqual(len(observations["ai_interactions"]), 2)
        summary = observations["session_summary"]
        self.assertEqual(summary["total_candidate_actions"], 2)
        self.assertEqual(summary["session_duration_estimate_minutes"], 25)
        self.assertEqual(summary["tools_used"], ["pytest", "rg"])
        self.assertTrue(summary["problem_solving_attempted"])
        self.assertEqual(summary["bugs_identified"], 3)
        self.assertEqual(summary["bugs_fixed"], 1)
        self.assertTrue(summary["tests_run"])
        self.assertTrue(summary["code_written_or_modified"])

    def test_merge_observation_chunks_ignores_bad_tools_used_shape(self) -> None:
        observations = self.analyzer._merge_observation_chunks(
            [
                {
                    "candidate_actions": [],
                    "ai_interactions": [],
                    "session_summary": {"tools_used": "pytest"},
                }
            ]
        )

        self.assertEqual(observations["session_summary"]["tools_used"], [])

    def test_merge_observation_chunks_caps_large_observation_payloads(self) -> None:
        chunk = {
            "candidate_actions": [
                {
                    "segment_ref": f"#{idx}",
                    "action_type": "command",
                    "description": "x" * 1200,
                    "verbatim_quote": "y" * 1200,
                }
                for idx in range(1, 11)
            ],
            "ai_interactions": [
                {"segment_ref": f"#ai-{idx}", "summary": "z" * 1200}
                for idx in range(1, 9)
            ],
            "session_summary": {
                "total_candidate_actions": 10,
                "session_duration_estimate_minutes": 10,
                "tools_used": [],
                "problem_solving_attempted": True,
                "bugs_identified": 0,
                "bugs_fixed": 0,
                "tests_run": False,
                "code_written_or_modified": False,
            },
        }

        with (
            patch("src.services.claude_analyzer._MAX_CANDIDATE_ACTIONS_FOR_SCORING", 4),
            patch("src.services.claude_analyzer._MAX_AI_OBSERVATIONS_FOR_SCORING", 3),
        ):
            observations = self.analyzer._merge_observation_chunks([chunk])

        self.assertEqual(len(observations["candidate_actions"]), 4)
        self.assertEqual(len(observations["ai_interactions"]), 3)
        self.assertEqual(observations["session_summary"]["total_candidate_actions"], 10)
        self.assertEqual(
            observations["session_summary"]["candidate_actions_retained_for_scoring"],
            4,
        )
        self.assertEqual(
            observations["session_summary"]["ai_interactions_retained_for_scoring"],
            3,
        )
        self.assertLessEqual(len(observations["candidate_actions"][0]["description"]), 703)
        self.assertLessEqual(len(observations["candidate_actions"][0]["verbatim_quote"]), 903)
        self.assertLessEqual(len(observations["ai_interactions"][0]["summary"]), 703)

    def test_caps_pass1_chunks_for_extreme_transcripts(self) -> None:
        chunks = [f"chunk-{idx}" for idx in range(10)]

        with patch("src.services.claude_analyzer._MAX_PASS1_CHUNKS", 4):
            capped = self.analyzer._cap_ordered_text_chunks(chunks, 4)

        self.assertEqual(len(capped), 4)
        self.assertEqual(capped[0], "chunk-0")
        self.assertEqual(capped[-1], "chunk-9")

    def test_fits_observations_to_scoring_character_budget(self) -> None:
        observations = {
            "candidate_actions": [
                {
                    "segment_ref": f"#{idx}",
                    "action_type": "command",
                    "description": "description " * 80,
                    "verbatim_quote": "quote " * 120,
                }
                for idx in range(1, 80)
            ],
            "ai_interactions": [
                {"segment_ref": f"#ai-{idx}", "summary": "summary " * 100}
                for idx in range(1, 80)
            ],
            "session_summary": {
                "total_candidate_actions": 79,
                "session_duration_estimate_minutes": 10,
                "tools_used": [],
                "problem_solving_attempted": True,
                "bugs_identified": 0,
                "bugs_fixed": 0,
                "tests_run": False,
                "code_written_or_modified": False,
            },
        }

        with patch("src.services.claude_analyzer._MAX_SCORING_OBSERVATIONS_CHARS", 8000):
            fitted = self.analyzer._fit_observations_to_scoring_budget(observations)

        self.assertLessEqual(self.analyzer._observations_payload_chars(fitted), 8000)
        self.assertTrue(fitted["session_summary"]["observations_reduced_for_scoring"])
        self.assertEqual(fitted["session_summary"]["total_candidate_actions"], 79)
        self.assertLess(len(fitted["candidate_actions"]), 79)
        self.assertLess(len(fitted["ai_interactions"]), 79)


if __name__ == "__main__":
    unittest.main()
