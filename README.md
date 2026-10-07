# Sporeling (The Biome Familiar) 🌿🍄💧

> **Hacktoberfest 2026 DEV Challenge — Week 1: "Touch Grass"**  
> *Target Categories:* **Best Use of Gemma** ($200) & **Overall Challenge Winner** ($250)

Sporeling is an open-source, local-first virtual companion and personal memory assistant whose vitality, mood, and cognitive willingness are directly governed by real-world physical biology.

To keep Sporeling alive, well-fed, and cooperative, you must physically disconnect from your desk and explore the outdoors—photographing wild flora, bark, and puddles, and logging physical outdoor walking sessions.

---

## 🌟 Why Open Innovation Matters

1. **Strict Zero-Telemetry Privacy:** Geolocation coordinates, personal memories, voice notes, and habitat photos never leave your local machine.
2. **Zero API Cost & Infinite Inference:** Real-time multimodal vision inspection and expressive speech run locally without commercial rate limits, token fees, or cloud outages.
3. **Air-Gapped Field Utility:** Capable of running headless on a laptop inside a backpack over an ad-hoc local Wi-Fi hotspot in remote woods with zero cellular reception.
4. **Google Gemma 4 Edge Multimodal Power:** Uses Google's open-weight **Gemma 4 E2B** with multimodal projection (`mmproj`) for real-time botanical verification and anti-cheat enforcement.

---

## 🏗️ Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             THE SPORELING LOOP                              │
│                                                                             │
│   [ Desk Work ] ──► Assistant gets tired/hungry ──► Sporeling nags user     │
│          ▲                                                    │             │
│          │                                                    ▼             │
│   Sporeling unlocks                          User heads outdoors to woods/park│
│   enhanced memory tools                                       │             │
│          ▲                                                    ▼             │
│          └─────── Gemma 4 E2B verifies flora ◄── Snaps moss, bark, puddles  │
│                   Kokoro purrs via earbuds                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Subsystem | Technology | Execution Target | Hardware & Performance |
|---|---|---|---|
| **VLM & Function Calling** | **Gemma 4 E2B** (`Q4_K_M`) + `mmproj-F16` | NVIDIA RTX 5070 Mobile (8GB VRAM) via `llama.cpp` | ~3.2 GB VRAM; 55+ tok/sec |
| **Speech Synthesis (TTS)** | **Kokoro-82M** (ONNX Runtime) | AMD Ryzen 9 9955HX (CPU) | ~350 MB RAM; <150ms RTF audio generation |
| **Speech-to-Text (STT)** | **Web Speech API** + Whisper fallback | Edge Browser / Native Speech | Zero-latency instant client transcription |
| **Procedural 3D Avatar** | **Three.js / WebGL Custom Shaders** | Client GPU | 60 FPS; dynamic simplex vertex noise & particles |
| **Core Service / API** | **Fastify + TypeScript** | Node.js v22 Process | High throughput, non-blocking SSE streaming |
| **Local Storage** | **SQLite (WAL Mode)** via `better-sqlite3` | Disk (`~/.sporeling/sporeling.db`) | Single-file portability, zero cloud overhead |

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- Node.js 20+ (Node v22 recommended)
- `llama-server.exe` with `gemma-4-E2B-it-Q4_K_M.gguf` and `mmproj-F16.gguf`

### 2. Launch Local Gemma 4 E2B
Run the included batch launcher to start the multimodal model on port 8080:
```powershell
.\start_llama.bat
```

### 3. Install & Start Sporeling
```powershell
# Install root, server, and client dependencies
npm install
npm --prefix server install
npm --prefix client install

# Start both Fastify backend (:3100) and Vite PWA (:5173) concurrently
npm run dev
```

Open your browser at `http://localhost:5173` (or access from your mobile phone on LAN e.g. `http://192.168.0.xxx:5173`).

---

## 🎮 Core Gameplay & Outdoor Mechanics

### 1. Procedural 3D Organic Sporeling
- **Living 3D Organism:** Rendered dynamically with Three.js using real-time vertex noise deformation.
- **Reactive Mood Shaders:** Shifts colors and glow based on vitality (emerald cyan when thriving, dry amber when thirsty, shiver purple when starved).
- **Interactive Physics:** Drag to rotate in 3D; tap to squish with spring physics.
- **Ambient Spore Particles:** Instanced bioluminescent particles that swirl around the creature.

### 2. Nature Feeding & Botanical Anti-Cheat
- Tap **Feed Nature** to open the viewfinder.
- Photographs are compressed client-side to $\le 1024 \times 1024$ and analyzed by Gemma 4 E2B.
- Authentic outdoor moss, bark, wild fungi, and water grant **+Nutrition** and **+Hydration**.
- **Anti-Cheat:** Pointing the camera at computer monitors, indoor clutter, or printed photos is detected and rejected with a playful spoken complaint.

### 3. Outdoor Walk Mode ("Touch Grass")
- Tap **Walk Mode** before heading outside.
- Real-time GPS distance calculation and speed filtering verify authentic outdoor walking.
- Completing a walk restores Sporeling's **Vitality** and awards Experience Points.

### 4. Assistant Memory & Vitals Gating
- Speak or type:
  - `"Remember meeting at the park"` $\to$ Saves memory to root system.
  - `"Recall park"` $\to$ Searches stored memories.
- **Vitals Gated:** If Sporeling is starved below 40% Hunger, memory recall is locked (*"My thoughts are foggy... I am starving for wild nature. Feed me some forest moss first!"*).

---

## 📝 License
MIT License. Built for Hacktoberfest 2026.
