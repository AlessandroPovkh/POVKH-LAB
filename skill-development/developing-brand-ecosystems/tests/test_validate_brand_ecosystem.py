import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "validate_brand_ecosystem.py"


def load_module():
    spec = importlib.util.spec_from_file_location("validate_brand_ecosystem", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ValidateBrandEcosystemTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_valid_fixture_passes(self):
        module = load_module()
        (self.root / "BRAND.md").write_text("# Brand\n[Site](site/index.html)\n", encoding="utf-8")
        (self.root / "site").mkdir()
        (self.root / "site" / "index.html").write_text("<h1>Approved</h1>", encoding="utf-8")
        config = {"required_paths": ["BRAND.md", "site/index.html"], "public_paths": ["site"], "placeholder_patterns": ["TBD"]}
        report = module.validate(self.root, config)
        self.assertEqual(report["summary"]["errors"], 0)

    def test_reports_broken_markdown_link_and_missing_required_path(self):
        module = load_module()
        (self.root / "README.md").write_text("[Missing](docs/nope.md)\n", encoding="utf-8")
        report = module.validate(self.root, {"required_paths": ["BRAND.md"]})
        codes = {finding["code"] for finding in report["findings"]}
        self.assertIn("broken-local-link", codes)
        self.assertIn("missing-required-path", codes)

    def test_reports_placeholder_only_inside_configured_public_paths(self):
        module = load_module()
        (self.root / "public").mkdir()
        (self.root / "drafts").mkdir()
        (self.root / "public" / "index.html").write_text("Partner: TBD", encoding="utf-8")
        (self.root / "drafts" / "notes.md").write_text("TBD is allowed", encoding="utf-8")
        report = module.validate(self.root, {"public_paths": ["public"], "placeholder_patterns": ["TBD"]})
        placeholders = [finding for finding in report["findings"] if finding["code"] == "public-placeholder"]
        self.assertEqual(len(placeholders), 1)
        self.assertEqual(placeholders[0]["path"], "public/index.html")

    def test_reports_missing_font_license_declaration(self):
        module = load_module()
        (self.root / "fonts").mkdir()
        (self.root / "fonts" / "Display.ttf").write_bytes(b"font")
        report = module.validate(self.root, {"font_paths": ["fonts"]})
        self.assertIn("missing-font-license", {finding["code"] for finding in report["findings"]})

    def test_reports_missing_qa_command(self):
        module = load_module()
        (self.root / "package.json").write_text(json.dumps({"scripts": {"build": "node build.js"}}), encoding="utf-8")
        report = module.validate(self.root, {"required_qa_commands": ["npm test"]})
        self.assertIn("missing-qa-command", {finding["code"] for finding in report["findings"]})

    def test_validate_does_not_write_to_project(self):
        module = load_module()
        before = sorted(str(path.relative_to(self.root)) for path in self.root.rglob("*"))
        module.validate(self.root, {})
        after = sorted(str(path.relative_to(self.root)) for path in self.root.rglob("*"))
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
