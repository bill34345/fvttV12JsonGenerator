"""Offline, owned-temporary-root checks for verify.py."""

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile


SCRIPT = Path(__file__).with_name("verify.py")
MODULE_ID = "test-module"
VERSION = "1.2.3"
MANIFEST = json.dumps({"id": MODULE_ID, "version": VERSION}).encode()


class VerifyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="module-artifacts-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.stage = self.root / "stage"
        self.stage.mkdir()
        (self.stage / "module.json").write_bytes(MANIFEST)
        (self.stage / "scripts").mkdir()
        (self.stage / "scripts" / "module.js").write_bytes(b"payload")
        self.archive = self.root / "module.zip"
        self.write_zip()

    def write_zip(self, entries=None):
        if entries is None:
            entries = [("module.json", MANIFEST), ("scripts/module.js", b"payload")]
        with zipfile.ZipFile(self.archive, "w", compression=zipfile.ZIP_STORED) as zipped:
            for name, content in entries:
                zipped.writestr(name, content)

    def run_check(self, *extra):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--module-root", str(self.stage),
             "--archive", str(self.archive), "--module-id", MODULE_ID,
             "--version", VERSION, *extra],
            text=True, capture_output=True, check=False,
        )
        return result.returncode, json.loads(result.stdout)

    def test_reports_file_and_archive_digests_without_writing(self):
        before = {path.relative_to(self.root).as_posix(): path.read_bytes()
                  for path in self.root.rglob("*") if path.is_file()}
        code, report = self.run_check("--expected-paths", '["module.json","scripts/module.js"]')
        self.assertEqual(code, 0)
        self.assertTrue(report["ok"])
        self.assertEqual(report["scope"], "file-integrity-only")
        self.assertEqual(report["moduleId"], MODULE_ID)
        self.assertEqual([entry["path"] for entry in report["files"]], ["module.json", "scripts/module.js"])
        self.assertEqual(report["files"][1]["sha256"], hashlib.sha256(b"payload").hexdigest())
        self.assertEqual(report["archive"]["sha256"], hashlib.sha256(self.archive.read_bytes()).hexdigest())
        self.assertEqual(before, {path.relative_to(self.root).as_posix(): path.read_bytes()
                                  for path in self.root.rglob("*") if path.is_file()})

    def test_rejects_crc_corruption_and_different_bytes(self):
        raw = self.archive.read_bytes()
        self.archive.write_bytes(raw.replace(b"payload", b"payloXd", 1))
        code, report = self.run_check()
        self.assertNotEqual(code, 0)
        self.assertFalse(report["ok"])
        self.assertIn("CRC", report["error"])
        self.write_zip([("module.json", MANIFEST), ("scripts/module.js", b"different")])
        code, report = self.run_check()
        self.assertNotEqual(code, 0)
        self.assertIn("bytes differ", report["error"])

    def test_rejects_missing_extra_and_owner_path_mismatch(self):
        self.write_zip([("module.json", MANIFEST)])
        self.assertIn("paths differ", self.run_check()[1]["error"])
        self.write_zip([("module.json", MANIFEST), ("scripts/module.js", b"payload"), ("extra", b"x")])
        self.assertIn("paths differ", self.run_check()[1]["error"])
        self.write_zip()
        code, report = self.run_check("--expected-paths", '["module.json"]')
        self.assertNotEqual(code, 0)
        self.assertIn("expected paths", report["error"])

    def test_rejects_duplicate_traversal_directory_and_zip_link(self):
        cases = [
            [("module.json", MANIFEST), ("module.json", MANIFEST)],
            [("module.json", MANIFEST), ("../outside", b"x")],
            [("module.json", MANIFEST), ("/absolute", b"x")],
            [("module.json", MANIFEST), ("nested/", b"")],
        ]
        for entries in cases:
            with self.subTest(entries=[name for name, _ in entries]):
                self.write_zip(entries)
                code, report = self.run_check()
                self.assertNotEqual(code, 0)
                self.assertFalse(report["ok"])
        link = zipfile.ZipInfo("link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.write_zip([("module.json", MANIFEST), (link, b"target")])
        code, report = self.run_check()
        self.assertNotEqual(code, 0)
        self.assertIn("special entry", report["error"])

    def test_rejects_foreign_manifest(self):
        foreign = json.dumps({"id": "other-module", "version": VERSION}).encode()
        (self.stage / "module.json").write_bytes(foreign)
        self.write_zip([("module.json", foreign), ("scripts/module.js", b"payload")])
        code, report = self.run_check()
        self.assertNotEqual(code, 0)
        self.assertIn("identity", report["error"])

    def test_rejects_stage_symlink_when_supported(self):
        target = self.root / "target.txt"
        target.write_text("outside stage", encoding="utf-8")
        try:
            os.symlink(target, self.stage / "linked.txt")
        except OSError as error:
            self.skipTest(f"symlinks unavailable: {error}")
        code, report = self.run_check()
        self.assertNotEqual(code, 0)
        self.assertIn("link or junction", report["error"])


if __name__ == "__main__":
    unittest.main()
