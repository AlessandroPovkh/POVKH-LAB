import re
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).parents[1]
ALLOWED_STATUSES = {
    "original-method",
    "orchestration",
    "adapted-from-skill",
    "project-case",
    "generic-codex-practice",
}


class ProvenanceContractTests(unittest.TestCase):
    def test_skill_contains_explicit_routing_table(self):
        text = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("## Skill routing and provenance", text)
        self.assertRegex(text, r"\| Task \| Primary skill \| Role of `developing-brand-ecosystems` \| Evidence \|")
        self.assertIn("references/skill-provenance-map.md", text)

    def test_every_reference_has_exactly_one_allowed_status_and_attribution(self):
        references = sorted((SKILL_ROOT / "references").glob("*.md"))
        self.assertGreaterEqual(len(references), 12)
        for path in references:
            with self.subTest(reference=path.name):
                text = path.read_text(encoding="utf-8")
                statuses = re.findall(r"^Status: `([^`]+)`$", text, flags=re.MULTILINE)
                self.assertEqual(len(statuses), 1)
                self.assertIn(statuses[0], ALLOWED_STATUSES)
                self.assertIn("## Skill attribution", text)
                self.assertIn("Primary owner", text)
                self.assertIn("Evidence", text)
                self.assertIn("Added by `developing-brand-ecosystems`", text)

    def test_provenance_map_distinguishes_tools_from_agent_skills(self):
        text = (SKILL_ROOT / "references" / "skill-provenance-map.md").read_text(encoding="utf-8")
        self.assertIn("Agent Skill invocation", text)
        self.assertIn("library/tool usage", text)
        self.assertIn("not evidenced", text)
        for name in ("agents-best-practices", "skill-creator", "writing-skills", "playwright", "ui-ux-pro-max", "imagegen"):
            self.assertIn(f"`{name}`", text)


if __name__ == "__main__":
    unittest.main()
