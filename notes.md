# Sporeling: build notes & post material

> Running log for the DEV post (Hacktoberfest 2026, Week 1 "Touch Grass", due **Oct 11**).
> Targets: **Overall** + **Best Use of Gemma** ($200). Judged on: writing (heaviest) → theme relevance → creativity → technical execution.

## One-liner
A pocket plush familiar that gets hungry when you sit at your desk and can only be fed by going outside: photographing real fungi, moss, water and night skies, verified by **Gemma 4 E2B running locally**.

## Why open innovation matters (prompt answer: draft bullets)
- **No server I don't control:** photos, GPS trail, voice notes and memories live in one SQLite file on my laptop. Location history is the most sensitive data a phone produces; it never leaves the device.
- **Offline in the woods:** laptop in the backpack + phone hotspot. Gemma vision, TTS and chat all work with zero signal (only the optional map/weather lookups need the net, and they degrade gracefully).
- **Free to run forever:** a pet that checks in all day would cost a fortune on per-token APIs. Local inference = infinite pokes.
- **Swappable:** llama.cpp + GGUF means I can swap model size/quant on a whim (E2B on laptop GPU now; same prompts would run on a phone later).
- **Open data too:** OpenStreetMap (Overpass + FOSSGIS foot routing), Open-Meteo, iNaturalist, CelesTrak TLEs, astronomy-engine. All keyless.
- Where open beat closed: _TODO, fill with real anecdotes (latency ~4s per photo with thinking disabled; no rate limits during testing; rejected fake/screen photos)._

## Stack
| Layer | Tech |
|---|---|
| Vision + chat + intent routing | Gemma 4 E2B Q4_K_M + mmproj via llama.cpp `llama-server` (RTX 5070 8GB) |
| TTS | Kokoro-82M (ONNX, CPU) |
| Server | Node + Fastify + better-sqlite3 (WAL) |
| Client | Vite + React + Tailwind + Three.js (procedural plush shader) |
| Geo | Open-Meteo geocoding/forecast, OSM Overpass, routing.openstreetmap.de foot profile, Nominatim |
| Sky | astronomy-engine + satellite.js + CelesTrak |
| Planned | **EmbeddingGemma 2** (multimodal embeddings): semantic dedupe + "ask your field journal" |

## Feature log (chronological; good for "how I built it")
1. **PRD → plan → grill-me.** Started from a PRD for "Sporeling, the Biome Familiar".
2. **Avatar v1:** pixel/mochi blob. Feedback: eyes/mouth slid through the skin when it wobbled. Fixed by pinning features to the surface.
3. **Avatar v2:** researched Meta "Jolly" / OpenAI-style dot avatars → procedural **shell-fur plush** shader (UV-space strand cells fixed moiré), bead eyes, blush, nub arms, accessories, smooth expression state machine (idle/thinking/searching/surprised/confident/celebrating).
4. **Species & achievements:** Jolly (free), Sprout (25 plants), Shroom (50 distinct fungi), Star/Pebble (50 night-sky shots). Unlocks are earned outdoors only.
5. **Field camera:** in-app only (no gallery uploads, anti-cheat), lens switching, pinch/hardware zoom, live GPS, nonce-gated (15 min TTL).
6. **Async capture pipeline:** sharp resize ≤768px for Gemma + thumb, EXIF, 64-bit dHash dedupe, serial GPU queue, SSE progress, notification + spoken result when done.
7. **Night sky:** if a capture is sky-at-night, compute the zenith constellation, planets, moon phase and visible satellites/ISS for that lat/lng/time; Gemma narrates it.
8. **Gemma latency win:** `chat_template_kwargs.enable_thinking=false` → ~4s per photo instead of long waits.
9. **Bug: "weather in Tokyo" answered with my location.** Fix: place extraction + Open-Meteo geocoding, with a Gemma JSON intent/slot router as fallback ("is it sunny over in Kyoto?"). Also caught a regex bug ("over in Kyoto" → wrong Kyoto).
10. **Activity profiles:** Always outside / Balanced / Desk-bound / Custom. Decay is integrated over time in 15-min slices: ~paused while asleep, naps during desk work, **faster at lunch and straight after work** so it still pushes you out.
11. **Conversational walk planner:** "plan me a walk" → picks (park/woods/waterside/country/city) + duration chips → Overpass finds themed POIs → loop route on OSM foot routing → drawn into the radar dial. Remembers your favourite walk type. Weather/sunset-aware suggestions.
12. **Conversation memory:** last turns + lifestyle context (local time, outdoor minutes vs goal) passed into Gemma.

## Gemma usage (for Best Use of Gemma section)
- Vision verification (multimodal via mmproj): authentic nature photo? category, species, confidence, tags, stars visible.
- Structured JSON intent/slot router (weather location, walk type, duration).
- Persona chat with memory + lifestyle context.
- Sky narration from computed astronomy JSON (grounded: "only use facts from the report").
- Planned: EmbeddingGemma 2 for semantic dedupe + cross-modal journal search (two Gemma models together).

## Honest disclosure (draft)
- Built during the challenge window (Oct 6–11) as a new project.
- Some backend patterns (Fastify/SQLite/llama-server client/Kokoro wiring) were adapted from my earlier unreleased "AI charm" prototype; the product, UI, game loop, capture pipeline, geo/sky features are new.
- Built with AI coding assistance in Antigravity (models used during the session: Claude Opus and Gemini). I directed the architecture and product decisions, reviewed and tested the code.

## Screenshots / media checklist
Saved in `docs/screenshots/` (Playwright, mobile 390×844 @2x + desktop 1440×900).
- [x] Home (mobile + desktop): `*-home.png`
- [x] Weather in Tokyo widget: `*-weather-tokyo.png` (16°C, 01:15 local, correct!)
- [x] Walk options picker: `*-walk-options.png`
- [x] Walk route radar: `*-walk-route.png` (real OSM foot route, 3.3 km / 41 min woodland loop in Manchester)
- [x] Rhythm settings sheet: `*-settings.png`
- [ ] Species picker with lock rings (close-up)
- [ ] Field camera viewfinder (needs real phone)
- [ ] Capture result card (fungi) + toast
- [ ] Night-sky result
- [ ] Real outdoor test photos + story (bonus points)
- [ ] Short demo video / GIF

### UI follow-ups spotted in screenshots
- Widgets cover the plush on mobile; consider a collapsible bottom sheet.
- Pet shows DORMANT / 0% in screenshots (decayed test DB). Seed a healthier state for the demo.
- POIs often "Unnamed wood": fall back to reverse-geocoded area name.

## Outdoor test log
_TODO: date, place, what worked, what Gemma got wrong, battery, latency._

## Open TODOs
- Push to public GitHub repo + MIT LICENSE
- Lint/format (Biome or oxlint) + dead-code pass (fallow/knip)
- EmbeddingGemma 2 runtime check
- README: setup script, model download, architecture diagram
- DevRelay session (optional)

## Pluggable engines (Oct 7)
- Chat/vision: any OpenAI-compatible /v1 endpoint (llama.cpp default, Ollama, LM Studio, vLLM, cloud). Separate vision endpoint optional.
- System-1 classifier: any Laya-schema /v1/predict (noul/choice/score). Routes intent in ~100ms before spending an LLM call; falls back to the LLM answering the same schema (tested: Gemma 627ms-1.2s, 'weather' @0.95).
- UI shows 'All on-device' vs 'Some data leaves this device'. Keys stored locally, masked in API.
- Post angle: open = swappable. Same app runs on Gemma locally or anything you point it at.
