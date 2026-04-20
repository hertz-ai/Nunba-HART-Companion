# Changelog

## [Unreleased]

### Added
- End-to-end staging: docker-compose flow probes 8 session-added endpoints including MCP auth gate, HF supply-chain, admin diag — catches runtime regressions CI mocks miss.

## [0.1.0] - 2026-04-12

### Changed
- `casual_conv` defaults to `True` — 0.8B draft model handles all plain chat (~300ms response)
- Agentic flows (agent_id, create_agent, execute, plan, autonomous) automatically set `casual_conv=False` for full 4B tool chain
- Legacy `gpt_lang()` HTTP fallback uses same conditional logic

### Documentation
- Rewrote `docs/architecture/llm-routing.md` for draft-first architecture
- Documents 3-tier routing: draft (0.8B) → LangChain (4B) → raw llama.cpp
- Added endpoint resolution, model lifecycle, tier-based auth tables

### Fixed
- Draft 0.8B mmproj 404 in `llama_config.py`: use `preset.mmproj_source_file` for HF download URL
- Main LLM boot false-positive: verify `/v1/models` for model identity before skipping start
- Eager-boot both draft 0.8B + main 4B at warmup in `main.py`
