# Voice Chat — Director's Treatment

A 75-second cinematic short for the dual-path voice-to-text flow shipped in commit `fcd4d426` (F4 NunbaChatPanel mic). Same canonical structure as `encounters.md` Scene 6 — handed to Sora / Veo / Runway / Pika scene-by-scene.

**Length:** 75s (cuts to 30s and 15s by dropping S6+S8). **Aspect:** shot 16:9 master + 9:16 vertical insert. **Tone:** Indie cinematic, observational. Apple "Shot on iPhone" with Wes-Anderson softness. **Color:** warm wood + paper amber, brand emerald (`#00e89d`) appears ONLY on phone/desktop screens — the visual signature of the feature itself. **Cast:** one human lead (any gender, any background, mid-20s to mid-50s — write inclusive). **Music:** solo piano + soft strings, single quiet build, no vocals. **Mission anchor:** the user's voice is heard locally first; the cloud is a fallback the user is told about, not surveilled by.

**PRODUCT_MAP refs:** voice-chat is a hot-path UI feature backed by `landing-page/src/hooks/useSpeechRecognition.js:1-298` (dual-path STT: HARTOS Whisper at `ws://127.0.0.1:8005` → browser SpeechRecognition fallback) and the F4 panel wiring at `landing-page/src/components/Social/shared/NunbaChat/NunbaChatPanel.jsx`. The "Local (private)" vs "Cloud (browser)" badge added in `fcd4d426` (hook extension `+17 lines`) makes the privacy posture *visible*, not implied.

---

## VARIANT A — 75 second hero (full feature arc)

### Scene 1 (0:00–0:08) — Establishing
**Visual:** Wide quiet kitchen at dusk. A laptop on the counter is dim except for the chat panel — a single floating window, dark theme, NunbaChat. Dishes drying in the rack. The lead enters frame holding a mug, sits at the counter, glances at the screen.
**Chyron:** *"It's late. They have something to say."*
**VO:** "Sometimes typing isn't the right speed."
**Music:** Single piano note, sustained.
**AI prompt:** *"Wide cinematic 35mm shot of a quiet kitchen at dusk, single laptop on a wooden counter showing the floating NunbaChat panel — dark navy (#1a1a2e) background, subtle UI. Lead late 20s/30s walks into frame holding a tea mug, sits at the counter. Soft warm interior lighting, dishes drying in soft focus background. Slow 4cm/s dolly-in. Shallow DOF. Mood: contemplative, end-of-day."*

### Scene 2 (0:08–0:16) — The mic appears
**Visual:** Macro on the chat input row. Two icon buttons side by side: send arrow (emerald), mic (white). A tooltip ghosts in: "Speak your message — local Whisper if available, browser fallback otherwise."
**Chyron:** *"NunbaChat | mic"*
**VO:** "Tap to speak."
**Music:** Piano picks up a second note.
**AI prompt:** *"Macro close-up of a chat input row in a dark-theme UI. Two buttons: a Send icon and a Mic icon. A subtle tooltip ghosts in over the mic with the text 'Speak your message — local Whisper if available, browser fallback otherwise.' Modern interface design, dark navy `#1a1a2e` background, emerald accent on the Send button only. Static frame, soft natural light."*
**Real UI ref:** `landing-page/src/components/Social/shared/NunbaChat/NunbaChatPanel.jsx` mic button added in commit `fcd4d426` next to existing Send.

### Scene 3 (0:16–0:25) — The local-first signal
**Visual:** Lead taps the mic. The icon turns red and starts a soft 1.4s pulse. Just below it, a small badge animates in: a green dot + the text "Local (private)". The lead exhales, smiles slightly, starts to speak — we don't hear them, only the music.
**Chyron:** *"Local Whisper. Your voice never leaves your laptop."*
**VO:** "Local first. Edge-first."
**SFX:** Almost-imperceptible click as recording starts.
**AI prompt:** *"Macro of a chat panel mic button transitioning: white → red, soft 1.4s breathing pulse animation begins. A small badge appears below: a tiny green dot + the text 'Local (private)'. The lead's hand pulls away from the keyboard. Slight smile on their face, they begin speaking but the audio is muted — only the music score continues. Reduced-motion-respect: pulse animation could disable; emerald color signals the same state regardless. Modern dark UI."*

### Scene 4 (0:25–0:35) — Transcript appears, user edits
**Visual:** Words begin to appear in the TextField — same emerald accent, slightly delayed from the lead's speech. They speak a long sentence, the transcript fills, then they pause, lean in, and tap one word — change it. The cursor sits. They re-tap. The text now reads exactly what they meant.
**Chyron:** *"Speech to text. Then yours to edit."*
**VO:** "Speech is fast. Editing is yours."
**Music:** A second piano voice joins.
**AI prompt:** *"A chat TextField in a dark UI; transcribed text begins appearing word by word in white on dark navy background. Realistic cursor + selection. Lead's hand reaches in, taps a word, replaces it with a different word. The transcript flows naturally, looks lived-in not robotic. Side note: text appears slightly behind speech (~300ms — like real STT latency). Modern dark UI."*

### Scene 5 (0:35–0:44) — Cloud fallback (separate thread)
**Visual:** Cut to a different take of the same lead, this time on a phone, walking. The same mic button, but the badge below now reads amber: "Cloud (browser)". A subtle line: "Your laptop's offline — using your browser's speech-to-text."
**Chyron:** *"No local engine? Tell the user. Always."*
**VO:** "When local can't, the browser fills in. You see exactly which path you're on."
**Music:** Strings undertow joins quietly.
**AI prompt:** *"Same actor walking outdoors, holding a phone. The chat UI on the phone has the Mic button engaged with an amber badge that reads 'Cloud (browser)'. A subtle inline message: 'Your laptop's offline — using your browser's speech-to-text.' Mood: casual, urban. Late afternoon golden light. Vertical 9:16 friendly framing also captures."*
**Real UI ref:** `useSpeechRecognition.js` `activeMethod` + `usingFallback` exposed in commit `fcd4d426` lines 297-311 — the badge has runtime backing, not a spec-only claim.

### Scene 6 (0:44–0:55) — The send moment
**Visual:** Back at the laptop. Lead reads the edited transcript once. Their finger hovers over Send. They tap it. The message slides up into the conversation. Reply bubble draft appears below ("Hello! How can I help you today?") in white-on-dark.
**Chyron:** *"You speak. You edit. You send."*
**VO:** "Auto-send is off by default. The send button is the consent."
**SFX:** Very soft "send" tone.
**AI prompt:** *"Chat panel on laptop. Transcribed message in TextField, lead's finger hovers over the emerald Send button, then taps. Message slides into a chat bubble. Below, a reply begins to render. Smooth animation. Dark UI, emerald accent only on Send and the reply bubble's typing indicator."*

### Scene 7 (0:55–1:05) — Privacy moment
**Visual:** Cut to a small UI moment: in the chat settings, a toggle row shows "Voice input → Local Whisper preferred". Below it: "Cloud fallback enabled" with a clear secondary line: "The browser provider sees your audio. We don't."
**Chyron:** *"You decide what your voice routes through."*
**VO:** "Edge-first. Your data. Your decision."
**Music:** Single resolution chord.
**AI prompt:** *"Settings UI close-up: dark theme. Toggle row 'Voice input → Local Whisper preferred' (active). Below: 'Cloud fallback enabled' with secondary text 'The browser provider sees your audio. We don't.' Clean typography, modern. Static frame, 3 seconds."*

### Scene 8 (1:05–1:15) — Continuation across devices
**Visual:** Pull back. The phone, laptop, and a wall-mounted display in another room all show the same conversation thread. The thread the lead just spoke into is mirroring everywhere. Every device shows it — no double-render, no "synced" pop-up. Just there.
**Chyron:** *"Your conversations follow you home."*
**VO:** "Phone for the moment. Desktop for the rest of it. Wherever you are."
**AI prompt:** *"Wide shot of a home interior at dusk, three screens visible: a laptop on the kitchen counter, a phone on a side table, a wall-mounted tablet/display in the living room. All three show the same chat thread with the recently-sent voice message. No 'syncing' badges, no spinners — just the same conversation, present everywhere. Soft ambient lighting, peaceful."*

### Scene 9 (1:15–1:20) — End card
**Visual:** Black. Hevolve + Nunba lockup, small, centered.
**Text:**
*"Voice Chat. Speak local. Edit yours. Send when you mean it."*
*"Your phone. Your data. Edge-first."*
**hevolve.ai**
**SFX:** Final chord, then silence.
**AI prompt:** *"Black screen. Centered Hevolve and Nunba logo lockup, small. Clean sans-serif text below: 'Voice Chat. Speak local. Edit yours. Send when you mean it.' Subtle: 'Your phone. Your data. Edge-first.' Bottom: 'hevolve.ai'. Hold 3s. Minimal cinematic finish."*

---

## VARIANT B — 30 second mid-length (single beat: local-first STT)

### B1 (0:00–0:06) — The mic appears
**Visual:** Macro of chat input row, mic button appears next to Send.
**Chyron:** *"NunbaChat | mic"*
**AI prompt:** *"Macro close-up of a dark-theme chat input row, two icon buttons: a Send icon and a Mic icon. Tooltip ghosts over: 'Speak — local Whisper if available, browser fallback otherwise.' Modern dark UI."*

### B2 (0:06–0:14) — Local Whisper engaged
**Visual:** Mic tap → red pulse → green "Local (private)" badge → user speaks → transcript flows into TextField.
**Chyron:** *"Local Whisper. Your voice never leaves your laptop."*
**AI prompt:** *"Macro: mic button white → red, 1.4s pulse begins, small green badge 'Local (private)' fades in below. User speaks (audio muted in score), transcript appears word-by-word in dark-theme TextField. Modern UI."*

### B3 (0:14–0:23) — Edit + Send
**Visual:** User taps a word, replaces it, taps Send.
**Chyron:** *"You speak. You edit. You send."*
**AI prompt:** *"Dark-theme TextField with transcribed message. User's finger taps a word, replaces it with a different word, then taps the emerald Send button. Smooth animation. Voice input → final message → conversation bubble."*

### B4 (0:23–0:30) — End card
**Visual:** Lockup card with "Voice Chat by Hevolve. Speak local. Send when you mean it. hevolve.ai"
**Music:** Single resolution chord.
**AI prompt:** *"Black screen with centered Hevolve + Nunba lockup, line 'Voice Chat by Hevolve. Speak local. Send when you mean it. hevolve.ai'. Hold 3s. Cinematic minimal."*

---

## VARIANT C — 15 second short (vertical 9:16, App Store / TikTok / Reels)

### C1 (0:00–0:05) — Mic on
**Visual:** Vertical macro of mic button transitioning white→red, "Local (private)" badge fades in.
**AI prompt:** *"Vertical 9:16 macro: dark-theme chat panel mic button, white → red, 1.4s pulse, small green badge 'Local (private)' fades in below. Modern UI."*

### C2 (0:05–0:11) — Transcript flows + edit + send
**Visual:** Quick cuts: transcript appears word-by-word → finger taps a word and replaces it → tap Send → message slides up.
**Chyron:** *"Speak local. Edit yours."*
**AI prompt:** *"Vertical 9:16. Rapid cuts of dark-theme chat: transcript appearing word-by-word; finger replaces a word; finger taps Send; message slides into chat thread. ~6 seconds total. Tight, kinetic editing."*

### C3 (0:11–0:15) — Lockup
**Visual:** Black end card.
**Text:** *"Voice Chat by Hevolve. hevolve.ai"*
**AI prompt:** *"Vertical 9:16 black end card with centered Hevolve logo and the line 'Voice Chat by Hevolve. hevolve.ai'. 4 seconds, minimal."*

---

## Editorial notes (for the production team)

- **Generate scenes independently**, then conform-cut. Most video models drift past ~15s in a single prompt.
- **UI scenes (S2, S3, S4, S5, S6, S7 of Variant A)** are best generated as separate UI-screen-recording-style passes and composited over the actor plate. Most video models render UI text as garbled glyphs.
- **The "Local (private)" badge moment in S3 is the money beat.** Generate 5–6 takes — pick the cleanest pulse + badge timing.
- **Reduced-motion respect:** the pulse animation has a `prefers-reduced-motion` fallback in the actual app — the pulse disables, but the red color persists. The video doesn't need to show this; just be aware the discipline lives in the codebase.
- **Music brief for the composer:** A minor → C major resolution. ~70 BPM. Solo piano with string undertow joining at S5 (cloud fallback) and resolving at S7 (privacy moment). Final chord across S8 → S9.
- **Eye-line:** in S1 + S4 + S6, the actor's eyes track the screen, not the camera. Privacy is a personal moment, not a pitch.

## Mission-anchor self-check

- [x] Humans are protagonists; phone/laptop are tools.
- [x] AI never sends — S6 explicitly shows the user reading + tapping Send.
- [x] No surveillance framing — S5 + S7 explicitly tell the user when their audio routes via cloud.
- [x] Edge-first messaging — end card line: "Your phone. Your data. Edge-first."
- [x] Privacy moments shown as features (S3 badge, S5 fallback warning, S7 settings transparency) — not friction.
- [x] Inclusive casting note included.
- [x] Marketing-as-spec linkage: scene chyrons mirror copy from the actual app (`activeMethod` + `usingFallback` badge labels in `useSpeechRecognition.js:297-311` after commit `fcd4d426`).
