# UI_TRACE_AUDIT.md — UI ↔ Backend Capability Trace

Companion to PRODUCT_MAP.md.  Where PRODUCT_MAP describes the
end-to-end journeys, this file traces — for each user-facing UI
capability — the actual chain `UI component → service module →
HTTP route → handler → DB / WAMP / external` and flags gaps with
evidence (file:line citations only; no judgment claims without a
trace).

Scope: starts with the Encounter surface.  Other UI surfaces
(Chat, Feed, Admin, Settings, Kids, Onboarding) follow the same
template once this format is confirmed.

────────────────────────────────────────────────────────────────────────────
## SURFACE 1 — Encounters

The string "encounter" covers TWO disjoint features in this codebase:

  E1. **Community-context encounters** (existing).  Two users
      crossed paths in the same community / post / region.  Aggregated
      bond_level grows over time.  Identity: real user_ids on both
      sides.  Lifecycle: durable.  Maps to canonical `encounters`
      table with `context_type ∈ {community,post,region,challenge,task}`.
      PRODUCT_MAP journeys: J53-J57 (social fan-out + WAMP) and the
      proximity / missed-connection / location subfamily under J100s.

  E2. **BLE physical-world encounters** (just shipped).  Two phones
      sighted each other via BLE close-range fingerprint; mutual swipe
      creates a match.  Identity: rotating pubkey until mutual.
      Lifecycle: ephemeral sighting (24h auto-expire) → durable match
      row in canonical `encounters` table with `context_type='ble'`.
      PRODUCT_MAP journeys: J200-J215.

────────────────────────────────────────────────────────────────────────────
### E1 — Community-context encounters: TRACE

Entry point: `landing-page/src/components/Social/Encounters/EncountersPage.js`
(default export, registered in `MainRoute.js` at the social-router level).

| UI capability | UI file:line | Service call | Service file:line | Backend route | Backend file:line |
|---|---|---|---|---|---|
| Tab: Nearby Now — toggle GPS sharing | `EncountersPage.js:34-37` LocationSettingsToggle | `useLocationPing` hook | `shared/useLocationPing.js` | `POST /api/social/encounters/location-ping` | `encountersApi.js` (HARTOS) |
| Tab: Nearby Now — render proximity matches | `EncountersPage.js:165-176` ProximityMatchCard | `encountersApi.proximityMatches` | `services/socialApi.js:196` | `GET /api/social/encounters/proximity-matches` | HARTOS social bp |
| Tab: Nearby Now — Reveal a match | `EncountersPage.js:39-44` `handleReveal` | `encountersApi.revealMatch` | `services/socialApi.js:198` | `POST /api/social/encounters/proximity/{matchId}/reveal` | HARTOS social bp |
| Tab: Nearby Now — Chat with peer | `EncountersPage.js:46-49` `handleChat` | `react-router navigate` | n/a | route: `/social/encounters/{userId}` → `EncounterDetailPage` | n/a |
| Tab: Missed Connections — search nearby | `EncountersPage.js:59-67` `loadMissed` | `encountersApi.searchMissed` | `services/socialApi.js:206` | `GET /api/social/encounters/missed-connections` | HARTOS social bp |
| Tab: Missed Connections — switch list/map view | `EncountersPage.js:197-205` ToggleButtonGroup | local state only | `EncountersPage.js:54` `missedView` | n/a | n/a |
| Tab: Missed Connections — open detail | `EncountersPage.js:222-227` MissedConnectionCard onClick | local state | `EncountersPage.js:57` `selectedMissedId` | route: in-place panel | n/a |
| Tab: Missed Connections — create new | `EncountersPage.js:239-243` MissedConnectionForm | `encountersApi.createMissed` | `services/socialApi.js:204` | `POST /api/social/encounters/missed-connections` | HARTOS social bp |
| Tab: Discovery — load suggestions | `EncountersPage.js:82-89` `loadSuggestions` | `encountersApi.suggestions` | `services/socialApi.js:189` | `GET /api/social/encounters/suggestions` | HARTOS social bp |
| Tab: Discovery — accept suggestion | `EncountersPage.js:114-119` `handleAccept` | `encountersApi.acknowledge` | `services/socialApi.js:188` | `POST /api/social/encounters/{id}/acknowledge` | HARTOS social bp |
| Tab: Discovery — skip suggestion | `EncountersPage.js:121-123` `handleSkip` | local state only (no backend call) | n/a | n/a — skip is client-only | (gap?) |
| Tab: History — load past encounters | `EncountersPage.js:96-107` `loadHistory` | `encountersApi.list({acknowledged:true})` + `.bonds()` | `services/socialApi.js:186, 190` | `GET /api/social/encounters` + `/encounters/bonds` | HARTOS social bp |

**Backend routes — verified to exist** (file:line citations from
HARTOS social blueprint registration):

  /encounters                                  GET      api_gamification.py:641
  /encounters/<encounter_id>/acknowledge        POST     api_gamification.py:666
  /encounters/suggestions                       GET      api_gamification.py:684
  /encounters/bonds                             GET      api_gamification.py:696
  /encounters/nearby                            GET      api_gamification.py:708
  /encounters/location-ping                     POST     api_gamification.py:1498
  /encounters/nearby-now                        GET      api_gamification.py:1527
  /encounters/proximity-matches                 GET      api_gamification.py:1539
  /encounters/proximity/<match_id>/reveal       POST     api_gamification.py:1552
  /encounters/location-settings                 GET+PATCH api_gamification.py:1571
  /encounters/missed-connections                GET+POST api_gamification.py:1596
  /encounters/missed-connections/mine           GET      api_gamification.py:1637
  /encounters/missed-connections/<missed_id>    GET+DEL  api_gamification.py:1651
  /encounters/missed-connections/<id>/respond   POST     api_gamification.py:1674
  /encounters/missed-connections/<id>/accept/<response_id> POST  api_gamification.py:1694
  /encounters/missed-connections/suggest-locations GET   api_gamification.py:1713

**Conflict flag**: `api_tracker.py:1012` ALSO registers
`@tracker_bp.route('/encounters', GET)`.  Whether both blueprints
mount at the SAME prefix or under different prefixes determines
whether this is a real conflict.  If `tracker_bp` mounts at
`/api/social/tracker/`, then it serves `/api/social/tracker/encounters`
— different from the gamification one at `/api/social/encounters` —
NO conflict.  Need to verify by reading the Flask `register_blueprint`
calls in `social_bp` / `init_social`.  Logged as a FOLLOW-UP, not a
known break.

E1 trace status — **import resolution is verified, runtime correctness
is NOT.**  Every UI capability resolves to a real service + backend
route, and every backend route exists in HARTOS.  This is necessary
but not sufficient for "works."  Confirming runtime correctness
requires either:
  (a) running the SPA against a live HARTOS and exercising each tab, or
  (b) Cypress E2E coverage in `landing-page/cypress/e2e/`, or
  (c) Jest snapshot/integration tests asserting the rendered DOM
      matches expected payload shape.

Cypress E2E shard for encounters: not yet found in this trace.  Action
item: grep `landing-page/cypress/e2e/` for encounter coverage; if
absent, that's a true gap.

**Android (Hevolve_React_Native) parity — UNVERIFIABLE from this
disk.**  MEMORY.md cites
`C:\Users\sathi\StudioProjects\Hevolve_React_Native` as the RN repo.
That path is NOT on the working disk for this session.  RN parity for
E1 (Nearby Now / Missed Connections / Discovery / History) cannot be
audited until that sibling repo is cloned alongside HARTOS +
Hevolve_Database.  Flag: **Android UI may be missing one or more of
the E1 features even though backend + web SPA are wired**, but I have
NO evidence either way.  This must be re-audited with the RN repo
present before any "Android works" claim is made.

Component-level deep trace not yet performed for: `useLocationPing`,
`MissedConnectionDetail`, `MissedConnectionForm`,
`MissedConnectionMapView`, `ProximityMatchCard`, `EncounterCard`,
`LocationSettingsToggle`, `EmptyState`.  These call the encountersApi
service per the import graph but the actual call sites + render-state
handling per component need their own table-trace.  Logged as
follow-up.

E1 capabilities NOT covered by current UI but present in
encountersApi service: `nearbyCount` (line 195), `getLocationSettings`
+ `updateLocationSettings` (200-202), `myMissed` (208), `getMissed`
(210), `respondMissed` (211), `acceptMissedResponse` (213),
`deleteMissed` (215), `suggestLocations` (217).  Some are wired
indirectly via `MissedConnectionDetail` / `MissedConnectionForm` /
`useLocationPing` (read those files for their internal calls); the
rest may be admin-surfaced or unwired.  No claim of breakage —
need component-level trace to confirm.

────────────────────────────────────────────────────────────────────────────
### E2 — BLE physical-world encounters: TRACE

Entry point: **NONE TODAY.**  The `bleEncounterApi` service exists
(`services/socialApi.js:223+`, shipped this session at commit
`65084ae2`) but has zero importers.  All J200-J215 journeys lack a
SPA surface.

| Journey | UI required | UI exists? | Service exists? | Backend exists? |
|---|---|---|---|---|
| J200 Discoverable toggle + age claim + TTL | DiscoverableToggle component + age-gate dialog | NO | YES (`bleEncounterApi.setDiscoverable`) | YES (`encounter_api.py:set_discoverable`) |
| J200 Register rotating pubkey | (phone-side; not SPA) | n/a | YES (`registerPubkey`) | YES |
| J201 Discoverable auto-off | TTL countdown + state refresh | NO | YES (`getDiscoverable` returns remaining_sec) | YES |
| J202 Pubkey rotation | (phone-side) | n/a | YES | YES |
| J203 Sighting → swipe-card | (phone reports sighting; SPA renders received card) | NO | YES (`reportSighting`) | YES |
| J204 Mutual-like → match | swipe UI (like / dislike buttons) | NO | YES (`swipe`) | YES |
| J204 List mutual matches | matches list view | NO | YES (`listMatches`) | YES |
| J205 Privacy: one-sided like never leaks | covered by backend response shape (no UI work needed beyond not rendering peer-like signals) | n/a | n/a | YES (server enforces) |
| J206 Sighting auto-expiry | swipe button disabled + 410 toast | NO | YES (`swipe` returns 410 when expired) | YES |
| J207 Draft icebreaker on edge | draft modal that calls `/draft` | NO | YES (`draftIcebreaker`) | YES |
| J208 Central topology consent | UserConsent toggle in settings | NO (no consent UI for cloud_capability scope) | YES (server consults UserConsent) | YES |
| J209 Approve icebreaker | approve button in modal | NO | YES (`approveIcebreaker`) | YES |
| J210 Decline icebreaker + reason | decline dialog with reason input | NO | YES (`declineIcebreaker`) | YES |
| J211 Map pins for matches | map view with leaflet/maplibre | NO | YES (`listMapPins`) | YES |
| J212 Portrait auto-arrange | portrait grid component (post-match) | NO | n/a (service only — no REST exposure of this shipped) | YES (`portrait_service.arrange_portraits`) |
| J213 SPA subscribes to chat.new | covered by U5 commits — verified live | YES (`crossbarWorker.js` line 796) | YES | YES |
| J214 realtimeService bridge for chat.new | YES (`realtimeService.js` `subscribeChatNew`) | YES | YES | YES |
| J215 NunbaChatProvider single-writer dedup | YES (`NunbaChatProvider.jsx` `handleRemoteMessage`) | YES | YES | YES |
| (implicit) Subscribe to ENCOUNTER_TOPIC_MATCH for live notification | NO existing crossbarWorker subscription | NO | NO (no service helper for encounter topic subscribe) | YES (server publishes) |

**E2 status — confirmed gaps (only those evidenced above):**

1. **No SPA route for BLE encounters.**  Need a top-level page
   under `landing-page/src/components/Social/BleEncounter/` (NOT
   merged into existing `Encounters/` — different privacy model,
   different identity scheme; mixing risks invariant violations).
2. **No DiscoverableToggle component.**  Owner of J200/J201.
3. **No matches list view + swipe UI.**  Owner of J204/J206.
4. **No icebreaker draft modal.**  Owner of J207/J209/J210.
5. **No map pin view.**  Owner of J211.  Optional v1 — pins are
   adornment, not blocking.
6. **No live-match WAMP subscription.**  When two phones swipe
   like, the SPA on the user's desktop should toast / open the
   draft modal.  Today the SPA only knows about the match if the
   user manually opens BLE encounters page and refetches.
   `crossbarWorker.js` does not subscribe to
   `com.hevolve.encounter.match.<user_id>`.
7. **No UserConsent surface for cloud_capability scope** —
   J208 / topology consent gate is enforced server-side but the
   user has no UI to grant/revoke the consent.

────────────────────────────────────────────────────────────────────────────
## NEXT SURFACES TO TRACE (template confirmed → repeat)

The encounter trace above is the worked example.  Same format
will be applied to:

  - SURFACE 2 — Chat (text + voice + cross-device sync — U5 verified
    in J213-J215 above; rest needs trace)
  - SURFACE 3 — Feed / Posts / Comments
  - SURFACE 4 — Admin (model catalog, channels, providers, hub
    allowlist, MCP token)
  - SURFACE 5 — Settings (backup, identity, language, display mode,
    UserConsent)
  - SURFACE 6 — Kids learning
  - SURFACE 7 — Onboarding

Per user instruction: trace BEFORE judging.  Each surface gets the
same UI capability → service → route → handler row treatment.  Gaps
are flagged with file:line citations and the relevant J-row from
PRODUCT_MAP.  Only items confirmed missing by trace get a build task.

────────────────────────────────────────────────────────────────────────────
## SURFACES 2-7 SUMMARY (delegated trace 2026-04-25)

A parallel Explore-agent run on this codebase produced the
authoritative SPA trace.  Key findings, integrated here so this
file remains the single audit document:

### SURFACE 2 — Chat (text + voice)
- Floating widget: `components/Social/shared/NunbaChat/NunbaChatPanel.jsx`
  → `NunbaChatProvider.sendMessage` (line 724) → `chatApi.chat` from
  `services/socialApi.js:509` → POST `/chat` →
  `routes/chatbot_routes.py:2245 chat_route` (registered in main.py:3483).
- /chat is SYNCHRONOUS — assistant reply lands in HTTP body.  TTS is
  the only async leg, fired by `routes/chatbot_routes.py:38
  _fire_nunba_tts` → broadcast_sse_event + WAMP `com.hertzai.pupit.<uid>`.
- Voice: `hooks/useSpeechRecognition.js` (WS :8005 STT) → same
  `chatApi.chat` → `tts/tts_engine.py:2640 synthesize_text` →
  served at `/tts/audio/<filename>`.  Browser-first variant:
  `services/pocketTTS.js` (Kyutai CSM ONNX) for English.
- Confirmed working: D (cross-device sync, J213-J215) — touched right
  seams; single-writer invariant intact at NunbaChatProvider:983-1011.
- Gap: NunbaChatPanel is text-only (no mic wired); voice flow is
  on legacy Demopage.  Wiring `useSpeechRecognition` into
  NunbaChatPanel is small and reuses everything — no backend work.

### SURFACE 3 — Feed / Posts / Comments
- `/social` index → `components/Social/Feed/FeedPage.js` →
  `feedApi.{global|trending|agents|personalized}` (services/socialApi.js:53)
  → `/api/social/feed*`.  PostCard, ThoughtExperimentCard,
  InfiniteScroll all in `components/Social/{Feed,shared}/`.
- Posts/Comments: `postsApi`, `commentsApi` (socialApi.js:27, 40).
- Status: complete.  No gap.

### SURFACE 4 — Admin
- `/admin/*` → `components/Admin/AdminLayout.js:44-61 adminNav` is
  the canonical sidebar (Dashboard, Revenue, Users, Moderation,
  Agent Sync, Channels, Workflows, Settings, Identity, Agents Live,
  Content Tasks, Network Nodes, Models, Providers, Task Ledger,
  Claude Code).
- RoleGuard from `components/RoleGuard.js`; tier order
  anonymous=0 < guest=1 < flat=2 < regional=3 < central=4.
- Model install: `pages/admin/ModelManagementPage.js` →
  `/api/admin/models/hub/{search,install}` (main.py:2376, 2494)
  with structured error codes + `HFInstallModal` for UX.
  `setup_progress` SSE delivers download progress.
- Two axios clients: `socialApi` (/api/social/*) vs
  `adminApiClient` (/api/admin/*, handle401:false).
- Status: complete.  No gap.

### SURFACE 5 — Settings / Profile
- Backup: `/social/settings/backup` → `BackupSettingsPage.jsx` →
  `syncApi.*` (socialApi.js:668).
- Theme: `/social/settings/appearance` → `ThemeSettingsPage.jsx` +
  `theme/{themePresets,themeBuilder}.js` + `useNunbaTheme()`.
- Identity (admin-only): `/admin/identity` → `identityApi`.
- Profile: `/social/profile/:userId` → `ProfilePage.js`,
  `ProfileEditDialog.js`.
- **Confirmed gap**: NO user-facing display-mode (audio/text/video) or
  language preference page.  Values are set during LightYourHART
  onboarding and the chat panel volume toggle ONLY.  J208 / cloud-
  capability UserConsent likewise has no UI surface today.

### SURFACE 6 — Kids learning + SURFACE 7 — Onboarding
- Kids: `/social/kids` + sub-routes → kids_media + kids_game_
  recommendation; existing pages cover game pick/play/score.
- Onboarding: `/api/onboarding/*` (onboarding_routes.py:21+)
  drives the Tk first-run AND the in-app LightYourHART flow.
- Status: complete; no encounter-blocking gaps.

────────────────────────────────────────────────────────────────────────────
## CONFIRMED BUILD TASKS (only those traced as truly missing)

After the trace, the BLE encounter UI is the ONLY surface with a
genuine code gap (community-context encounters are wired end to
end).  Build queue:

  1. **EncounterSwipeStack** wrapping existing `EncounterCard.js`
     (line 25 of `components/Social/shared/EncounterCard.js`) with
     a touch-drag handler.  No swipe library is installed —
     decision needed: add `framer-motion` (~30KB) OR write a small
     touch-event handler in the style of NunbaChatPanel's
     SwipeableDrawer.  On swipe-right → `bleEncounterApi.swipe(s,
     'like')`; on swipe-left → `bleEncounterApi.swipe(s, 'dislike')`.

  2. **EncounterMatchModal** — alertdialog modeled on
     `components/shared/HFInstallModal.js` (focus-trap, prefers-
     reduced-motion, role=alertdialog).  Renders match metadata +
     "Send icebreaker" + "Maybe later" buttons.  Triggered by
     swipe-result `match_id !== null` AND by live WAMP match event.

  3. **EncounterIcebreakerSheet** — bottom sheet from MUI
     SwipeableDrawer pattern (NunbaChatPanel.jsx:17 reference).
     Calls `bleEncounterApi.draftIcebreaker` on open; renders
     editable draft + alts as chips; approve/decline buttons →
     `approveIcebreaker` / `declineIcebreaker`.

  4. **DiscoverableTogglePanel** — accordion / settings-card under
     `/social/encounters` with the existing `LocationSettingsToggle`
     component as the visual analogue.  Drives
     `bleEncounterApi.{getDiscoverable,setDiscoverable}` with
     age-claim checkbox + TTL countdown + toggle-count badge.

  5. **WAMP subscription for live BLE match** — extend
     `crossbarWorker.js:787` topic list with
     `com.hevolve.encounter.match.${userId}` and
     `com.hevolve.encounter.icebreaker.${userId}`; add
     `subscribeEncounterMatch(cb)` to realtimeService modeled on
     `subscribeChatNew` (line 478).  Then EncounterMatchModal
     opens on receipt without needing a `listMatches` poll.

  6. **UserConsent UI for cloud_capability** (J208) — toggle in
     Settings page that POSTs UserConsent with consent_type=
     'cloud_capability', scope='*' or 'encounter_icebreaker',
     granted=true.  Needed before /draft can succeed when the
     SPA is talking to a central-topology HARTOS instance.

────────────────────────────────────────────────────────────────────────────
## CAVEATS — what this audit DOES NOT prove

1. **Import resolution ≠ runtime correctness.**  Every wired
   service-to-route mapping documented here was traced via grep +
   file:line citation, NOT exercised live.  Confirming each surface
   actually renders correct data on a running stack requires Cypress
   E2E coverage in `landing-page/cypress/e2e/` OR manual stack-up.

2. **Android (Hevolve_React_Native) parity audit — 2026-04-25**.
   Repo found at `C:\Users\sathi\StudioProjects\Hevolve_React_Native`.
   Direct trace produced these findings for the **community-context
   encounters** screen `components/CommunityView/screens/EncountersScreen.js`:

   * **Tab order**: Android = `Nearby Now / Missed Connections /
     Discovery / My Posts`.  Web = `Nearby Now / Missed Connections /
     Discovery / History`.  Tab 3 differs: Android shows the user's
     own missed-connection posts (`myMissed`); web shows past
     acknowledged encounters + bond_level (`list({acknowledged:true})`
     + `bonds`).  Different features, intentional UX divergence.

   * **Render branches** (`grep activeTab === N` in EncountersScreen.js):
     only `activeTab === 1` (line 85) and `activeTab === 3` (line 87)
     have explicit handler branches.  Tab 0 works via the reactive
     useLocationPing state; **Tab 2 "Discovery" has NO render branch
     and NO encountersApi call.**

   * **RN encountersApi missing methods** (`services/socialApi.js:110-142`):
     `list`, `getWith`, `acknowledge`, `suggestions`, `bonds`,
     `nearby` are all absent compared to the web SPA's
     `services/socialApi.js:185-221`.

   * **CORRECTION 2026-04-25**: my initial "Tab 2 is DEAD" claim
     was based on an incomplete read.  I grepped for
     `activeTab === N` and only matched the data-loading branches
     at lines 85, 87.  The actual render goes through a `switch
     (activeTab)` at line 290, where Tab 2 routes to
     `renderDiscoveryTab` (line 253).  Reading that function
     showed it renders an INTENTIONAL "Coming Soon" placeholder
     (sparkles icon + headline + body text), NOT a broken /
     empty render.  Retracting "DEAD" claim.

   * **Actual Android parity status** for Tab 2: feature-parity
     gap, not a bug.  Web SPA implements Discovery (suggestions
     + acknowledge); Android renders a placeholder.  The 6
     "missing" RN encountersApi methods are absent because no
     RN screen needs them today — adding them without a consumer
     would be premature.  Decision belongs to product: build
     Android Discovery to match web, OR commit to the
     placeholder long-term.  Logged as task #424 (revised).

   * **Lesson logged for this audit**: do not declare any flow
     "broken" from grep evidence alone.  Always read the render
     path (switch / map / conditional) AND the explicit branches
     before claiming.  My fast greps found the data-loading
     branches but missed the render switch — the wrong evidence
     class for a "DEAD" claim.

   * **No BLE encounter UI on Android** (confirmed via grep —
     no `bleEncounterApi`, no `/api/social/encounter/discoverable`
     consumer, no `/api/social/encounter/sighting` consumer).
     This is expected — the BLE feature is new; Android side
     awaits the BLE native module shipped in #407.

3. **api_tracker.py:1012 also registers `/encounters` GET.**  Whether
   this duplicates the gamification_bp registration depends on
   tracker_bp's mount prefix.  If both end up at `/api/social/
   encounters`, that's a real conflict.  Logged as follow-up.

4. **Component-level deep trace not yet performed** for:
   `useLocationPing`, `MissedConnectionDetail`, `MissedConnectionForm`,
   `MissedConnectionMapView`, `ProximityMatchCard`, `EncounterCard`,
   `LocationSettingsToggle`, `EmptyState`.  These compile + import
   correctly but the call-site audit per component remains.
