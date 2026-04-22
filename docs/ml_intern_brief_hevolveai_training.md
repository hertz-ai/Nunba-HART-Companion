# ml-intern brief — make HevolveAI training happen for real

Paste this prompt verbatim into
<https://huggingface.co/spaces/smolagents/ml-intern>. The task is scoped,
grounded in real file paths, and expects runnable code at the end.

---

## Context

HARTOS is a Python runtime that talks to a compiled **hevolveai** package
for on-device continual learning. The learning layer has well-named
primitives (OrthogonalLoRA, RALT receiver, HiveMind, manifold credit
assignment, reality-anchored training) but every module is shipped as a
Cython `.pyd` so we can't inspect internals from the outside.

**Problem:** HARTOS calls `world_model_bridge.feed_sensor_data(...)` /
`record_action_outcome(...)` / `report_output_modality_result(...)` on
every agent interaction (see
`integrations/agent_engine/world_model_bridge.py` lines 1465, 1547, 1599,
1676). The docstrings say "for learning" but we can't tell from the
outside whether these calls actually hit a gradient step or just buffer
dashboard metrics.

If buffering-only, the AutoEconomy premise (agents compound economic
value by continually training on user interactions) is **broken at the
foundation** — no training means no evolution.

## What you need to produce

A **verifier script** that answers, with evidence, four yes/no questions:

1. Does `hevolveai.embodied_ai.learning.OrthogonalLoRA.apply_update(...)`
   actually call `optimizer.step()` (or equivalent gradient update) on a
   real `torch.nn.Module` when given mock interaction data?
2. Does `hevolveai.embodied_ai.learning.reality_anchored_training
   .RealityAnchoredTrainingRegime.step(...)` update any adapter weights
   across invocations? Measure weight-norm delta before vs after.
3. Does `world_model_bridge.feed_sensor_data(...)` flow reach
   `OrthogonalLoRA` (or any gradient path) within N calls, or does it
   terminate in a buffer?
4. On a 2-agent HiveMind call
   (`hevolveai.embodied_ai.learning.hive_mind.HiveMind.collective_think`),
   do the agents share learned state, or is the "collective" just a
   majority vote over stateless inferences?

For each question, ship:
- A 30–50 line probe script (pure Python, PyTorch only for torch APIs)
- The actual yes/no answer + the numeric evidence (weight-norm delta,
  number of gradient steps, hook fire counts)
- If the answer is "no" (training isn't real), a **minimum patch** that
  wires it up — adding `torch.optim.AdamW` + a backward call inside the
  existing `apply_update` signature without changing the API surface
  used by `world_model_bridge.py`.

## Constraints (non-negotiable)

- Do NOT change the public API of `OrthogonalLoRA`, `RALTReceiver`,
  `HiveMind`, or `RealityAnchoredTrainingRegime`. The wrapper code in
  `HARTOS/integrations/agent_engine/world_model_bridge.py` is load-bearing
  and cannot be touched.
- The patch must run in the existing `python-embed` frozen interpreter
  (Python 3.12 on Windows) — no new heavyweight deps. torch is already
  available at 2.6.0+cu124.
- Any new optimizer state must be persisted under
  `~/.hevolve/<agent_id>/lora_state.pt` (per-agent sovereignty — no
  global shared state).
- A reality-anchor check must gate every update: if the input batch
  doesn't pass `RealityAnchorHash.verify()`, skip the gradient step and
  log. No poisoned data, ever.
- Respect the Hive mission — never introduce a code path that trains on
  destructive / weaponizing / deceptive content. If the prompt
  `is_destructive` check from `security.hive_guardrails.is_destructive_content`
  flags a batch, skip.

## Grounding files (ordered by relevance)

```
C:/Users/sathi/PycharmProjects/hevolveai/src/hevolveai/embodied_ai/learning/__init__.py
C:/Users/sathi/PycharmProjects/hevolveai/src/hevolveai/embodied_ai/learning/orthogonal_lora.py
C:/Users/sathi/PycharmProjects/hevolveai/src/hevolveai/embodied_ai/learning/reality_anchored_training.py
C:/Users/sathi/PycharmProjects/hevolveai/src/hevolveai/embodied_ai/learning/hive_mind.py
C:/Users/sathi/PycharmProjects/HARTOS/integrations/agent_engine/world_model_bridge.py      # lines 1465, 1547, 1599, 1676
C:/Users/sathi/PycharmProjects/HARTOS/integrations/agent_engine/autoresearch_loop.py
C:/Users/sathi/PycharmProjects/HARTOS/security/hive_guardrails.py                          # ConstitutionalFilter, DESTRUCTIVE_PATTERNS
```

## Expected deliverables

1. `scripts/verify_real_training.py` — runs all 4 probes, prints a
   markdown report.
2. `patches/orthogonal_lora_real_training.py` — drop-in if #1 answers
   "no" for question 1.
3. A short README explaining what was found and what the patch does.

## Acceptance

- Running `python scripts/verify_real_training.py` prints ALL FOUR
  answers with numeric evidence on a fresh Nunba install in ≤60 s.
- If a patch is included, applying it plus re-running the verifier
  flips the answer from "no" to "yes" for that question, WITHOUT
  regressing any other question's answer.
- No new imports outside the stdlib + `torch` + `hevolveai` tree.

Start by reading the three hevolveai `.py` shims (they're not compiled —
the `.py` files alongside the `.pyd` usually re-export) and
`world_model_bridge.py` lines 1450–1700. Report findings before writing
code.
