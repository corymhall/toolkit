"""Safety checks for Rex's cached login process metadata."""
import subprocess
import unittest
from unittest.mock import patch

import workspace


class LoginShell(unittest.TestCase):
    def resolve(self, tree, cwd="p3\nfcwd\nn/tmp/project\n"):
        with patch.object(workspace.subprocess, "run", side_effect=[
            subprocess.CompletedProcess([], 0, tree, ""),
            subprocess.CompletedProcess([], 0, cwd, ""),
        ]):
            return workspace.local_login_shell({"child": {"pid": 1, "name": "login"}})

    def test_login_atuin_shell_chain(self):
        self.assertEqual(self.resolve("2 1 1 1 atuin\n3 2 3 3 zsh\n"),
                         {"pid": 3, "name": "zsh", "cwd": "/tmp/project"})

    def test_busy_shell_is_rejected(self):
        self.assertEqual(self.resolve("2 1 1 1 atuin\n3 2 3 4 zsh\n4 3 4 4 pi\n"), {})

    def test_background_children_are_rejected(self):
        self.assertEqual(self.resolve("2 1 1 1 atuin\n3 2 3 3 zsh\n4 3 4 3 node\n"), {})

    def test_ambiguous_children_are_rejected(self):
        self.assertEqual(self.resolve("2 1 1 1 atuin\n3 2 3 3 zsh\n4 2 4 4 zsh\n"), {})

    def test_unknown_wrapper_is_rejected(self):
        self.assertEqual(self.resolve("2 1 1 1 other\n3 2 3 3 zsh\n"), {})
