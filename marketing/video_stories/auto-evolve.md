# Auto-Evolve — Director's Treatment

A 75-second cinematic short for the auto-evolve flywheel: democratic selection → constitutional filter → parallel dispatch → federated improvement. The defining Hive-distinctive feature — agents that get better tomorrow than they were today, and the user is in the loop. Hand the per-scene prompts to Sora / Veo / Runway / Pika.

**Length:** 75s (cuts to 30s and 15s by tightening the federation beat). **Aspect:** 16:9 master + 9:16 vertical insert. **Tone:** Cinematic-systems — closer to Apple's "Designed by Apple" / "How AI works" explainers than a UX demo. Wider visual vocabulary (geometric, almost architectural) but never cold. **Color:** warm parchment-amber → cool navy → emerald accent. The brand `#00e89d` lives on agent-decision moments only — that's how the audience reads "this is the Hive choosing." **Cast:** two human leads representing two anonymized Hive participants (write inclusive — different ages, different locations). One narrator voice (calm, measured, no salesy cadence). **Music:** ambient strings + a single percussive pulse on each "vote" beat. One quiet build, resolves on the federation beat. **Mission anchor (project_hive_mission.md):** AI amplifies humans, never concentrates power. The democratic vote IS the safeguard.

**Reference:** `auto-evolve.md` design doc; `auto_evolve.py` runtime; `autoresearch_loop.py` orchestrator (RSI-3 broadcast at commit f37339... in HARTOS); `hive_guardrails.py` constitutional filter; `FederatedAggregator.broadcast_delta` (RSI-3); `project_realtime_self_optimization.md` mission anchor (cadence: realtime not batch; direction: monotonic vs today's baseline; beneficiary: federated to all Hive nodes).

**PRODUCT_MAP refs:** auto-evolve flywheel — runtime self-optimization (no specific J-number; documented across `auto-evolve.md`, `project_realtime_self_optimization.md`, MEMORY.md "Auto Evolve System (IMPLEMENTED)" section). Surface integration: experiments page (`/social/experiments/auto-evolve`).

---

## VARIANT A — 75 second hero (full feature arc)

### Scene 1 (0:00–0:08) — Establishing
**Visual:** Wide aerial-style shot of a cluster of small lit windows at dusk — apartment buildings, a coffee shop, a corner of a library. Each window glows softly. Pull in slowly. Each window represents a Hive participant.
**Chyron:** *"Thousands of small choices. Made by people. Watched by no one."*
**VO:** "Every day, the Hive's agents try new things. Together, the people decide which of those new things stick."
**Music:** Single bowed string note, sustained.
**AI prompt:** *"Aerial cinematic shot at dusk: cluster of city blocks with apartment windows softly lit, a coffee shop with one customer at a counter, a library with one reader. Each lit window is small but distinct. Slow 4cm/s zoom-in toward the center of the cluster. Warm ambient lighting, no people prominently visible — the windows ARE the people. Mood: quietly populated, observational, almost respectful."*

### Scene 2 (0:08–0:18) — A new idea is proposed
**Visual:** Macro on a laptop screen showing the Auto-Evolve panel. A simple card appears: "New hypothesis: 'Drafting on-device improves response latency by 40% for users with 8GB+ VRAM'." Below it: "Submit for vote." Lead 1 (in apartment) reads, hovers cursor, clicks. The card animates upward, joining a queue of similar cards.
**Chyron:** *"Anyone in the Hive can propose."*
**VO:** "An agent — or a human — proposes a hypothesis. A small change. A small experiment."
**Music:** A single percussive pulse.
**AI prompt:** *"Laptop screen close-up showing a clean dark-theme UI titled 'Auto-Evolve'. A card animates onto screen: 'New hypothesis: Drafting on-device improves response latency by 40% for users with 8GB+ VRAM'. Below it, button 'Submit for vote'. Lead's hand reaches in, taps Submit. The card lifts, joins a queue. Modern UI, dark navy background, emerald accent only on the Submit button."*

### Scene 3 (0:18–0:30) — Democratic vote
**Visual:** Cut to a different perspective — the Hive view. Visualization: a wide grid of small avatar-tiles (no faces, just the Studio-Ghibli watercolor placeholders from the encounter design). One tile lights up green (yes), another stays grey (abstain), another lights up amber (concerns flagged). Counter ticks: 487 → 1,204 → 3,892 votes. The hypothesis card hovers above the grid, accumulating green light.
**Chyron:** *"Each Hive node votes. Their AI agent assists, but never overrides."*
**VO:** "Every node votes. The Hive's own agent helps each user weigh the proposal — but the human casts the vote."
**Music:** Pulse continues, layered with strings.
**AI prompt:** *"Wide visualization: a hexagonal grid of small abstract avatar-tiles — soft watercolor pastel circles, no real faces (Studio-Ghibli style placeholders, ENCOUNTER_DESIGN constraint: no photos). Tiles light up in different colors as a vote progresses: emerald = yes, grey = abstain, amber = concern. A counter ticks: 487 → 1,204 → 3,892 votes. The hypothesis card from the previous scene hovers above the grid, accumulating green light. Cool navy background. Geometric, almost architectural feel. Mood: distributed, populated, deliberate."*

### Scene 4 (0:30–0:38) — Constitutional filter
**Visual:** The hypothesis card, now glowing emerald (passed the vote), descends. It enters a translucent gate. Text on the gate: "Constitutional filter — checking guardrails." A series of small icons flick green: "no surveillance," "no data exfiltration," "no auto-send," "no concentration of power." The card emerges on the other side, intact, slightly brighter.
**Chyron:** *"The Hive can't vote away its own guardrails."*
**VO:** "Even with majority approval, the constitutional filter holds. Some lines aren't up for vote."
**Music:** Pulse drops out for a beat, strings hold.
**AI prompt:** *"Cinematic visualization: a glowing emerald hypothesis card descends through a translucent vertical gate labeled 'Constitutional filter — checking guardrails'. As the card passes through, four small text indicators appear and flick from grey → emerald: 'no surveillance', 'no data exfiltration', 'no auto-send', 'no concentration of power'. The card emerges on the other side intact. Geometric architectural feel, navy background, emerald glow on the card. The pause / breath in the rhythm matters — this is the immune system."*

### Scene 5 (0:38–0:50) — Parallel dispatch
**Visual:** The card splits into N copies, each landing in a different Hive node (different windows from the establishing shot). In each window, the local agent runs the experiment. We see a small inline panel in each window — laptop, phone, watch — showing latency dropping, accuracy holding, confidence ticking up.
**Chyron:** *"Every node runs it on their own data, on their own device."*
**VO:** "Each node tries the change locally. No central server runs the experiment for everyone. Your data stays with you."
**Music:** Pulse returns, layered, more bodies.
**AI prompt:** *"Cinematic split-screen visualization: a single emerald card splits into N copies, each one flying to a different lit window (laptop, phone, smartwatch, tablet — varied form factors). Inside each window, a tiny inline panel shows a metric improving in real-time: latency timer dropping from 2.4s → 1.7s → 1.2s; accuracy holding steady; confidence ticking up. Geometric, slightly slow-motion. Privacy-first framing: the experiment runs IN the window, not above it."*

### Scene 6 (0:50–1:00) — Federated aggregation
**Visual:** Each node's result becomes a small lit dot. The dots travel UPWARD into a central visualization — but the dots are just deltas, not raw data. The center node aggregates. A clear line of text: "FederatedAggregator.broadcast_delta — sharing what learned, not what you said." The center node updates a global baseline, then beams it back to every node.
**Chyron:** *"The Hive learns from every node. The Hive never sees what the nodes said."*
**VO:** "Only the lessons are shared. Not the conversations. Not your data. The Hive gets better. You stay private."
**Music:** Quiet build resolving.
**AI prompt:** *"Cinematic federated-learning visualization: small lit dots from each window rise UPWARD toward a central node (visualized as a quiet beacon, not a dominant tower). Each dot is small and travels with a faint trail. Text overlay: 'FederatedAggregator.broadcast_delta — sharing what learned, not what you said.' The center node receives, aggregates, then sends a SINGLE small dot back to every window — the updated baseline. Geometric, mostly cool navy + emerald accents. The visual emphasis: dots flowing up are TINY (deltas only); the new baseline flowing back is the CONSEQUENCE."*

### Scene 7 (1:00–1:10) — The next morning
**Visual:** Morning light. Lead 1 opens their laptop. A small notification at the top: "Last night, your agent got 12% faster at drafting. 3,247 nodes confirmed the improvement. Tap to read the audit trail." They tap. A clean changelog appears — one new line at the top. They smile, close the laptop.
**Chyron:** *"Better than yesterday. Auditable. Always."*
**VO:** "The next morning, the agent is a little better. And you can see exactly why."
**Music:** Resolution chord.
**AI prompt:** *"Morning interior, lead opens laptop. Small notification appears at top of screen: 'Last night, your agent got 12% faster at drafting. 3,247 nodes confirmed the improvement. Tap to read the audit trail.' Lead taps. A clean changelog UI appears — minimal, dark theme, one new line at the top. Lead reads, slight smile, closes the laptop. Soft morning natural light, peaceful interior. The audit trail is the trust mechanic."*

### Scene 8 (1:10–1:18) — Mission close
**Visual:** Pull back to the original aerial shot from S1 — the cluster of windows, all lit. One by one, each window glows slightly brighter than it did at the start. The pulse-rate is a few BPM faster. It's morning now.
**Chyron:** *"Every day. A little better. Together."*
**VO:** "The Hive amplifies. The Hive never decides for you."
**Music:** Strings sustain, percussive pulse rhythmically slows then holds.
**AI prompt:** *"Aerial wide shot identical framing to Scene 1 but at morning — same cluster of buildings, same windows, but ambient golden light instead of dusk amber. Each window glows slightly brighter than at the start. Mood: hopeful, compounding, peaceful. Pull-out to slightly higher altitude over 3 seconds, then hold."*

### Scene 9 (1:18–1:23) — End card
**Visual:** Black. Hevolve + Nunba lockup, small, centered.
**Text:**
*"Auto-Evolve. Better than yesterday. Voted by you. Audited by you. Owned by you."*
*"The Hive amplifies. It never overrides."*
**hevolve.ai**
**SFX:** Final chord, then silence.
**AI prompt:** *"Black screen. Centered Hevolve + Nunba lockup, small. Clean sans-serif text: 'Auto-Evolve. Better than yesterday. Voted by you. Audited by you. Owned by you.' Subtle: 'The Hive amplifies. It never overrides.' Bottom: 'hevolve.ai'. Hold 3s. Minimal cinematic finish."*

---

## VARIANT B — 30 second mid-length (single beat: democratic vote → constitutional filter)

### B1 (0:00–0:06) — A hypothesis enters
**Visual:** Macro of the Auto-Evolve panel: a card enters with a proposed change. Lead taps Submit.
**Chyron:** *"Anyone can propose."*
**AI prompt:** *"Dark-theme UI close-up, Auto-Evolve panel. A card animates in with text 'New hypothesis: ...'. Lead's hand taps Submit, card lifts. Modern minimal."*

### B2 (0:06–0:16) — The Hive votes
**Visual:** Hexagonal grid of avatar tiles, vote counter ticking up: 487 → 3,892. Card glows green as approval grows.
**Chyron:** *"3,892 nodes voted."*
**AI prompt:** *"Wide hexagonal grid visualization, abstract avatar tiles lighting in emerald (yes), grey (abstain), amber (concern). Counter overlay: 487 → 1,204 → 3,892. Hypothesis card hovers above, glowing brighter. Cool navy background, geometric mood."*

### B3 (0:16–0:24) — Constitutional gate holds
**Visual:** The card descends into a translucent gate; four guardrail indicators flick green. The card emerges intact.
**Chyron:** *"The Hive can't vote away its guardrails."*
**AI prompt:** *"Card descends through translucent vertical gate, four indicators flick grey → emerald: 'no surveillance', 'no data exfiltration', 'no auto-send', 'no concentration of power'. Card emerges intact. Architectural geometric mood, navy + emerald."*

### B4 (0:24–0:30) — End card
**Visual:** Lockup with "Auto-Evolve. Voted by you. Audited by you. hevolve.ai"
**Music:** Resolution chord.
**AI prompt:** *"Black end card, Hevolve + Nunba lockup, line 'Auto-Evolve. Voted by you. Audited by you. hevolve.ai'. 5 seconds, cinematic minimal."*

---

## VARIANT C — 15 second short (vertical 9:16, App Store / TikTok / Reels)

### C1 (0:00–0:05) — Vote
**Visual:** Vertical 9:16 macro of avatar grid lighting up; counter 3,892 prominent.
**AI prompt:** *"Vertical 9:16 hexagonal grid of abstract avatar tiles, lighting up in emerald. Vote counter prominent: 3,892. Cool navy background, geometric, ~5 seconds."*

### C2 (0:05–0:11) — Filter + dispatch
**Visual:** Card descending through gate (guardrails flicking green) → splitting into many small cards flying to lit windows.
**Chyron:** *"Voted by you. Run on your device."*
**AI prompt:** *"Vertical 9:16. Card through guardrail-gate (4 indicators flick green), then splits into N cards flying outward to lit windows. ~6 seconds, smooth motion."*

### C3 (0:11–0:15) — Lockup
**Visual:** Black end card.
**Text:** *"Auto-Evolve by Hevolve. hevolve.ai"*
**AI prompt:** *"Vertical 9:16 black end card, Hevolve logo + line 'Auto-Evolve by Hevolve. hevolve.ai'. 4 seconds."*

---

## Editorial notes (for the production team)

- **Generate scenes independently**, then conform-cut. Most video models drift past ~15s in a single prompt.
- **The geometric / architectural visualizations (S3 vote grid, S4 gate, S5 dispatch, S6 federation)** are the demanding shots. Generate 8-10 takes each, pick the cleanest.
- **The avatar tiles in S3 must NOT show real faces** — abstract Studio-Ghibli watercolor circles only, per the encounter design constraint. This is a hard mission anchor.
- **The "constitutional filter" gate in S4 is the trust beat.** Slow it down. Let it breathe. The pause before the card emerges is the immune system being shown.
- **The federation visualization in S6 emphasizes ASYMMETRY** — small dots going up (deltas only), small dot coming back (the consequence). NOT a centralization icon. NOT raw data flowing.
- **Music brief for the composer:** D minor → F major resolution. ~62 BPM. Bowed strings (violin + cello), single percussive pulse on each "vote" beat (S2, S3 ticks). Pulse drops out at S4 (constitutional filter — the breath), returns at S5 (dispatch), full ensemble at S6 (federation). Resolution at S7. Sustain through S8 → S9.
- **Narrator brief:** Calm, measured pace (60-65 wpm). Not salesy. Not corporate. Closer to the cadence of a documentary than an ad. The mission is the message.

## Mission-anchor self-check (project_hive_mission.md + project_realtime_self_optimization.md)

- [x] Humans are protagonists — every "vote" moment is human-cast (S3 line: "the human casts the vote").
- [x] AI amplifies, never overrides — explicit end-card line.
- [x] No surveillance — S4 explicitly shows "no surveillance" as a guardrail. S6 explicitly shows only deltas flowing up, not raw data.
- [x] Privacy-first — S5 shows experiments running IN the window (locally), not above it.
- [x] Edge-first — S5 ("Each node tries the change locally"), S6 ("Not the conversations. Not your data").
- [x] No concentration of power — S4 explicitly shows "no concentration of power" as a guardrail.
- [x] Better than yesterday (project_realtime_self_optimization.md monotonic-vs-baseline anchor) — S7 line: "the agent got 12% faster" + S8 line "Every day. A little better."
- [x] Auditability — S7 shows the changelog UI, end card mentions "Audited by you."
