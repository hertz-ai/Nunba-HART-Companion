# Self-Hosted GPU Runner Setup (Layer 2)

> **Why this exists** — GitHub-hosted Ubuntu runners have no NVIDIA GPU.
> Layer 1 (`tests/conftest_cuda_mock.py` + `tests/test_gpu_path_synthetic.py`)
> covers **code-path reachability** on hosted runners; this document covers
> **real CUDA execution** on a self-hosted runner so PRs touching TTS, llama,
> or VRAMManager get actual GPU validation before merge.
>
> Layer 3 (bench harness at `scripts/bench_gpu.py` + `.github/workflows/bench.yml`)
> covers **performance regression tracking**.

---

## 1. Hardware minimum

| Component   | Minimum                                | Recommended              | Why                                   |
| ----------- | -------------------------------------- | ------------------------ | ------------------------------------- |
| GPU         | NVIDIA RTX 3060 8 GB                   | RTX 3090 / 4070 Ti 16 GB | Exercises the `standard` and `full` tiers of `should_boot_draft` |
| CPU         | 8 cores                                | 12+ cores                | TTS engines spin multiple workers     |
| RAM         | 16 GB                                  | 32 GB                    | Qwen3-4B + draft + KV cache + TTS     |
| Disk        | 80 GB NVMe                             | 200 GB                   | Model weights (Qwen3-4B ≈ 3 GB, IndicParler ≈ 2 GB, Chatterbox ≈ 5.6 GB, plus intermediate caches) |
| OS          | Ubuntu 22.04 LTS (kernel ≥ 5.15)       | Ubuntu 22.04 LTS         | Matches CI-hosted environment; NVIDIA driver 525+ |
| Driver      | NVIDIA ≥ 525                           | 535+                     | Required for CUDA 12.1 wheels in `requirements.txt` |

The 8 GB floor is deliberate: it mirrors the GPU class where the
`should_boot_draft` threshold change (commit `2acf21a`) actually affects
user experience.  A 24 GB card over-provisions and hides tier-boundary
regressions; an 8 GB card exposes them.

## 2. Runner registration

1. In the GitHub repo UI: **Settings → Actions → Runners → New self-hosted runner**.
2. Choose Linux x64.  Copy the token.
3. On the GPU host:

   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   curl -o actions-runner-linux-x64.tar.gz -L \
     https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64-2.317.0.tar.gz
   tar xzf ./actions-runner-linux-x64.tar.gz
   ./config.sh --url https://github.com/hertz-ai/Nunba-HART-Companion \
               --token <TOKEN> \
               --labels self-hosted,gpu,cuda,linux,x64 \
               --name gpu-runner-01
   sudo ./svc.sh install
   sudo ./svc.sh start
   ```

4. The runner label set is **`self-hosted, gpu`** (plus auto-applied `linux`, `x64`).
   Workflows target it with:

   ```yaml
   runs-on: [self-hosted, gpu]
   ```

## 3. CUDA toolkit + driver

Host install (preferred over Docker for llama.cpp binary compat):

```bash
# NVIDIA driver
sudo apt install -y nvidia-driver-535

# CUDA 12.1 toolkit (matches torch==2.2.0+cu121 wheel)
wget https://developer.download.nvidia.com/compute/cuda/12.1.0/local_installers/cuda_12.1.0_530.30.02_linux.run
sudo sh cuda_12.1.0_530.30.02_linux.run --silent --toolkit

# nvidia-smi sanity
nvidia-smi
```

### Docker-based alternative

If the runner hosts multiple projects and you want isolation:

```bash
# NVIDIA Container Toolkit
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Sanity
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

Workflows that need Docker pass `--gpus all` via `container: image: ...` +
`options: --gpus all`.

## 4. Auto-shutdown idle runner (cost cap)

Self-hosted runners are not metered by GitHub, but if the host is a paid
cloud box (Lambda, vast.ai, RunPod) you must cap idle spend.

Install the systemd service below; it polls the runner's idle state and
suspends the host after 60 minutes of no active job.

`/etc/systemd/system/runner-idle-shutdown.service`:

```ini
[Unit]
Description=Idle-shutdown GH self-hosted runner after 60 min
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/runner_idle_watch.sh
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

`/usr/local/bin/runner_idle_watch.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
IDLE_MAX=3600  # 60 min
LAST_ACTIVE=$(date +%s)

while true; do
    if pgrep -f Runner.Worker > /dev/null; then
        LAST_ACTIVE=$(date +%s)
    fi
    now=$(date +%s)
    if (( now - LAST_ACTIVE > IDLE_MAX )); then
        logger "runner idle ${IDLE_MAX}s; shutting down"
        sudo systemctl poweroff
    fi
    sleep 60
done
```

Activate:

```bash
sudo chmod +x /usr/local/bin/runner_idle_watch.sh
sudo systemctl enable --now runner-idle-shutdown
```

For cloud providers with API-driven start/stop (EC2, Lambda Cloud), a
companion GitHub Action (`peter-evans/repository-dispatch` or a custom
webhook) wakes the host on PR open and lets the idle watcher power it
down after the test run completes.

## 5. Workflow — triggered only on GPU-relevant PRs

`paths:` filter ensures the GPU runner does NOT wake for unrelated PRs
(social UI, Cypress, docs, etc.) — essential for cost control.

`.github/workflows/gpu-tests.yml`:

```yaml
name: GPU Tests (self-hosted)

on:
  pull_request:
    branches: [main]
    paths:
      - 'tts/**'
      - 'llama/**'
      - 'integrations/service_tools/vram_manager.py'
      - 'integrations/service_tools/model_lifecycle.py'
      - 'tests/test_gpu_path_synthetic.py'
      - 'tests/test_tts_engine*.py'
      - 'tests/test_model_resilience.py'
      - 'scripts/bench_gpu.py'
      - 'requirements.txt'
      - '.github/workflows/gpu-tests.yml'
  workflow_dispatch: {}

concurrency:
  group: gpu-${{ github.ref }}
  cancel-in-progress: true

jobs:
  gpu-tests:
    runs-on: [self-hosted, gpu]
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4

      - name: Verify CUDA
        run: |
          nvidia-smi
          python3 -c "import torch; assert torch.cuda.is_available(), 'no CUDA'; print(torch.cuda.get_device_name(0))"

      - name: Install deps
        run: |
          python3 -m pip install --upgrade pip
          pip install -r requirements.txt

      - name: Run GPU-path tests (real CUDA)
        env:
          NUNBA_FORCE_GPU: '1'
          NUNBA_BENCH_MODE: 'ci'
        run: |
          # Layer-1 synthetic tests still run (double-check mock parity)
          pytest tests/test_gpu_path_synthetic.py -v
          # Real-CUDA tests: TTS engines + VRAM manager + llama config
          pytest tests/test_tts_engine.py tests/test_tts_engines.py \
                 tests/test_model_resilience.py \
                 tests/test_llama_config.py -v -m "not cpu_only"

      - name: Run bench harness
        run: python3 scripts/bench_gpu.py --out bench_results.json --quick

      - name: Upload bench artifact
        uses: actions/upload-artifact@v4
        with:
          name: bench_results_${{ github.sha }}
          path: bench_results.json
          retention-days: 90
```

## 6. Security

- Self-hosted runners execute arbitrary code from PRs.  **Never** enable
  the runner for public-fork PRs.  Set **Settings → Actions → General →
  Fork pull request workflows: Require approval for all outside collaborators**.
- The runner user should be a dedicated, non-sudo account.  Wrap it in
  AppArmor or Firejail to prevent cross-project contamination.
- Rotate the runner registration token every 90 days.
- Do not mount `/home/$USER/.ssh` or Docker socket into the runner.

## 7. Verification checklist

After setup, a maintainer should:

- [ ] Open a no-op PR touching `tts/tts_engine.py` (add a comment) and
      confirm the `gpu-tests` job fires.
- [ ] Open a no-op PR touching only docs and confirm the job does **not** fire.
- [ ] Manually dispatch the workflow and confirm `bench_results.json`
      is uploaded as an artifact.
- [ ] Leave the runner idle for 65 minutes and confirm the systemd unit
      powered the host off.

## 8. Troubleshooting

| Symptom                                     | Likely cause                         | Fix                                                               |
| ------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `torch.cuda.is_available() == False`        | CPU-only torch wheel installed       | `pip install torch==2.2.0+cu121 --index-url https://download.pytorch.org/whl/cu121` |
| `RuntimeError: CUDA error: out of memory`   | Previous test leaked a model         | Ensure `torch.cuda.empty_cache()` in test teardown; check `_oom_guard` |
| Runner shows "offline"                      | systemd service crashed              | `sudo systemctl status actions.runner.*`; check disk space         |
| `paths:` filter not firing                  | Glob is repo-root-relative           | Do **not** prefix with `./`; use `tts/**` not `./tts/**`           |
| Host powers off mid-test                    | Idle watcher's `pgrep` race          | Extend `IDLE_MAX` or check Runner.Worker process name              |

## 9. Layer comparison

| Layer | Runs on                | Covers                                 | Runtime |
| ----- | ---------------------- | -------------------------------------- | ------- |
| 1     | Hosted Ubuntu (no GPU) | GPU code-path reachability (mocked)    | < 5 s   |
| 2     | Self-hosted RTX 3060+  | Real CUDA execution, OOM, TTS engines  | 10–30 min |
| 3     | Any GPU machine        | Perf regression (tok/s, TTFB, VRAM)    | 3–5 min |

Layer 1 is the hard gate (blocks merge on mock failure); layer 2 is the
soft gate for GPU-relevant PRs (advisory until infra is stable); layer 3
tracks numbers over time and flags regressions but never blocks.
