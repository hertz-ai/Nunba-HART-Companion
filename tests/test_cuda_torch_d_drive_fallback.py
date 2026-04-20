"""Stage-B Symptom #7 FT — CUDA torch ENOSPC -> D: drive fallback.

Guards the commit b0e5020 path (install_gpu_torch in
tts/package_installer.py). If the primary C: install hits ENOSPC
the installer MUST retarget D:\\.nunba\\site-packages\\ instead of
failing the whole GPU setup.

Simulates:
- First _run_pip call: returns (False, '... No space left on device ...')
- Second _run_pip call (D: retry): returns (True, 'installed')
- Asserts the retry was issued with --target D:\\.nunba\\site-packages

Also guards:
- Non-ENOSPC failures do NOT trigger the D: retry (preserves error
  semantics — wrong-proxy / 403 / checksum should bubble up, not
  get mistaken for disk pressure).
- Success on first try skips the retry entirely.

Runs cross-platform by mocking: no real D: drive needed; no pip
subprocess spawned; no GPU detection needed (_run_pip is the only
surface touched).
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch


class CudaTorchDDriveFallbackTests(unittest.TestCase):
    def _install_with_runs(self, run_pip_side_effect, gpu='nvidia'):
        """Run install_gpu_torch under the given _run_pip side effects.

        Returns the list of _run_pip call args (one per call) for
        assertions about retry behavior.
        """
        from tts import package_installer as pi

        calls = []

        def fake_run_pip(args, progress_cb=None, timeout=None):
            calls.append(list(args))
            nonlocal run_pip_side_effect
            if callable(run_pip_side_effect):
                return run_pip_side_effect(args)
            if isinstance(run_pip_side_effect, list):
                return run_pip_side_effect.pop(0)
            return run_pip_side_effect

        with patch.object(pi, "_run_pip", side_effect=fake_run_pip) as m:
            with patch.object(pi, "get_torch_variant", return_value="cpu"):
                with patch.object(pi, "get_user_site_packages",
                                  return_value="C:\\Users\\test\\.nunba\\site-packages"):
                    with patch.object(pi, "has_nvidia_gpu", return_value=(gpu == "nvidia")):
                        # Mock get_embed_site_packages so the stub-cleanup block
                        # doesn't error when torch/ doesn't exist.
                        with patch.object(pi, "get_embed_site_packages", return_value=None):
                            # Detect gpu via a patched detect_gpu at the
                            # top of install_gpu_torch
                            with patch("integrations.service_tools.vram_manager.detect_gpu",
                                       return_value={"name": "NVIDIA RTX 4080",
                                                     "cuda_available": True}):
                                with patch("os.makedirs"):  # Don't actually mkdir
                                    ok, msg = pi.install_gpu_torch()
            return calls, ok, msg

    def test_enospc_on_c_retries_to_d_drive(self):
        """Primary ENOSPC -> D: retry with --target flag."""
        side = [
            (False, "ERROR: Could not install packages... No space left on device"),
            (True,  "Successfully installed torch-2.4.0+cu124"),
        ]
        calls, ok, msg = self._install_with_runs(side)

        self.assertTrue(ok, f"Expected success after D: retry, got {msg}")
        self.assertEqual(len(calls), 2, f"Expected 2 pip calls, got {len(calls)}")

        # Second call MUST include --target pointing at D:\
        second = calls[1]
        self.assertIn("--target", second)
        target_arg = second[second.index("--target") + 1]
        self.assertTrue(
            target_arg.startswith("D:"),
            f"D: retry target must be on D: drive, got {target_arg!r}",
        )
        self.assertIn(".nunba", target_arg)

    def test_non_enospc_failure_does_not_retry_d(self):
        """A non-ENOSPC failure (403, 404, proxy) must NOT retry on D:.
        Otherwise you silently mask real pip errors as disk pressure."""
        side = [
            (False, "ERROR: Could not find a version that satisfies the requirement torch"),
        ]
        calls, ok, msg = self._install_with_runs(side)

        self.assertFalse(ok)
        self.assertEqual(
            len(calls), 1,
            "Non-ENOSPC failure must NOT trigger D: retry"
        )

    def test_success_on_first_try_skips_retry(self):
        """Happy path: one _run_pip call, success, no D: retry."""
        side = [
            (True, "Successfully installed torch-2.4.0+cu124"),
        ]
        calls, ok, msg = self._install_with_runs(side)

        self.assertTrue(ok)
        self.assertEqual(
            len(calls), 1,
            "Happy path must NOT issue a second pip call"
        )

    def test_d_retry_uses_no_deps_to_avoid_sub_enospc(self):
        """The D: retry must pass --no-deps because the dep tree (nvidia-
        cublas, cudnn, etc.) might also ENOSPC — spec keeps the retry
        narrow so the operator can install deps separately."""
        side = [
            (False, "No space left on device"),
            (True, "ok"),
        ]
        calls, ok, msg = self._install_with_runs(side)

        self.assertTrue(ok)
        self.assertIn("--no-deps", calls[1])


if __name__ == "__main__":
    unittest.main()
