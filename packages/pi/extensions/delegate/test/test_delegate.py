import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("delegate_picker", Path(__file__).parents[1] / "picker.py")
delegate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delegate)


class DelegatePickerTests(unittest.TestCase):
    def request(self):
        return {"picker": "/config with spaces/picker.py", "command": ["/pi", "--", "Use source session.\nFix $value; don't run a shell."]}

    def test_confirmed_selection_hands_structured_command_to_existing_lifecycle(self):
        picker = Mock()
        picker.dec.return_value = "/selected repo"
        request = self.request()
        with patch.object(delegate.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "encoded\n")), \
             patch("builtins.input", side_effect=["fix-thing", "yes"]):
            delegate.delegate(request, picker)
        picker.create_worktree.assert_called_once_with("/selected repo", command=request["command"], branch="fix-thing")

    def test_cancelled_picker_or_setup_confirmation_does_not_create_worktree(self):
        for code, output, answers in [(130, "", []), (0, "encoded\n", ["fix-thing", "no"])]:
            with self.subTest(code=code):
                picker = Mock()
                picker.dec.return_value = "/selected repo"
                with patch.object(delegate.subprocess, "run", return_value=subprocess.CompletedProcess([], code, output)), \
                     patch("builtins.input", side_effect=answers):
                    delegate.delegate(self.request(), picker)
                picker.create_worktree.assert_not_called()

    def test_picker_errors_are_not_mistaken_for_cancellation(self):
        picker = Mock()
        with patch.object(delegate.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "")):
            with self.assertRaisesRegex(RuntimeError, "exited with 1"):
                delegate.delegate(self.request(), picker)
        picker.create_worktree.assert_not_called()


if __name__ == "__main__":
    unittest.main()
