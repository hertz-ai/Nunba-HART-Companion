#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# staging_e2e_probe.sh -- live HTTP probes against docker-compose.staging.yml
# ---------------------------------------------------------------------------
# Hits every endpoint added in recent session commits and asserts the
# expected status + (where cheap) a required JSON field. Exits non-zero on
# ANY regression so GHA marks the job red. No silent pass-throughs.
#
# Invoked by .github/workflows/e2e-staging.yml after `docker compose up -d`
# reports all services healthy. Also safe to run locally against a dev stack.
# ---------------------------------------------------------------------------
set -euo pipefail

BASE="${NUNBA_BASE:-http://localhost:5000}"
TOKEN="${NUNBA_MCP_BEARER:-staging-e2e-token-do-not-use-in-prod}"
FAIL=0

log()  { printf '\033[36m[probe]\033[0m %s\n' "$*"; }
pass() { printf '\033[32m  OK\033[0m    %s\n' "$*"; }
fail() { printf '\033[31m  FAIL\033[0m  %s\n' "$*"; FAIL=$((FAIL+1)); }

# assert_status <label> <expected> <method> <path> [curl-args...]
assert_status() {
    local label="$1"; local want="$2"; local method="$3"; local path="$4"
    shift 4
    local got
    got="$(curl -s -o /tmp/probe.body -w '%{http_code}' -X "$method" "$BASE$path" "$@" || echo '000')"
    if [[ "$got" == "$want" ]]; then
        pass "$label -> $got"
    else
        fail "$label -> got $got want $want (body: $(head -c 200 /tmp/probe.body))"
    fi
}

# assert_json_field <label> <method> <path> <jq-expr> [curl-args...]
assert_json_field() {
    local label="$1"; local method="$2"; local path="$3"; local expr="$4"
    shift 4
    local body
    body="$(curl -sS -X "$method" "$BASE$path" "$@" || echo '{}')"
    if printf '%s' "$body" | jq -e "$expr" >/dev/null 2>&1; then
        pass "$label -> $expr"
    else
        fail "$label -> missing/false $expr (body: $(printf '%s' "$body" | head -c 200))"
    fi
}

log "Target: $BASE"
log "Waiting 5s for app settle..."
sleep 5

# ---- 1. Flask base health ------------------------------------------------
assert_status "GET /health" 200 GET /health

# ---- 2. MCP local endpoint reachable ------------------------------------
assert_status "GET /api/mcp/local/health" 200 GET /api/mcp/local/health

# ---- 3. MCP exec WITHOUT bearer -> must 403 (auth gate enforced) --------
assert_status "POST /api/mcp/local/tools/execute (no auth)" 403 POST \
    /api/mcp/local/tools/execute \
    -H "Content-Type: application/json" \
    -d '{"tool":"system_health","args":{}}'

# ---- 4. MCP exec WITH bearer -> 200 -------------------------------------
assert_status "POST /api/mcp/local/tools/execute (authed)" 200 POST \
    /api/mcp/local/tools/execute \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"tool":"system_health","args":{}}'

# ---- 5. HF supply-chain: homoglyph 'a\u00ed4bharat' (Cyrillic/Latin mix) -> 400
assert_status "POST hub/install homoglyph repo" 400 POST \
    /api/admin/models/hub/install \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"repo_id":"a\u00ed4bharat/indictrans2-en-indic-dist-200M"}'

# ---- 6. HF supply-chain: random org, no confirm flag -> 403 -------------
assert_status "POST hub/install random-org no-confirm" 403 POST \
    /api/admin/models/hub/install \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"repo_id":"randouser/some-random-model"}'

# ---- 7. Admin diag thread-dump -> 200 + threads_dumped field ------------
assert_json_field "POST /api/admin/diag/thread-dump has threads_dumped" POST \
    /api/admin/diag/thread-dump '.threads_dumped > 0' \
    -H "Authorization: Bearer $TOKEN"

# ---- 8. HART backend health -> 200 + gpu_tier ---------------------------
assert_json_field "GET /backend/health has gpu_tier" GET \
    /backend/health '.gpu_tier | type == "string"'

# ---- Summary ------------------------------------------------------------
echo
if [[ "$FAIL" -eq 0 ]]; then
    printf '\033[32m[probe] all 8 probes passed\033[0m\n'
    exit 0
else
    printf '\033[31m[probe] %d probe(s) failed -- see above\033[0m\n' "$FAIL"
    exit 1
fi
