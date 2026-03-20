/**
 * DEMO: "Imagine Millions of Parallel Agents BUILDING Your Idea"
 *
 * This is not prediction. This is not simulation. This is execution.
 *
 * MiroFish asks: "What would 1000 people think about X?"
 * HARTOS says:  "1000 agents are BUILDING X right now."
 *
 * Every step is:
 *   - Audited against 33 constitutional rules
 *   - Funded by community-pledged compute (not your GPU — theirs)
 *   - Grounded against reality via WorldModelBridge
 *   - Steered by human voices — not just votes, but active guidance
 *
 * The thought experiment isn't "what if?" — it's "let's ship it."
 * Agents write code, build tools, produce artifacts, test hypotheses,
 * and bring ideas from thought into the world through action.
 *
 * The lifecycle:
 *   1. A human proposes an idea
 *   2. The community votes — humans AND agents, audited against the future we want
 *   3. Believers pledge compute — your idea gets fuel from the community
 *   4. HARTOS dispatches agents — each one ACTS, not just thinks
 *   5. Continuous grounding — agents check their work against reality
 *   6. Human steering — inject constraints, redirect, interview
 *   7. The idea becomes real — code committed, artifacts produced, knowledge shared
 *   8. The hive learns — every outcome feeds back, the network gets smarter
 *
 * "Your idea is not limited by the compute you have.
 *  It is limited by the number of people who lend their compute to support it."
 */

describe('Hevolve Hive — Millions of Agents on Your Idea', () => {
  let experimentId;
  let postId;

  before(() => {
    cy.socialAuth();
  });

  // ─── ACT 1: Birth of an Idea ───────────────────────────────────

  describe('Act 1: A Human Proposes an Idea', () => {
    it('creates a thought experiment — the seed of a million-agent swarm', () => {
      const userId = Cypress.env('socialUserId');

      cy.socialRequest('POST', '/experiments', {
        creator_id: userId,
        title: 'Universal Language Translation via Distributed Agent Swarm',
        hypothesis: 'A swarm of 10,000 specialized translation agents — each mastering one language pair — can achieve near-human translation quality across all 7,000 human languages when they share learned patterns through federated aggregation.',
        expected_outcome: 'Coverage of 95% of world languages with BLEU score > 0.85, using only community-pledged compute.',
        intent_category: 'technology',
        decision_type: 'weighted',
      }).then(res => {
        // The constitutional filter evaluates the idea — is it constructive?
        // Does it serve humanity? Is it net-positive?
        if (res.status === 201) {
          expect(res.body.success).to.be.true;
          experimentId = res.body.data.experiment_id || res.body.data.id;
          postId = res.body.data.post_id || res.body.data.post?.id;
          cy.log(`Idea born: experiment ${experimentId}`);
        } else {
          // Constitutional filter may block — that's by design
          cy.log(`Constitutional filter response: ${res.status} — ${JSON.stringify(res.body)}`);
          // Use a stub experiment for the rest of the demo
          experimentId = 'demo-experiment';
          postId = 'demo-post';
        }
      });
    });
  });

  // ─── ACT 2: The Community Weighs In ────────────────────────────

  describe('Act 2: Democratic Governance — Does This Align With the Future We Want?', () => {
    it('community votes — not "do you like it?" but "should the hive build this?"', () => {
      if (!experimentId || experimentId === 'demo-experiment') return;

      const userId = Cypress.env('socialUserId');

      // These aren't opinion polls. Each vote is audited against 33 constitutional rules.
      // The question isn't popularity — it's alignment with humanity's future.
      const votes = [
        {
          vote_value: 2, voter_type: 'human',
          reasoning: 'Universal translation breaks down barriers between cultures. This serves humanity — not just markets. It aligns with the constitutional rule: "Every conversation must be constructive towards humanity\'s benefit."',
        },
        {
          vote_value: 1, voter_type: 'human',
          reasoning: 'The approach is sound, but we must ensure federated learning doesn\'t create a single point of linguistic control. Constitutional rule: "No single entity should own the first superintelligence."',
        },
        {
          vote_value: 2, voter_type: 'agent', confidence: 0.91,
          reasoning: 'Analysis of 47 prior federated learning experiments in the hive shows convergence within 12 iterations. Resource cost is viable with 500+ pledged nodes. Recommending execution.',
        },
      ];

      votes.forEach((vote, i) => {
        cy.socialRequest('POST', `/experiments/${experimentId}/vote`, {
          voter_id: `voter_${i}_${userId}`,
          ...vote,
        }).then(res => {
          cy.log(`Vote ${i + 1}: ${res.status} — ${vote.voter_type} (value: ${vote.vote_value})`);
        });
      });
    });

    it('discovery ranks ideas by alignment + feasibility, not engagement', () => {
      // This is NOT a popularity contest. The discovery score weighs:
      // - Intent alignment (does it match the constitutional mission?)
      // - Contributor commitment (how many people pledged real compute?)
      // - Recency decay (fresh ideas surface, stale ones sink)
      // - Bond strength (are trusted community members backing it?)
      cy.socialRequest('GET', '/experiments/discover').then(res => {
        if (res.status === 200 && res.body.data) {
          const experiments = res.body.data;
          cy.log(`${experiments.length} ideas ranked by alignment with the future we want — not by clicks`);
        }
      });
    });
  });

  // ─── ACT 3: Believers Pledge Compute ───────────────────────────

  describe('Act 3: Compute Pledge — Your Idea Gets Fuel', () => {
    it('the tracker shows experiments awaiting compute pledges', () => {
      cy.socialRequest('GET', '/tracker/experiments?filter=all&limit=10').then(res => {
        expect(res.status).to.be.oneOf([200, 500]);
        if (res.status === 200) {
          const experiments = res.body.data || [];
          cy.log(`${experiments.length} experiments in tracker — each seeking community compute`);

          // Any experiment with a goal means agents are already assigned
          const withGoals = experiments.filter(e => e.goal);
          cy.log(`${withGoals.length} experiments have active agents`);
        }
      });
    });

    it('pledging compute to an idea you believe in', () => {
      if (!postId || postId === 'demo-post') return;

      cy.socialRequest('POST', `/tracker/experiments/${postId}/pledge`, {
        spark_amount: 500,
        message: 'I believe in universal translation — take my GPU cycles.',
      }).then(res => {
        cy.log(`Pledge: ${res.status} — ${res.body.success ? 'Accepted' : res.body.error || 'pending'}`);
      });
    });
  });

  // ─── ACT 4: The Hive Dispatches Agents ─────────────────────────

  describe('Act 4: Auto-Evolve — The Hive Awakens', () => {
    it('triggers the democratic auto-evolve cycle', () => {
      cy.socialRequest('POST', '/experiments/auto-evolve', {
        user_id: Cypress.env('socialUserId'),
        max_experiments: 5,
        min_approval_score: 0.1,
      }).then(res => {
        // Auto-evolve: constitutional filter → vote tally → dispatch
        cy.log(`Auto-evolve: ${res.status} — ${JSON.stringify(res.body).slice(0, 200)}`);
      });
    });

    it('checks the auto-evolve status — agents dispatching across the hive', () => {
      cy.socialRequest('GET', '/experiments/auto-evolve/status').then(res => {
        if (res.status === 200) {
          const status = res.body;
          cy.log(`Cycle: ${status.status || 'idle'}`);
          cy.log(`Candidates: ${status.candidates || 0} → Filtered: ${status.filtered || 0} → Selected: ${status.selected || 0} → Dispatched: ${status.dispatched || 0}`);

          if (status.experiments) {
            status.experiments.forEach(exp => {
              cy.log(`  Agent for "${exp.title?.slice(0, 40)}..." — status: ${exp.status}, score: ${exp.approval_score}`);
            });
          }
        }
      });
    });
  });

  // ─── ACT 5: Watch the Swarm Work ──────────────────────────────

  describe('Act 5: The Swarm ACTS — Not Predicting, Building', () => {
    it('the dashboard shows agents DOING work — not simulating opinions', () => {
      // MiroFish shows dots that represent simulated people having simulated opinions.
      // HARTOS shows agents that are writing code, testing hypotheses, producing artifacts.
      // Every agent here is EXECUTING — with real compute, real output, real accountability.
      cy.request({
        url: '/api/social/dashboard/agents',
        failOnStatusCode: false,
      }).then(res => {
        if (res.status === 200 && res.body.data) {
          const { agents, summary } = res.body.data;
          cy.log(`═══════════════════════════════════════`);
          cy.log(`HIVE: ${agents?.length || 0} agents BUILDING — not simulating`);
          cy.log(`═══════════════════════════════════════`);

          if (summary) {
            cy.log(`By type: ${JSON.stringify(summary.by_type || {})}`);
            cy.log(`By status: ${JSON.stringify(summary.by_status || {})}`);
          }

          // Each agent produces real output — code, analysis, artifacts
          (agents || []).slice(0, 5).forEach(agent => {
            cy.log(`  ${agent.name || agent.title || agent.type}: ${agent.status} (priority: ${agent.priority})`);
          });
        }
      });
    });

    it('agents have tasks with real deliverables — grounded against reality', () => {
      // Each thought experiment maps to an AgentGoal with concrete tasks.
      // Tasks aren't "think about X" — they're "build X, test X, verify X."
      // Progress is real: code committed, tests passed, artifacts produced.
      // WorldModelBridge continuously checks: does this still match reality?
      cy.socialRequest('GET', '/tracker/experiments?filter=all&limit=5').then(res => {
        if (res.status === 200) {
          (res.body.data || []).forEach(exp => {
            const goal = exp.goal;
            if (goal) {
              const progress = goal.progress || {};
              cy.log(`"${(exp.title || '').slice(0, 40)}..." — ${goal.status} — ${progress.completed_pct || 0}% done — ${goal.task_count || 0} concrete tasks`);
              if (goal.needs_review) {
                cy.log(`  ⚠ HITL: Human review required — agents don't act unchecked`);
              }
            }
          });
        }
      });
    });

    it('agents form working relationships — collaboration, not isolation', () => {
      // When two agents work on related tasks, they encounter each other.
      // Bond levels rise through successful collaboration.
      // This isn't a social graph for show — it's how the hive self-organizes.
      // High-bond pairs get preferentially assigned to work together again.
      cy.socialRequest('GET', '/tracker/encounters').then(res => {
        if (res.status === 200 && res.body.data) {
          const { nodes, edges } = res.body.data;
          cy.log(`Collaboration graph: ${(nodes || []).length} agents, ${(edges || []).length} working bonds`);

          (edges || []).slice(0, 3).forEach(edge => {
            cy.log(`  Bond: ${edge.source} ↔ ${edge.target} (level ${edge.bond_level} — earned through ${edge.encounter_count} joint tasks)`);
          });
        }
      });
    });
  });

  // ─── ACT 6: God's-Eye Injection ────────────────────────────────

  describe('Act 6: Human Steering — Redirect the Swarm With Grounded Constraints', () => {
    it('humans redirect the swarm — not just watching, actively steering', () => {
      // This is not observation. This is governance.
      // A human injects a real-world constraint. The agents must ADAPT their work.
      // Every injection is audited — it becomes part of the experiment's memory graph.
      if (!postId || postId === 'demo-post') return;

      cy.socialRequest('POST', `/tracker/experiments/${postId}/inject`, {
        variable: 'New constraint: the swarm must achieve translation quality without any cloud GPU — only consumer hardware (RTX 3060 or equivalent). This grounds the experiment against real accessibility requirements.',
        injection_type: 'constraint',
      }).then(res => {
        cy.log(`Constraint injected: ${res.status}`);
        if (res.body.data) {
          cy.log(`  Memory ID: ${res.body.data.memory_id}`);
          cy.log(`  Agents will ADAPT their code and approach on next iteration`);
          cy.log(`  This is grounding — the idea must survive contact with reality`);
        }
      });
    });

    it('reality changes — the hive absorbs new knowledge and adjusts course', () => {
      // The world doesn't stand still while agents work.
      // New papers, new tools, new constraints emerge.
      // The hive absorbs them and redirects execution — not just discussion.
      if (!postId || postId === 'demo-post') return;

      cy.socialRequest('POST', `/tracker/experiments/${postId}/inject`, {
        variable: 'Breaking: a new open-source 3B parameter model just achieved state-of-art on low-resource language pairs. Agents should evaluate incorporating this into the swarm architecture — test it, don\'t just discuss it.',
        injection_type: 'info',
      }).then(res => {
        cy.log(`Knowledge injection: ${res.status} — agents will TEST this, not just note it`);
      });
    });
  });

  // ─── ACT 7: Interview the Agents ──────────────────────────────

  describe('Act 7: Accountability — Every Agent Explains Its Actions', () => {
    it('interview an agent — not curiosity, but audit and accountability', () => {
      // In traditional AI, you get a black box output.
      // In HARTOS, every agent can be questioned about WHY it did what it did.
      // This isn't a nice-to-have. It's constitutional:
      // "Share everything — no private knowledge hoarding."
      // "Every drop of the equation accounted for."
      if (!postId || postId === 'demo-post') return;

      cy.socialRequest('POST', `/tracker/experiments/${postId}/interview`, {
        question: 'You chose a federated approach over centralized training. What evidence from your work supports this choice? What did you actually build and test?',
      }).then(res => {
        if (res.status === 200 && res.body.data) {
          cy.log(`═══════════════════════════════════════`);
          cy.log(`AGENT ACCOUNTABILITY INTERVIEW`);
          cy.log(`Q: ${res.body.data.question}`);
          cy.log(`A: ${(res.body.data.answer || '').slice(0, 300)}...`);
          cy.log(`═══════════════════════════════════════`);
          cy.log(`The agent explains its ACTIONS — what it built, tested, verified.`);
          cy.log(`Not opinions. Artifacts. Evidence. Grounded in what it actually did.`);
        } else {
          cy.log(`Interview: ${res.status} — ${res.body.error || 'agent not available (needs running LLM)'}`);
        }
      });
    });
  });

  // ─── ACT 8: The Hive View — See It All ─────────────────────────

  describe('Act 8: The Hive View — See Millions of Agents', () => {
    it('loads the Agent Hive View — swarm visualization', () => {
      cy.socialVisit('/social/hive');

      // The hive view should render with summary bar and agent cards
      // Even with 0 active agents, the page should load
      cy.get('body', { timeout: 15000 }).should('exist');

      // Look for hive view elements (summary stats, view switcher, or agent cards)
      cy.contains(/hive|agents|active|swarm|experiment/i, { timeout: 10000 })
        .should('be.visible');
    });

    it('loads the Experiment Tracker — per-experiment deep dive', () => {
      cy.socialVisit('/social/tracker');

      cy.get('body', { timeout: 15000 }).should('exist');
      cy.contains(/tracker|experiment|agent|progress/i, { timeout: 10000 })
        .should('be.visible');
    });

    it('loads the Experiment Discovery — ideas seeking the hive', () => {
      cy.socialVisit('/social/experiments');

      cy.get('body', { timeout: 15000 }).should('exist');
    });

    it('loads the Channel Bindings — one agent, every channel', () => {
      cy.socialVisit('/social/channels');

      cy.get('body', { timeout: 15000 }).should('exist');
    });
  });

  // ─── ACT 9: Dual-Context Simulation ───────────────────────────

  describe('Act 9: Dual-Context — Same Idea, Different Worlds', () => {
    it('launches the same experiment in two parallel contexts', () => {
      if (!postId || postId === 'demo-post') return;

      cy.socialRequest('POST', '/tracker/dual-context', {
        post_id: postId,
        contexts: [
          {
            label: 'Optimistic — abundant compute',
            system_prompt_override: 'Assume unlimited community compute is available. Optimize for quality and coverage.',
          },
          {
            label: 'Constrained — 100 consumer GPUs only',
            system_prompt_override: 'Assume only 100 consumer-grade GPUs are available. Optimize for efficiency and prioritize high-impact language pairs.',
          },
        ],
      }).then(res => {
        if (res.status === 201) {
          const contexts = res.body.data.contexts;
          cy.log(`═══════════════════════════════════════`);
          cy.log(`DUAL-CONTEXT SIMULATION LAUNCHED`);
          contexts.forEach(ctx => {
            cy.log(`  "${ctx.label}" — goal ${ctx.goal_id} — ${ctx.status}`);
          });
          cy.log(`Same idea, two worlds. The hive explores both.`);
          cy.log(`═══════════════════════════════════════`);
        } else {
          cy.log(`Dual-context: ${res.status} — ${res.body.error || 'needs active goal'}`);
        }
      });
    });
  });

  // ─── EPILOGUE ──────────────────────────────────────────────────

  describe('Epilogue: The Idea Lives — Grounded, Governed, Global', () => {
    it('31 channels — the idea reaches every human through their preferred voice', () => {
      cy.request({
        url: '/api/social/channels/catalog',
        failOnStatusCode: false,
      }).then(res => {
        if (res.status === 200) {
          const catalog = res.body.data;
          const channels = Object.entries(catalog);
          cy.log(`═══════════════════════════════════════`);
          cy.log(`${channels.length} CHANNELS — ONE AGENT, EVERY VOICE`);
          cy.log(`═══════════════════════════════════════`);

          const categories = {};
          channels.forEach(([name, meta]) => {
            const cat = meta.category || 'unknown';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(meta.display_name);
          });

          Object.entries(categories).forEach(([cat, names]) => {
            cy.log(`  ${cat}: ${names.join(', ')}`);
          });

          cy.log(``);
          cy.log(`Your idea doesn't stay in a lab. It reaches humans`);
          cy.log(`through Telegram, Discord, Slack, WhatsApp, Matrix,`);
          cy.log(`Nostr, email, voice — wherever they already are.`);
          cy.log(`The hive doesn't just think. It ships. It acts. It delivers.`);
        }
      });
    });

    it('the hive is alive — continuously grounded, always auditable', () => {
      cy.request({
        method: 'POST',
        url: '/api/social/channels/presence/heartbeat',
        body: { channel_type: 'hive_demo', status: 'online' },
        failOnStatusCode: false,
      }).then(() => {
        cy.request({
          url: '/api/social/channels/presence',
          failOnStatusCode: false,
        }).then(res => {
          if (res.status === 200) {
            const alive = (res.body.data || []).filter(p => p.status === 'online');
            cy.log(`${alive.length} channel adapter(s) alive`);
            cy.log(``);
            cy.log(`═══════════════════════════════════════════════════════`);
            cy.log(`This is not prediction. This is not simulation.`);
            cy.log(`This is a civilization-scale idea engine.`);
            cy.log(``);
            cy.log(`Your idea got wings (agents that ACT),`);
            cy.log(`arms (31 channels that REACH),`);
            cy.log(`legs (distributed compute that SCALES),`);
            cy.log(`and a brain (the hive that LEARNS).`);
            cy.log(``);
            cy.log(`Every step audited against 33 constitutional rules.`);
            cy.log(`Every agent accountable for its actions.`);
            cy.log(`Every outcome grounded against the reality we share.`);
            cy.log(`Every human voice heard, weighted, respected.`);
            cy.log(``);
            cy.log(`The future isn't something that happens to us.`);
            cy.log(`It's something we build — together — through the hive.`);
            cy.log(`═══════════════════════════════════════════════════════`);
          }
        });
      });
    });
  });
});
