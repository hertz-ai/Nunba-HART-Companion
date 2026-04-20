# Indic Cohort Benchmark

Held-out 50-prompt evaluation set for the cohort-aware draft-model ship gate
(flagged on commit 2acf21a by data-scientist).

## Purpose

Validate that the `should_boot_draft()` gate in `llama/llama_config.py` does
not regress English-only users while protecting Indic users from TTS
starvation on ≤8 GB VRAM.

Quality gate: median tok/s on the `(lang=en, draft=True, vram=8GB)` cohort
must not drop more than 15 % vs the `(lang=en, draft=False)` baseline,
**or** the user must be on an Indic language with a measurably-working
TTS at boot time.

## Composition

| Cohort | Count | Languages                                      |
|--------|-------|------------------------------------------------|
| en     | 25    | English                                        |
| ta     | 5     | Tamil                                          |
| hi     | 5     | Hindi                                          |
| bn     | 5     | Bengali                                        |
| te     | 5     | Telugu                                         |
| mr     | 5     | Marathi                                        |

Each entry has:

```json
{"id": "...", "lang": "...", "prompt": "...",
 "expected_response_lang": "...", "min_tokens": 40}
```

## Sources & contamination control

Prompts are *paraphrased* from three public benchmarks so the held-out set
does not overlap with likely training data:

- **MMLU-hi / MMLU-ta** — Hindi and Tamil translations of MMLU
  (Hendrycks et al. 2021; Indic translations by AI4Bharat, 2023).
- **Belebele** (Meta AI, 2024) — multilingual reading comprehension
  covering Bengali, Telugu, and Marathi.
- **Generic dev prompts** — 10 English prompts were hand-written to cover
  coding, math, reasoning, summarisation, and creative writing.

No verbatim reuse — every prompt was re-phrased, shortened, or
re-targeted before inclusion. This is a standard mitigation against
train-set contamination (Magar & Schwartz 2022). The prompts are intended
as a **smoke-test** cohort, not a leaderboard submission.

## Running

```bash
python scripts/bench_indic_cohort.py
```

Results land in `bench/results/indic_cohort_<timestamp>.json`.

## Interpreting the output

Aggregation produces, for each `(lang, draft_enabled)` cell:

- `median_tok_per_sec`
- `p50_first_token_ms` / `p99_first_token_ms`
- `p99_total_latency_ms`
- `tts_first_byte_ms` (median)
- `n` samples + 95 % bootstrap CI on median tok/s

The gate is considered **passing** if:

```
median(en, draft=True)  >=  0.85 * median(en, draft=False)
AND
all indic cohorts record tts_first_byte_ms != null
```
