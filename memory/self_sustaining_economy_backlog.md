# Self-Sustaining Economy Backlog

Durable line-item backlog captured from user vision statements on
2026-04-19 during the MoE-hive / install-validation / revenue-tracker
wiring session.  Every item is anchored to existing code so we
minimise "new invention" and maximise "wire what's already there."

**North-star constraint (from user):** "Whatever I'm asking to prove,
make sure they evolve and become better only."  This means every
proof / validation / benchmark must feed back into an evolution loop
— not a one-shot pass/fail gate.  Canonical home for that loop:
`integrations/agent_engine/auto_evolve.py` (Democratic selection →
Constitutional filter → vote tally → type-aware iteration via
`iterate_hypothesis` / `score_hypothesis_result` /
`get_iteration_history`).

**Second north-star (from user):** "Not just VLM, everything I asked
for" — the backlog below covers every item raised, not just the VLM
proof.

**Architecture glue (from user):**
- Agentic Hive at HARTOS layer — interconnectedness between agents
- AI-native Hive at HevolveAI sibling — interconnectedness between
  model tensors (MoE fusion via `hevolveai.embodied_ai.learning.
  hive_mind.fuse_thoughts`)
- HARTOS hive ↔ HevolveAI hive bridge: `integrations/agent_engine/
  world_model_bridge.py` (`query_hivemind`, `register_peer_agent`)

---

## L1 — Prove every modality / tool works composably (evolve-only)

Task: Extend the install-validation harness from this session (commit
`6c83e228` on Nunba, `a93377d` on HARTOS) so it covers EVERY
capability Nunba claims, not just text-generation.

Existing anchors (reuse, don't duplicate):
- `HARTOS/integrations/agent_engine/hive_benchmark_prover.py:1255`
  `HiveBenchmarkProver.challenge()` — the prove-it-works primitive.
  Already fires on install for models where `KNOWN_BASELINES` has a
  baseline.
- `HARTOS/integrations/agent_engine/auto_evolve.py` — the evolve
  loop.  Every `challenge()` result should land here as a
  hypothesis + score.

L1.1 — **VLM proof**: extend the install probe to call
`loader.load()` + run a canned 1-image classification or caption
round-trip before flipping `install_validated=True`.  Anchor:
`models/orchestrator.py:405` (VLMLoader) — its `load()` already
spawns the worker; add a `validate()` method that sends a small JPEG
+ prompt, asserts non-empty response.

L1.2 — **TTS proof**: synthesize a fixed greeting string at the
engine's native sample rate, assert WAV header + duration > 0.5s.
Anchor: `models/orchestrator.py:145` (TTSLoader) + `tts/tts_engine.py`
VRAM-manager ladder.

L1.3 — **STT proof**: run the same WAV back through STT (from L1.2
output), assert Levenshtein distance from source text ≤ threshold.
Round-trips TTS↔STT proving both simultaneously.  Anchor:
`models/orchestrator.py:297` (STTLoader).

L1.4 — **Embedding proof**: compute cosine-similarity of two known-
similar vs known-distant sentence pairs, assert ordering.  Anchor:
`models/orchestrator.py` (embedding loader, add if absent).

L1.5 — **Rerank proof**: rerank a 3-document set with known ground
truth, assert top-1 matches.

L1.6 — **Image-gen / video-gen / music-gen proof**: generate a
single sample, assert file exists + non-zero bytes + plausible
format magic-bytes.

L1.7 — **Tool-use / agent proof** (the composability bar):
end-to-end chain `Web search → Memory write → TTS speak`.  Anchor:
`HARTOS/create_recipe.py` already wires tool chains; extend to
accept a "probe_chain" config that runs at install time of any new
tool.

L1.8 — **Evolution feedback**: after every L1.x probe, emit a
`score_hypothesis_result(hypothesis_id=<model_id>, score=<0..1>,
metadata=<probe_result>)` call so next install of a same-family
model can use the history to choose the prove-bench.  Canonical
home: `integrations/agent_engine/auto_evolve.py`.

**Privacy/provenance/boundary**: every probe runs in the installing
user's own session; no data leaves the local process.  Probe input
seeds are fixed canonical strings (no user PII).  Probe results
stamped with `source_type='install_validation'`, `source_id=model_id`
in `ResonanceTransaction` if we choose to credit the installer.

---

## L2 — Liquid UI floats every existing component over Demopage

Task: Every existing top-level page (feed, admin, kids, social, etc.)
becomes a "floatable" surface the chat agent can summon over the
Demopage conversation without navigation.

Existing anchors:
- `landing-page/src/pages/Demopage.js` — the canonical chat surface.
- Hevolve_React_Native already has `LiquidOverlay` +
  `SocialLiquidUI` (per MEMORY.md "Hevolve React Native Liquid UI
  Overhaul (COMPLETED)") — port the pattern to the web SPA.
- `landing-page/src/components/` — inventory every top-level page
  component.

L2.1 — **Float registry**: one module `landing-page/src/liquid/
LiquidFloatRegistry.js` that maps `agent_intent → component` (e.g.
`intent='show_cart' → <CartPanel/>`).  Generic over component
(ecom / ticketing / RideSnap / etc.).

L2.2 — **Agent tool**: expose `open_liquid_overlay(intent, payload)`
as a LangChain tool the agent can call.  Anchor:
`HARTOS/integrations/service_tools/` — add `liquid_ui_tool.py`
alongside existing memory_tool / search_tool.

L2.3 — **Bridge**: WAMP topic `com.hertzai.nunba.liquid.{user_id}`
carries the `(intent, payload)` from agent → frontend.  Anchor:
existing WAMP pattern in `crossbar-realtime.md` (never SSE/raw WS).

L2.4 — **A11y + reduce-motion**: overlay respects
`prefers-reduced-motion` and traps focus per WCAG 2.1 AA.

L2.5 — **Composability bar**: two simultaneous overlays must stack
(e.g. "show cart + show ticket selection") without z-index war;
overlay order derives from the agent's emission order.

---

## L3 — Agent-driven UI navigation (agentic commerce)

Task: Agent requests a specific branded UI surface on demand.
Three canonical verticals to seed:

L3.1 — **E-commerce cart**: `intent='show_cart'` → floats a generic
`<CartOverlay items=[{sku, qty, price}]/>`.  Checkout action emits
agent tool `finalize_purchase(cart_id, payment_method)` which
flows into L4 (A2A/AP2 payments).

L3.2 — **Ticket booking**: `intent='show_ticketing'` → floats a
seat-picker / date-picker / passenger-detail overlay.  Confirmation
emits `book_tickets(ticket_id, passenger_info, payment_method)`.

L3.3 — **Ride sharing (RideSnap-style)**: `intent='show_ride'`
→ floats a pickup / drop / car-tier picker.  Confirmation emits
`request_ride(pickup, drop, tier, payment_method)`.

L3.4 — **Provenance**: every overlay emission carries `agent_id`
+ `provenance_trace` so the user can see "this UI is surfaced by
your active agent <X> because you said <Y>".

L3.5 — **Evolution feedback**: user dismissal / acceptance of each
overlay feeds auto_evolve so the agent learns when NOT to surface
an overlay for this user.

---

## L4 — A2A + AP2 integrations for agentic payments

Task: When an L3 overlay confirms a purchase, the agent executes
payment via A2A (Agent-to-Agent) or AP2 (Agent Payment Protocol).

Existing anchors:
- `HARTOS/integrations/providers/` — payment-provider registry
  already exists (provider-gateway doc in MEMORY).
- `integrations/social/resonance_engine.py` — spark flow, already
  has `spend_spark(user_id, amount, source_type, source_id)`.
- Agent-ledger-opensource — task state transitions; extend with
  a `payment_commitment` state.

L4.1 — **A2A adapter**: `HARTOS/integrations/payments/a2a_adapter.py`
implementing the A2A handshake (agent announces capability, peer
agent authorizes, funds reserved).  Funds held in escrow (L5).

L4.2 — **AP2 adapter**: sibling `ap2_adapter.py` for the open
Agent Payment Protocol spec.

L4.3 — **Intent resolution**: when agent calls `finalize_purchase`
etc., route through a `PaymentRouter` that picks A2A vs AP2 based
on the merchant's declared protocol.

L4.4 — **Settlement hook**: after successful payment, emit
`ResonanceService.award_action(db, user_id, 'complete_task',
payment_id)` so the user gets a spark credit for successful
agentic commerce.

L4.5 — **Spark as payment rail**: for small-value in-ecosystem
transactions (kids games, ad skips, feature unlocks), use
`spend_spark` directly — no A2A/AP2 required.

**Privacy/provenance**: every payment transaction stamped with
`agent_id`, `user_consent_timestamp`, `amount`, `currency`,
`merchant_id`; kept in a new `PaymentLedger` table scoped by
`user_id`.  No amounts or merchant info leave the user's node
except for the settlement handshake with the merchant.

---

## L5 — Escrow account for Hevolve AI central instance

Task: Central HevolveAI instance holds an escrow account that
accrues revenue from the self-sustaining economy (ad revenue
platform cut, A2A commissions, compute-lending fees, etc.) and
redistributes to contributors per the existing 90/9/1 split.

Existing anchors:
- `HARTOS/integrations/social/ad_service.py:34` — already uses
  `REVENUE_SPLIT_USERS = 0.90` (90% users, 10% platform).
- `HARTOS/integrations/social/hosting_reward_service.py:135-162` —
  periodic ad revenue distribution already exists.
- `integrations/agent_engine/revenue_aggregator.py` — `REVENUE_SPLIT_USERS`
  source; extend with `REVENUE_SPLIT_PLATFORM_ESCROW`.

L5.1 — **Central escrow wallet**: a singleton `ResonanceWallet`
keyed `user_id='_platform_escrow'` that the 10% platform share
accumulates into.  Extend `_credit_platform_share` (new helper,
sibling of existing `_credit_node_hoster`).

L5.2 — **Redistribution policy**: configurable via
`/api/admin/revenue/escrow/policy`.  Default: quarterly
redistribution to top-N contributors by signal-score, paid in
spark credits + USD equivalent via the A2A/AP2 payment rail.

L5.3 — **Provenance trail**: every escrow deposit + withdrawal
logged in `ResonanceTransaction` with `source_type` indicating
the revenue origin (`'platform_ad_cut'`, `'a2a_commission'`,
`'compute_fee'`, etc.).

L5.4 — **Audit endpoint**: `GET /api/admin/revenue/escrow/audit`
returns the full ledger for operator visibility.  Local-only gate
(same as other admin endpoints) — no remote introspection.

L5.5 — **Safety**: escrow withdrawals require a 2-of-3 operator
signature (re-use crypto primitives from `security/source_protection/`
if present, else build a minimal `multi_sig.py`).

---

## L6 — HARTOS Agentic Hive ↔ HevolveAI AI-native Hive

Task: Wire the two hives so agent-level decisions at HARTOS flow
down to tensor-level fusion at HevolveAI and vice versa.

Existing anchors (already built this session):
- `HARTOS/integrations/agent_engine/world_model_bridge.py:
  register_peer_agent` (commit `691361a`) — peer peer → HiveMind.
- `HARTOS/integrations/agent_engine/speculative_dispatcher.py:
  _schedule_hive_consult` (commit `35d1117`) — agent → MoE fusion.
- `HARTOS/core/peer_link/link_manager.py:upgrade_peer` — upgrades
  a linked peer + registers with HiveMind.
- `HARTOS/integrations/distributed_agent/api.py:/delegations/recent`
  (commit `6903180`) — delegation telemetry.

L6.1 — **Bidirectional capability advertisement**: HevolveAI's
HiveMind declares its `AgentCapability[]` up through
world_model_bridge so HARTOS agents can route to the HiveMind
as a specialized expert (e.g. for `REMEMBER` / `ENCODE`).

L6.2 — **Cross-hive delegation**: when a HARTOS agent delegates
to `delegate='hive'`, the dispatcher consults BOTH local-expert
AND HevolveAI-fused opinion, weighting by provenance-signed
confidence.

L6.3 — **Heartbeat sync**: ledger heartbeat (enabled in commits
`691361a`) carries each hive's load / latency / capability-hit-rate
so the other hive can choose to delegate or not.

L6.4 — **Evolution coupling**: every cross-hive consult result
lands in `auto_evolve.py` as a hypothesis; over time, the hive
that wins more frequently on capability X gets preferred-for-X.
This is the "evolve and become better only" principle applied at
the inter-hive routing layer.

L6.5 — **Privacy boundary**: tensor-level fusion (HevolveAI) runs
in-process only; only the final decision (not the raw embeddings)
crosses the bridge to HARTOS agents.  Protects latent representations
from leaking outside their home hive.

---

## L7 — Self-sustaining business guardrails

Task: Economic flywheel sanity checks so the system doesn't
cannibalize itself.

L7.1 — **Spark deflation guard**: if `ResonanceWallet.spark_lifetime`
total grows faster than `resonance_engine.AWARD_TABLE` anchors
allow, pause awards until economy re-balances.  Anchor:
existing `_check_level_up` pattern.

L7.2 — **Anti-farming**: every L1/L2/L3 emission point already has
rate limits (e.g. ad impressions 3/hour/user at `ad_service.py:251`).
Mirror the pattern for overlay clicks, payment attempts, hive
consults.

L7.3 — **Revenue floor**: L5 escrow maintains a minimum balance
equal to 30 days of redistribution; below that, platform cut
rises temporarily from 10% to 20% until replenished.

L7.4 — **Evolution-only invariant**: auto_evolve filter refuses any
hypothesis update whose score regresses below the previous best
for the same model_id × capability pair.  "Everything evolves and
becomes better only" — enforced mechanically, not by hope.

---

## Priority / sequencing note

This backlog is captured durably so no item is forgotten, NOT
because every item ships next.  Suggested sequencing:

1. **L1.1 (VLM proof)** — smallest extension of this session's
   work; proves the load-probe pattern generalises.
2. **L1.2–L1.6** — parallel to L1.1; each is a ~1-day ticket.
3. **L7.4 (evolve-only invariant)** — enforce before shipping
   any auto-evolve consumer.
4. **L2 (Liquid UI)** — depends on L1 being green.
5. **L3 (agentic overlays)** — depends on L2 float registry.
6. **L4 (A2A/AP2)** — depends on L3 overlays emitting commerce intents.
7. **L5 (escrow)** — depends on L4 settling real transactions.
8. **L6 (cross-hive)** — orthogonal; can land any time after L1.

User-authorized scope for the immediate session (already landed
in commits `72586dca`, `6c83e228`, `ef817a05`, `6cd21c6`,
`a93377d` plus the prior MoE ladder commits): install-validation
harness + manifest export/import + viewer-spark closing + dispatcher
refusal of unvalidated installs.  The 7 L-buckets above are the
follow-on.
