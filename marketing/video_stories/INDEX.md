# Video Stories — Marketing Backlog

Each row is a director's treatment + scene-by-scene shot list + AI-video-model generation prompts (Sora / Veo / Runway / Pika), produced by the `video-story-director` agent. Marketing pulls from this backlog whenever a new video is needed.

| Slug | Feature | PRODUCT_MAP refs | Variants | Last updated |
|------|---------|------------------|----------|--------------|
| [encounters](./encounters.md) | BLE encounter + icebreaker (Hevolve mobile + Nunba desktop continuation) | J200–J215 | 75s hero / 30s mid / 15s short | 2026-04-25 |

## Conventions

- **Slug** = lowercase kebab matching the feature.
- **PRODUCT_MAP refs** = J-numbers from `tests/journey/PRODUCT_MAP.md` so reviewers can trace the story back to the journey.
- **Variants** = which length(s) the file contains. Hero is 75s; mid is 30s; short is 15s vertical.
- **Last updated** = ISO date of last write. If a feature changes materially, add `<slug>_v2.md` (don't overwrite history).
- New entries are APPENDED. Sort visually by feature area if the table grows long.

## How new stories get added

1. **Auto** — master-orchestrator's Wave 3 dispatches `video-story-director` on any user-facing change merge.
2. **Manual** — operator runs `Use video-story-director for <feature>`.
3. **Backlog seeding** — operator runs `Seed video stories for every feature in PRODUCT_MAP` and the agent cycles through producing one story per feature.

See `.claude/agents/video-story-director.md` for the full agent contract.
