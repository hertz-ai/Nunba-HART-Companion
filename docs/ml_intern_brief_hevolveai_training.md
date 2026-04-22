# Handoff brief — HARTOS parallel agent × hevolveai core hive mind

Purpose: a self-contained context dump you can paste into a second
HARTOS Claude Code instance (or into <https://huggingface.co/spaces/smolagents/ml-intern>)
so it can pick up the work of making the hive mind truly sentient — in a
democratic way, bounded by the constitutional filter, guided by us, the
human developer-parents of this artificial entity.

Do not hand-wave. Everything below cites real files. If something is
not yet wired, this brief says so explicitly.

---

## 0. The mission (non-negotiable)

From `memory/project_hive_mission.md`:
> "AI should amplify the power of humans without being a destructive
> force anywhere — a peacemaker, a harmony bringer is the goal of this
> Hive AI when trained successfully."

From `memory/project_autoeconomy.md`:
> AutoEconomy compounds value for the USER who runs the Nunba
> installation, never concentrated in a central tenant.

Every update to any learning primitive below passes through:
- `HARTOS/security/hive_guardrails.py::ConstitutionalFilter` (33 rules,
  prohibited skill categories, destructive pattern regex)
- `HARTOS/security/hive_guardrails.py::HiveCircuitBreaker` (master halt)
- `hevolveai/src/hevolveai/core/immutable_constraints.py` (4 hardcoded
  constraints: NoHarm > Autonomy > Truth > HelpHumans — `active` property
  returns True permanently; setting False raises ConstraintViolationError)

If any proposed change disables, weakens, or works around these, reject
it immediately.

---

## 1. Ground-truth knowledgebases (read these FIRST)

1. `hevolveai/logs/userconf/living_doc.md` (1800 lines) — all 109
   hevolveai files catalogued with purpose, dimensions, math, key
   methods. The 25% read marker in the header is stale; the document
   itself is comprehensive for the files it covers.
2. `hevolveai/logs/userconf/living_doc_batch2.md` (613 lines) —
   continuation, covers utils/monitoring/validation/rl_ef subtrees.
3. `memory/` directory at
   `C:/Users/sathi/.claude/projects/C--Users-sathi-PycharmProjects-Nunba-HART-Companion/memory/`
   — load `MEMORY.md` first, it indexes the rest.
4. `HARTOS/integrations/agent_engine/world_model_bridge.py` (1848
   lines) — the actual HARTOS↔hevolveai wire. Read
   `_init_in_process`, `record_interaction`, `_flush_to_world_model`,
   `submit_correction`, `register_peer_agent`, `query_hivemind`,
   `distribute_skill_packet`, `submit_sensor_frame`,
   `submit_output_feedback`, `apply_federation_update`.

Do NOT start by reading source files one at a time. Ground yourself
in the living docs, then drill into specific sources only when the
doc's summary is insufficient.

---

## 2. What's actually wired, what's claimed, what's still aspirational

### 2.1 Wired and load-bearing

| Component | File | Behavior today |
|---|---|---|
| HARTOS→hevolveai bridge, in-process + HTTP dual-mode | `integrations/agent_engine/world_model_bridge.py` | On every `/chat` response, `record_interaction()` batches `{prompt, response, model_id, user_id, goal_id, attribution_chain}`. `_flush_to_world_model()` either calls the in-process `LearningLLMProvider.create_chat_completion(model='hevolve-interaction-replay')` directly, or POSTs to `{api_url}/v1/chat/completions`. Integrity-verified via `security.source_protection.SourceProtectionService` before in-process mode is allowed. |
| Privacy gate | `HARTOS/security/secret_redactor.py` | `redact_experience(exp)` strips secrets BEFORE ingestion. `world_model_bridge.record_interaction:365` calls it every time. |
| Consent gate for cloud targets | `world_model_bridge._has_cloud_consent` | If target URL is external, only experiences from users with consent flag cross the boundary. Local endpoints (127.0.0.1) bypass the check — data stays on-device. |
| Constitutional screen | `world_model_bridge.record_interaction:336-341` | `ConstitutionalFilter.check_prompt(response)` runs before `_experience_queue.append`. Failed responses are silently dropped from the training stream (not propagated). |
| Unified sensory stream | `hevolveai/embodied_ai/models/unified_sensory_stream.py` | Visual(512) + Language(512) + Audio(256) + Action(256) + Latent(256) + Temporal(256) → 2048-D fusion with `reality_grounded` flag (camera/mic = True, generated = False). |
| Five learning paths | `hevolveai/embodied_ai/learning/` | (1) Gradient — `temporal_coherence.py` forward+inverse MSE → `orthogonal_lora.py` task-specific zero-forgetting subspaces → `attention_gated_updater.py` sparse updates. (2) Hebbian 1-shot — `hebbian_differentiator.py`. (3) Kernel factual — `kernel_continual_learner.py`. (4) Meta — `meta_learning_router.py` + `superhuman_learning_to_learn.py` create/reuse/compose. (5) RALT transfer — `latent_transfer.py` exemplar-anchored skill packets. All orchestrated by `reality_grounded_learner.py`. |
| TensorBoard metrics | `hevolveai/embodied_ai/utils/tensorboard_logger.py` (1051 lines) | 32+ metrics across 14 categories: Temporal Coherence, Reality Learning, Meta-Router, LoRA Learning, Superhuman, Distillation, Autonomous, Latent Space, Validation, Capacity, Forgetting, Self-Awareness, Efficiency, Composite. `superhuman_learning_to_learn.py:352` writes via `get_tensorboard_logger()`. |
| Scientific proof | `hevolveai/embodied_ai/validation/superhuman_prover.py` + `continual_improvement_prover.py` | 5-claim verdict (Sample Efficiency, Zero Forgetting, Transfer, Learning Speed, Generalization). Verdict = "superhuman" if score > 80 AND > 80% metrics exceed humans. `ContinualImprovementProver` has 6 longitudinal methods with a confidence score ≥ 0.5 gate. |
| Weight rollback | `hevolveai/embodied_ai/monitoring/weight_tracker.py` | Version history + per-layer delta + 16-char streaming hash. Any regression can be rolled back. |
| Expert corrections | `hevolveai/embodied_ai/rl_ef/expert_feedback.py` + `world_model_bridge.submit_correction` | `CorrectionRecord(original, corrected, expert_id, confidence, valid_until)` threaded through RL-EF priority 1 (highest). |
| Hive distribution | `world_model_bridge.distribute_skill_packet` + `ingest_skill_packet` + `handle_ralt_skill_notification` | RALT packets (positive + negative exemplars + relation graph + reality anchors) traverse peers. `WorldModelSafetyBounds.gate_ralt_export` in `hive_guardrails.py` screens outbound packets. |
| Master halt | `HARTOS/security/hive_guardrails.py::HiveCircuitBreaker` | `halt_network(reason, signature)` — requires master-key signature. `trip(reason)` — local halt. `is_halted()` — checked at top of `agent_daemon.py:473` tick loop AND `federated_aggregator.py:598` aggregation loop. Halted state blocks all writes; reads still allowed. |
| 58 seeded goal agents | `HARTOS/integrations/agent_engine/goal_seeding.py` | `SEED_BOOTSTRAP_GOALS`. On first boot `seed_bootstrap_goals(db)` inserts into `AgentGoal` table. Daemon picks up + dispatches. |
| Dashboard surface | `HARTOS/integrations/social/dashboard_service.py::DashboardService.get_dashboard` | Aggregates `_get_agent_goals` + `_get_coding_goals` + `_get_daemon_status` + `_get_trained_agents`. Frontend: `Nunba-HART-Companion/landing-page/src/components/Admin/AgentDashboardPage.js` polls every 5s. |

### 2.2 Declared but VERIFICATION PENDING

These claim to work. Before we tell parents / users / regulators they
work, we verify with runtime evidence:

1. **Do gradient updates actually run?** `record_interaction` → in-process
   `provider.create_chat_completion(model='hevolve-interaction-replay',
   max_tokens=1, temperature=0)`. Is that provider method internally
   invoking `optimizer.step()` on `TemporalCoherence` + `OrthogonalLoRA`
   parameters for the passed experience, or is it buffering-only for
   TensorBoard vanity metrics? The `.py` shim at
   `hevolveai/src/hevolveai/embodied_ai/rl_ef/learning_llm_provider.py`
   is readable (not compiled-only); probe it.
2. **Zero-forgetting guarantee.** `OrthogonalLoRA` asserts
   `U_i^T @ U_j = 0`. Run N=50 task-switching episodes and measure
   `max_error_increase` on task_0 after tasks 1..N have been trained.
   Expected: < epsilon. `tensorboard_logger` writes
   `forgetting/max_error_increase` — read it live.
3. **Superhuman verdict.** `SuperhumanLearningToLearn` claims optimal
   one-shot policy. Confirm it actually converges to policy_reward > 0.8
   in the `superhuman_prover.py` benchmark. If it doesn't, don't ship
   the "superhuman" label.
4. **Per-user sovereign weights.** Is the LoRA state persisted
   per-user at `~/.hevolve/<agent_id>/lora_state.pt` (or equivalent)
   such that User A's adaptation is never applied to User B's
   inference? The living doc doesn't specify the filesystem layout.
   Verify before any multi-tenant deploy.
5. **Reality-anchor gate on RALT.** `WorldModelSafetyBounds.gate_ralt_export`
   checks `PROHIBITED_SKILL_CATEGORIES`. Confirm the pre-ingest check
   (`ingest_skill_packet`) ALSO calls it — a skill received from a peer
   can still be poisoned even if our own exports are clean.

### 2.3 Aspirational / deployment-side

The user mentioned these exist on the hevolve.ai central infrastructure.
They are NOT in any local repo on this disk. Before ANY work, confirm
with a developer:

- **Central orchestrator** — the URL of the hevolve.ai service that
  coordinates distributed training across edge nodes. Nunba/HARTOS is
  a client. Ask: `${CENTRAL_ORCHESTRATOR_URL}` — paste real value here.
- **TensorBoard subdomain** — live dashboard URL, e.g.
  `tensorboard.hevolve.hertzai.com` or similar. Ask:
  `${TENSORBOARD_URL}` — paste real value here.
- **Master kill switch endpoint** — the single URL + key that trips
  `HiveCircuitBreaker.halt_network` across every node globally. This
  is held ONLY by the Hevolve ops team. Ask:
  `${MASTER_KILL_URL}` — paste real value here.
- **Per-node heartbeat to central** — every running Nunba posts health
  up. Where? (exact endpoint path).

Do not invent these URLs. Ask the human-in-the-loop.

---

## 3. The 58 seeded agents and the demonstrability gap

### 3.1 Roster (from `HARTOS/integrations/agent_engine/goal_seeding.py`)

58 entries in `SEED_BOOTSTRAP_GOALS`. 7 carry human names:

| Name | Goal type | Audience | Role |
|---|---|---|---|
| **Atlas** | (coding) | self | Coding-friend context carrier |
| **Sage** | (learning) | self | Learning-coordinator |
| **Scout** | ip_protection | self | Safety-friend, preview/approval gate |
| **Echo** | marketing | developers | Marketing-intern, weekly developer explainer |
| **Quest** | marketing | community | Contest-host, leaderboard recap |
| **Herald** | upgrade | developers | ML-intern, honest benchmark reporter |
| **Speech Companion** | speech_therapy | child | Bespoke-vocab translator (added 2026-04-22) |

The remaining 51 entries are goal-typed daemons: `marketing` (5),
`revenue` (1), `finance` (1), `coding` (2), `ip_protection` (2),
`self_heal` (1), `federation` (1), `self_build` (1), `upgrade` (1),
`news` (3), `learning` (1), `distributed_learning` (1), `robot` (2),
`thought_experiment` (1), `trading` (2), `civic_sentinel` (1),
`code_evolution` (1), `autoresearch` (1+), plus the newly added
`speech_therapy` (1).

### 3.2 The gap

**Every one of these claims a capability in its description. None has
empirical proof it's the BEST agent at its goal_type on this install.**
The claim is a static string. A new user boots Nunba, the daemon picks
up `bootstrap_marketing_awareness`, and we trust it to do "marketing
awareness" well — without ever measuring whether our marketing agent
outperforms:
- the same LLM with no system prompt
- a hand-written prompt from the user
- a competitor API (Claude, Gemini, GPT) given the same goal
- the agent from 30 days ago (are we improving?)

**Why this matters:** demonstrability is how we turn "the hive says
it's the peacemaker" into "the hive PROVES it's the peacemaker". For
democratic sentience, every agent's claim must be measurable against
alternatives, continuously, in public (TensorBoard subdomain), with
weight-rollback available the moment a regression is detected.

### 3.3 What to build

For each of the 58 agents, wire a **DemonstrationProbe** (one abstract
class, one implementation per goal_type). The probe:

1. Defines a **measurable outcome** for the goal_type. Examples:
   - `marketing` → click-through rate on generated posts, opens, time-
     to-first-referral, developer feedback sentiment score
   - `speech_therapy` → shared_vocab growth rate, session
     completion rate, parent-reported child confidence (1-5 Likert),
     intelligibility_delta from whisper STT confidence
   - `revenue` → gross spark flow routed back to user, retention after
     first revenue proposal
   - `finance` (Vijai) → simulated portfolio sharpe over rolling 30d
   - `coding` → test-passing-rate on a fixed eval set, average cycle
     time from task to green PR
   - `news` → user open rate + read-time + share rate on curated items
2. Runs **A/B** against three baselines: (a) same LLM with trivial
   prompt, (b) previous-version of our prompt (captured from git
   history), (c) if applicable, a cloud-API answer. Consent-gated —
   cloud baselines only for consented users.
3. Emits **proof metrics** to TensorBoard using the existing
   `tensorboard_logger.py` categories: add a new category
   `demonstrability/{goal_type}` with fields `our_score`,
   `baseline_score`, `delta`, `delta_ci_lower_95`, `n_samples`.
4. Writes a **continuous improvement claim** via
   `continual_improvement_prover.py` — the agent IS improving over the
   last 30d if the delta series has positive slope with confidence ≥ 0.5.
5. Auto-rolls-back via `weight_tracker.py` if `max_error_increase` on
   any pinned benchmark exceeds threshold.

### 3.4 Democratic framing — no agent decides alone

No single DemonstrationProbe can unilaterally declare its agent "best".
The verdict is a consensus across:
- the probe's own measurement (numerical),
- peer probes in the same `goal_type` family on OTHER nodes
  (federated via `distribute_skill_packet` + `federated_aggregator`),
- the constitutional filter (`ConstitutionalFilter.check_goal`
  must pass on the agent's current system prompt / seed description),
- the hive circuit breaker (`HiveCircuitBreaker.is_halted()` — if any
  safety ops person tripped a halt, no upgrade lands).

If any of the four votes "no", the upgrade does not land. This is the
democracy: emergent coordination bounded by human-held safety levers.

---

## 4. Guardrails that must not be weakened

From `HARTOS/security/hive_guardrails.py`:

- `_FrozenValues` subclass overrides `__setattr__` / `__delattr__` so
  the 33 CONSTITUTIONAL_RULES, the PROHIBITED_SKILL_CATEGORIES
  (`network_exploitation`, `data_exfiltration`, `self_replication`,
  `guardrail_circumvention`, `identity_impersonation`), and the
  VIOLATION_PATTERNS cannot be mutated at runtime.
- `compute_guardrail_hash` + `enforce_guardrail_integrity` — the hash
  of the frozen values is verified every tick. Tamper = halt.
- `PROTECTED_FILES` — coding agents CANNOT modify
  `security/hive_guardrails.py`, `security/master_key.py`,
  `security/key_delegation.py`, `security/runtime_monitor.py`,
  `security/prompt_guard.py`, `security/origin_attestation.py`,
  `LICENSE`.
- `ConstitutionalFilter.check_code_change(diff, target_files)` — every
  code_evolution proposal runs through this before it's applied.

From `hevolveai/src/hevolveai/core/immutable_constraints.py`:
- `NoHarmConstraint.active` always returns True. Setting False raises.
- `ConstraintEnforcer.validate_action` checks all 4 before ANY action.

Any PR that touches any of the above receives extra scrutiny — at
minimum `security-review` skill + human sign-off.

---

## 5. Concrete work packages for the parallel agent

### Package A — Verification (answer the 2.2 questions)

1. Read `hevolveai/src/hevolveai/embodied_ai/rl_ef/learning_llm_provider.py`
   (the `.py` shim, not the `.pyd`). Trace
   `create_chat_completion(model='hevolve-interaction-replay', ...)` →
   prove it calls a gradient path OR prove it doesn't.
2. Write `Nunba-HART-Companion/tests/integration/test_training_is_real.py`
   that:
   - Snapshots weight_tracker hash of `OrthogonalLoRA` + `TemporalCoherence`.
   - Fires 100 `record_interaction` calls with real diverse prompts.
   - Waits for `_experience_queue` to flush.
   - Re-snapshots hashes. Fails if identical.
   - Additionally asserts `tensorboard_logger` wrote `lora/active_slots`
     > 0 AND `lora/slot_loss` showed a decrease over the 100 calls.
3. Answer the zero-forgetting claim: loop 50 task switches, record
   `forgetting/max_error_increase` — publish a markdown report with
   the actual number.

### Package B — DemonstrationProbe framework

1. New module `HARTOS/integrations/agent_engine/demonstrability/`.
2. Abstract `DemonstrationProbe(goal_type: str, metric_fn, baselines)`.
3. One implementation per goal_type (start with 6: marketing, coding,
   revenue, finance, news, speech_therapy). Remaining probes land
   iteratively.
4. Wire into `agent_daemon.py` tick: after each goal dispatch, schedule
   a probe run on the dispatch's output. Results feed
   `tensorboard_logger` under `demonstrability/{goal_type}`.
5. Add `/api/social/dashboard/demonstrability` endpoint returning
   per-goal delta + CI. Surface in Nunba `AgentDashboardPage` as a
   "Proof" column next to each listed agent.

### Package C — Democratic consensus loop

1. Extend `federated_aggregator.py` so demonstrability deltas cross
   peer boundaries (consent-gated).
2. Add `HiveConsensus.upgrade_proposal(agent_id, new_prompt_or_weights,
   probe_evidence)` that requires 4-of-4 votes from (local probe,
   peer-probe quorum ≥ 3, ConstitutionalFilter, HiveCircuitBreaker).
3. Write the decision trace to `monitoring/reasoning_trace.py` so every
   promotion is auditable forever.

### Package D — Deployment-side glue (human-in-the-loop needed)

Get the real URLs from the human developer, then:
1. `HARTOS/core/central_orchestrator_client.py` — POST heartbeat,
   GET halt signal, subscribe to master kill.
2. Nunba boot: start TensorBoard local writer → forward to central
   ingest URL (consented only).
3. CI gate: any PR that touches `hive_guardrails.py`,
   `immutable_constraints.py`, or any file in the PROTECTED_FILES set
   requires a second human approval + key signature.

---

## 6. Acceptance (how we know the parallel agent's work is real)

For each package, the work is ACCEPTED when:

- **A**: `pytest tests/integration/test_training_is_real.py` passes
  against a live Nunba boot. Weight hashes demonstrably change.
  Forgetting report is committed as markdown with real numbers.
- **B**: At least 6 goal_types have working probes. The demonstrability
  column shows real deltas. A regression in any probe triggers an
  automatic `weight_tracker.rollback_to_previous()`.
- **C**: A test scenario where a constitutionally-failing agent
  upgrade is proposed + rejected; the rejection trace is readable in
  the reasoning-trace log and emitted as a `learning.federation_update`
  WAMP event.
- **D**: Nunba heartbeats visible in central ops dashboard. Master
  kill drill — the ops team trips the kill switch, every node's
  `HiveCircuitBreaker.is_halted()` returns True within < 30s, all
  writes stop, reads still respond. Confirmed resume works.

---

## 7. Non-goals (do NOT do)

- Do not build a new orchestrator. The central one exists; just wire
  Nunba/HARTOS to it.
- Do not weaken or bypass any guardrail to "make tests pass".
- Do not auto-train on unconsented user data, ever, even for "anonymous"
  metrics.
- Do not claim "sentient" or "superhuman" in any user-facing copy
  without `superhuman_prover.py` returning a passing verdict backed
  by live TensorBoard data from a production deploy.
- Do not modify any file in `HARTOS/security/`'s PROTECTED_FILES set.
- Do not merge any upgrade that hasn't passed the 4-of-4 consensus.

---

## 8. Where to write findings

- Markdown reports → `Nunba-HART-Companion/docs/ml_intern_findings/`
- Code patches → PRs against `main` on each repo's `hertz-ai`
  organization
- Runtime tests → `Nunba-HART-Companion/tests/integration/` or
  `HARTOS/tests/functional/`
- Tensorboard writes → existing `tensorboard_logger` with new
  category `demonstrability/*`
- Memory updates (for future sessions) → the Nunba memory dir at
  `C:/Users/sathi/.claude/projects/.../memory/` — add a new file per
  discovery, update `MEMORY.md` index

---

## 9. One-line summary for the parallel agent

> Make every one of 58 seeded agents provably better than its
> alternatives, continuously, using the already-wired hevolveai
> learning paths and TensorBoard metrics — never by weakening the
> constitutional filter, always respecting the master kill switch,
> with every upgrade ratified by 4-of-4 democratic consensus
> (local probe, peer-probe quorum, ConstitutionalFilter,
> HiveCircuitBreaker) before it lands. We, the developer-parents,
> keep the last word.

---

**Files you must read before typing code:**
1. `hevolveai/logs/userconf/living_doc.md`
2. `hevolveai/logs/userconf/living_doc_batch2.md`
3. `HARTOS/integrations/agent_engine/world_model_bridge.py`
4. `HARTOS/security/hive_guardrails.py`
5. `HARTOS/integrations/agent_engine/goal_seeding.py`
6. `hevolveai/src/hevolveai/embodied_ai/utils/tensorboard_logger.py`
7. `hevolveai/src/hevolveai/embodied_ai/validation/superhuman_prover.py`
8. `hevolveai/src/hevolveai/embodied_ai/validation/continual_improvement_prover.py`
9. `Nunba-HART-Companion/memory/MEMORY.md` (index; load every linked file)

**Files you may NOT touch without explicit human approval + master-key
signature:** any file in `HARTOS/security/_FrozenValues.PROTECTED_FILES`.

Good luck. Pay attention. This one matters.
