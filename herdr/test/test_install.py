import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "installer", Path(__file__).parents[1] / "scripts/install.py"
)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "source"
        self.home = Path(temporary.name) / "home"
        self.home.mkdir()
        icons = self.root / "herdr/mods/toolkit-workbench/icons"
        icons.mkdir(parents=True)
        (icons / "eye.svg").write_text("<svg/>")
        layouts = self.root / "herdr/layouts"
        layouts.mkdir()
        (layouts / "toolkit-workbench.json").write_text("{}")
        (layouts / "toolkit-workbench.svg").write_text('<svg id="preview"/>')
        binary = self.root / ".build/herdr/herdr-github-status"
        binary.parent.mkdir(parents=True)
        binary.touch()
        helper = self.root / "herdr/scripts/picker.py"
        helper.parent.mkdir(parents=True)
        helper.touch()

    def test_install_check_and_idempotence_preserve_settings(self):
        settings = self.home / "settings.json"
        settings.write_text('{"font_size":17}')
        installer.apply(self.home, root=self.root)
        installer.apply(self.home, root=self.root)
        installer.apply(self.home, check=True, root=self.root)
        self.assertEqual(settings.read_text(), '{"font_size":17}')
        preview = self.home / "assets/toolkit-workbench/preview.svg"
        self.assertFalse(preview.is_symlink())
        self.assertEqual(preview.read_text(), '<svg id="preview"/>')

    def test_copied_assets_stay_inside_app_and_protect_local_edits(self):
        installer.apply(self.home, root=self.root)
        icon = self.home / "assets/toolkit-workbench/eye.svg"
        self.assertFalse(icon.is_symlink())
        (self.root / "herdr/mods/toolkit-workbench/icons/eye.svg").write_text('<svg width="16"/>')
        with self.assertRaisesRegex(ValueError, "outdated"):
            installer.apply(self.home, check=True, root=self.root)
        installer.apply(self.home, root=self.root)
        self.assertEqual(icon.read_text(), '<svg width="16"/>')
        icon.write_text("personal change")
        with self.assertRaisesRegex(ValueError, "locally modified"):
            installer.apply(self.home, root=self.root)
        self.assertEqual(icon.read_text(), "personal change")

    def test_late_collision_prevents_partial_install(self):
        binary = self.home / "bin/toolkit-github-status"
        binary.parent.mkdir()
        binary.write_text("mine")
        with self.assertRaisesRegex(ValueError, "non-symlink"):
            installer.apply(self.home, root=self.root)
        self.assertFalse((self.home / "mods").exists())
        self.assertEqual(binary.read_text(), "mine")

    def test_unrelated_and_broken_links_are_not_replaced(self):
        link = self.home / "mods/toolkit-workbench"
        link.parent.mkdir()
        link.symlink_to(self.home / "missing")
        with self.assertRaisesRegex(ValueError, "unrelated"):
            installer.apply(self.home, root=self.root)
        self.assertTrue(link.is_symlink())

    def test_asset_collision_is_checked_before_creating_links(self):
        assets = self.home / "assets/toolkit-workbench"
        assets.mkdir(parents=True)
        (assets / "mine.svg").write_text("personal asset")
        with self.assertRaisesRegex(ValueError, "unowned"):
            installer.apply(self.home, root=self.root)
        self.assertFalse((self.home / "mods").exists())
        self.assertEqual((assets / "mine.svg").read_text(), "personal asset")

    def test_invalid_manifest_stops_with_a_useful_error(self):
        installer.apply(self.home, root=self.root)
        manifest = self.home / "assets/toolkit-workbench/manifest.json"
        manifest.write_text('{"owner":"corymhall/toolkit:workbench-assets-v1","files":[]}')
        with self.assertRaisesRegex(ValueError, "Invalid asset manifest"):
            installer.apply(self.home, root=self.root)


if __name__ == "__main__":
    unittest.main()
