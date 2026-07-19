import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "inspect_brand_ecosystem.py"


def load_module():
    spec = importlib.util.spec_from_file_location("inspect_brand_ecosystem", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class InspectBrandEcosystemTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "BRAND-GUIDE.md").write_text("# Brand\n", encoding="utf-8")
        (self.root / "package.json").write_text(json.dumps({"scripts": {"test": "node test.js"}}), encoding="utf-8")
        (self.root / "assets" / "fonts").mkdir(parents=True)
        (self.root / "assets" / "fonts" / "Display.ttf").write_bytes(b"font")
        (self.root / "assets" / "fonts" / "OFL.txt").write_text("license", encoding="utf-8")
        (self.root / "site").mkdir()
        (self.root / "site" / "index.html").write_text("<h1>Product</h1>", encoding="utf-8")
        (self.root / "node_modules").mkdir()
        (self.root / "node_modules" / "noise.js").write_text("ignored", encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_inspect_detects_sources_stack_fonts_touchpoints_and_qa(self):
        module = load_module()
        report = module.inspect(self.root)
        self.assertEqual(report["root"], str(self.root.resolve()))
        self.assertIn("BRAND-GUIDE.md", report["normative_sources"])
        self.assertIn("package.json", report["dependency_manifests"])
        self.assertEqual(report["fonts"][0]["license_status"], "declared-nearby")
        self.assertIn("digital-product", report["touchpoint_signals"])
        self.assertEqual(report["qa_commands"], ["npm test"])
        self.assertNotIn("node_modules/noise.js", report["files"])

    def test_render_json_is_deterministic(self):
        module = load_module()
        report = module.inspect(self.root)
        first = module.render(report, "json")
        second = module.render(report, "json")
        self.assertEqual(first, second)
        self.assertEqual(json.loads(first)["schema_version"], 1)

    def test_inspect_does_not_write_to_project(self):
        module = load_module()
        before = sorted(str(path.relative_to(self.root)) for path in self.root.rglob("*"))
        module.inspect(self.root)
        after = sorted(str(path.relative_to(self.root)) for path in self.root.rglob("*"))
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
