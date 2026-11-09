<p align="center">
  <img src="docs/assets/logo.png" alt="Smart Cone logo: an orange traffic cone with circuit traces and Wi-Fi signal arcs, above the SMARTCONE wordmark and the tagline IoT Traffic Solutions" width="240">
</p>

# Smart Cone — IoT Cone Knockover Detection

## Problem

Construction work zones have no way to detect when safety cones are knocked over or hit. Breaches go unnoticed, putting workers at risk and leaving zero documentation for incidents. Navigation apps like Waze only learn about closures when a driver manually reports it.

## Solution

An ESP32-powered traffic cone that detects impact/knockover in real-time, sends push notifications, updates a live fleet dashboard, and auto-generates navigation system hazard feeds (Waze CIFS).

## Demo Flow

1. Power on ESP32 → auto-generates Cone ID from MAC address
2. Connect to "Smart-Cone-xxxx" WiFi → enter hotspot credentials
3. Dashboard auto-discovers cone → "New Cone Detected" toast → click "Place Now"
4. Knock cone over → buzzer pulses, LED + matrix flash red
5. Phone buzzes with Ntfy push notification
6. Dashboard map marker goes red, event log updates in real-time
7. Stand cone back up → recovery event, everything returns to green
8. Walk near cone → PIR triggers intrusion alert, matrix flashes blue/white

---

## Architecture

```
ESP32 + MPU6050 + Buzzer + RGB LED + WS2812B Matrix + PIR
    │
    ├──► WiFi (WiFiManager captive portal)
    │
    └──► MQTT over TLS (HiveMQ Cloud)
            │
            ├──► smartcones/{id}/event     → impact, knockover, recovery, intrusion
            ├──► smartcones/{id}/status    → online/offline/reset (LWT)
            ├──► smartcones/{id}/telemetry → RSSI, uptime, heap, tilt, firmware version
            └──► smartcones/{id}/command   → reset, identify, ota
                    │
                    ├──► Ntfy.sh ──► Phone push notification
                    │
                    ├──► Dashboard API ──► Event persistence (KV, 7-day TTL)
                    │
                    └──► Cloudflare Workers Dashboard
                            ├── Fleet Map (Leaflet.js)
                            ├── Stats Bar (cones, online, alerts)
                            ├── Event Log (persisted, with dates)
                            ├── Cone Detail Panel + Health + OTA
                            ├── Auto-discovery (toast notifications)
                            ├── Connection health indicator
                            ├── Setup Instructions overlay
                            ├── Cone Simulator (non-persistent)
                            ├── Public Hazard Map (/hazards.html)
                            ├── Breadboard Wiring (/wiring.html)
                            ├── CIFS Feed Viewer (/cifs-viewer.html)
                            ├── CIFS XML (/api/feed/cifs.xml)
                            └── CIFS JSON (/api/feed/cifs.json)
```

---

## Features

### Firmware (ESP32)

- **Auto-calibration** — captures resting orientation at boot using 3-axis dot product, works in any mounting angle
- **Impact detection** — acceleration spike > 3g triggers alert
- **Disturbed detection** — 5°+ deviation from resting, yellow LED, single beep, amber matrix pulse
- **Knockover detection** — 15°+ deviation from resting (any direction), emergency buzzer pulse (500ms on/off)
- **Recovery detection** — publishes recovery event with knockdown duration
- **Intrusion detection** — HC-SR501 PIR sensor (only in UPRIGHT state), triple beep + blue/white matrix animation
- **WiFiManager** — captive portal for WiFi + Cone ID setup (no hardcoded credentials)
- **Auto-generated Cone ID** — from ESP32 MAC address (e.g. `cone-74ed`), user can override
- **WiFi reset button** — hold 3s anytime or during boot to clear credentials and reopen portal
- **MQTT over TLS** — publishes events, status (with LWT), and telemetry to HiveMQ Cloud
- **Non-blocking network** — FreeRTOS dual-core: sensor/buzzer on core 1, MQTT/HTTP on core 0
- **Direct event persistence** — ESP32 POSTs events to dashboard API (no browser dependency)
- **Ntfy push notifications** — HTTP POST to ntfy.sh on impact/knockover/intrusion
- **Health telemetry** — WiFi RSSI, uptime, free heap, tilt, firmware version every 30s
- **MQTT commands** — reset, identify (flash LED), OTA firmware update
- **HTTP OTA updates** — triggered from dashboard, LED signals progress (cyan/purple/green/red)
- **RGB LED status** — blue = initializing/offline, green = connected, red = alert, yellow = WiFi reset
- **WS2812B LED matrix** — off when idle, red flash on knockover, blue/white chase on intrusion
- **Buzzer patterns** — 500ms pulse on knockover, triple beep on intrusion, 2s on impact

### Dashboard (Cloudflare Workers + Hono)

- **Fleet Map** — Leaflet.js with colored markers (green/red/orange/yellow/blue/gray)
- **Auto-discovery** — toast notification when unknown cone comes online
- **Setup Instructions** — modal overlay with portal link and 2.4GHz warning (opens directly, no manual form)
- **Cone Simulator** — non-persistent grey/dashed square markers, in-memory only, removed on stop
- **Stats Bar** — Total Cones (clickable fleet list), Online, Alerts Today, Last Incident
- **Event Log** — persisted to KV (7-day TTL), date + time columns, mobile card layout
- **Detail Panel** — state, coordinates, health telemetry, firmware version, event history
- **OTA Updates** — "Update Firmware" button in detail panel, sends MQTT OTA command
- **Identify** — flash LED on specific cone from dashboard
- **Remove/Reset** — removes from dashboard + sends MQTT reset to device
- **Reset sync** — hardware WiFi reset publishes status, dashboard auto-removes cone
- **Connection health** — shows "waiting for data", "connected", "no data for Xs"
- **Nav cards** — card-style links to Public Hazard Map and CIFS Feed Viewer
- **Mobile-first** — responsive design with touch-friendly cards, 2x2 stats grid
- **Public Hazard Map** — read-only map at `/hazards.html` for drivers/public
- **Breadboard Wiring** — hardware wiring diagrams at `/wiring.html`
- **CIFS feeds** — Waze-compatible XML + JSON at `/api/feed/cifs.xml` and `.json`
- **Version display** — footer shows dashboard version, `/api/version` endpoint

### CI/CD

- **Dashboard deploy** — GitHub Actions on version tag push (`v*.*.*`)
- **Firmware build** — GitHub Actions compiles on firmware/** changes, creates GitHub Release
- **Version bump** — `pnpm rc` / `pnpm rc:minor` / `pnpm rc:major` with RC support
- **OTA pipeline** — firmware binary uploaded to GitHub Releases, dashboard API updated

---

## Hardware

### Bill of Materials

| # | Component | Est. Price (MYR) | GPIO | Notes |
|---|-----------|-------------------|------|-------|
| 1 | ESP32 dev board (CH340, USB-C) | RM 15 | — | Main controller |
| 2 | MPU6050 module (GY-521) | RM 10 | SDA=21, SCL=22 | Accelerometer/gyro |
| 3 | Active buzzer module (5V) | RM 3 | GPIO 13 | Alert sounds |
| 4 | KY-016 RGB LED | RM 3 | R=16, G=17, B=5 | Status indicator |
| 5 | HC-SR501 PIR sensor | RM 3 | GPIO 27 | Intrusion detection |
| 6 | WS2812B 4x4 LED matrix | RM 10-16 | GPIO 14 | Visual alerts |
| 7 | Green push button module | RM 2 | GPIO 26 | WiFi reset |
| 8 | Breadboard (400 holes, x2) | RM 10 | — | Joined, center rails removed |
| 9 | Jumper wires (M-M + M-F) | RM 8 | — | Various colors |
| 10 | USB-C data cable | RM 3 | — | Flash + power |
| 11 | Traffic cone (30") | RM 25 | — | Enclosure |
| | **Total** | **~RM 80-95** | | |

### Pin Map

| GPIO | Function | Component |
|------|----------|-----------|
| 5 | LED Blue | KY-016 |
| 13 | Buzzer | Active buzzer |
| 14 | NeoPixel Data | WS2812B 4x4 matrix |
| 16 | LED Red | KY-016 |
| 17 | LED Green | KY-016 |
| 21 | SDA (I2C) | MPU6050 |
| 22 | SCL (I2C) | MPU6050 |
| 26 | WiFi Reset Button | Push button module |
| 27 | PIR Motion | HC-SR501 |

### Power

- ESP32 powered via USB-C (laptop for flashing, power bank for field use)
- All components powered from ESP32's VIN (5V) and 3V3 pins
- Two 400-hole breadboards joined (center rails removed), ESP32 straddles both

---

## Project Structure

```
syuk/
├── firmware/
│   └── smart_cone/
│       ├── smart_cone.ino     # State machine, sensor loop, LED matrix, PIR, button
│       ├── config.h           # Pin defs, thresholds, MQTT topics, firmware version
│       ├── connectivity.h     # WiFiManager, MQTT, Ntfy, OTA, FreeRTOS network task
│       └── secrets.h          # Generated from .env — NEVER commit
├── dashboard/
│   ├── src/
│   │   └── index.ts           # Hono API — cones, events, hazards, CIFS, firmware version
│   ├── public/
│   │   ├── index.html         # Main dashboard
│   │   ├── app.js             # MQTT, map, fleet list, detail panel, simulator, auto-discovery
│   │   ├── style.css          # Dark theme + mobile-first responsive
│   │   ├── hazards.html       # Public hazard map (read-only)
│   │   ├── wiring.html        # Breadboard wiring diagrams
│   │   └── cifs-viewer.html   # CIFS feed viewer with Waze integration docs
│   ├── wrangler.toml          # Cloudflare Workers config + KV binding
│   └── package.json           # Hono, wrangler deps, rc scripts
├── scripts/
│   ├── gen_secrets.sh         # Generates secrets.h from .env
│   └── bump-version.mjs       # Version bump with RC support
├── .github/
│   └── workflows/
│       ├── deploy-dashboard.yml   # Deploy on version tag push
│       └── build-firmware.yml     # Compile firmware + GitHub Release
├── CLAUDE.md                  # Project instructions for Claude Code
├── AGENTS.md                  # bd (beads) issue tracking workflow
└── .env                       # MQTT + Ntfy + CF credentials (gitignored)
```

---

## MQTT Topics

| Topic | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `smartcones/{id}/event` | ESP32 → Cloud | `{"cone_id","event","accel_g","tilt_deg","uptime_s","duration_s"}` | Impact, disturbed, knockover, recovery (with duration), intrusion |
| `smartcones/{id}/status` | ESP32 → Cloud | `{"cone_id","status":"online\|offline\|reset"}` | Online, offline (LWT), reset (before WiFi clear) |
| `smartcones/{id}/telemetry` | ESP32 → Cloud | `{"cone_id","rssi","uptime_s","free_heap","tilt_deg","firmware"}` | Health data every 30s |
| `smartcones/{id}/command` | Cloud → ESP32 | `{"action":"reset\|identify\|ota","url":"..."}` | Remote reset, LED identify, OTA update |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | MQTT broker credentials for dashboard |
| GET | `/api/cones` | List all cone locations from KV |
| POST | `/api/cones` | Create/update cone location |
| DELETE | `/api/cones/:id` | Remove a cone |
| GET | `/api/events` | List recent events (newest first, limit 50) |
| POST | `/api/events` | Persist an event (called by ESP32 directly) |
| GET | `/api/hazards` | JSON hazard zones from cone positions |
| GET | `/api/feed/cifs.xml` | Waze-compatible CIFS XML feed |
| GET | `/api/feed/cifs.json` | CIFS data in JSON format |
| GET | `/api/version` | Dashboard version |
| GET | `/api/firmware/version` | Latest firmware version + download URL |
| POST | `/api/firmware/version` | Update firmware version (called by GitHub Actions) |

---

## Detection Logic

| Event | Trigger | KY-016 LED | Matrix | Buzzer |
|-------|---------|------------|--------|--------|
| Impact | Acceleration > 3g | Red | — | 2s continuous |
| Disturbed | 5°+ deviation from resting | Yellow | Amber pulse | Single beep |
| Knockover | 15°+ deviation from resting | Red | Red flash (500ms) | 500ms pulse |
| Recovery | Within 3° of resting | Green | Off | — |
| Intrusion | PIR motion (UPRIGHT only) | — | Blue/white chase (3s) | 3 quick beeps |

---

## Deployment

### Firmware

```bash
# Generate secrets from .env
bash scripts/gen_secrets.sh

# Compile
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/smart_cone/

# Flash via USB (first time only — then use OTA)
arduino-cli upload --fqbn esp32:esp32:esp32 --port /dev/ttyUSB0 firmware/smart_cone/

# Monitor serial
stty -F /dev/ttyUSB0 115200 raw -echo && cat /dev/ttyUSB0
```

### Dashboard

```bash
cd dashboard

# Local dev
echo "MQTT_BROKER_WSS=wss://xxx.hivemq.cloud:8884/mqtt" > .dev.vars
echo "MQTT_USER=xxx" >> .dev.vars
echo "MQTT_PASSWORD=xxx" >> .dev.vars
npx wrangler dev

# Release (opens a version-bump PR, merges it, tags the merge commit, pushes the
# tag — the tag push triggers the GitHub Actions deploy)
# Needs gh logged in, and a local master equal to origin/master.
pnpm rc            # patch: v1.0.1-rc.1
pnpm rc:minor      # minor: v1.1.0-rc.1
pnpm rc:major      # major: v2.0.0-rc.1
pnpm release       # promote the current rc to a clean version, same flow

# Add --dry-run to print the plan and change nothing, e.g.
# node scripts/bump-version.mjs --dry-run
```

### WiFi Setup (per cone)

1. Power on ESP32 → LED blue, creates "Smart-Cone-xxxx" WiFi AP
2. Connect phone to the AP → setup portal opens
3. Enter WiFi credentials (phone hotspot: turn off first, enter creds, turn back on)
4. Set Cone ID (auto-generated, or customize)
5. ESP32 connects → LED green → dashboard auto-discovers

### WiFi Reset

- **Anytime**: Hold green button for 3 seconds → LED yellow → clears credentials → reboots into portal
- **During boot**: Hold button while powering on → instant reset

### OTA Firmware Update

1. Merge firmware changes to master → GitHub Actions compiles + creates release
2. Dashboard detail panel shows "Update Firmware" button
3. Click → sends MQTT OTA command → ESP32 downloads + flashes
4. LED signals: purple = downloading, green blink = success, red blink = failed

---

## Credentials

| File | Contains | Committed? |
|------|----------|------------|
| `.env` | MQTT, Ntfy, CF credentials | No (gitignored) |
| `secrets.h` | Generated from .env | No (gitignored) |
| `.dev.vars` | Dashboard local dev MQTT creds | No (gitignored) |
| GitHub Secrets | CF_ACCOUNT_ID, CF_TOKEN, MQTT_BROKER, MQTT_USER, MQTT_PASSWORD, NTFY_TOPIC | N/A |
| Wrangler Secrets | MQTT_BROKER_WSS, MQTT_USER, MQTT_PASSWORD | N/A (Cloudflare) |

---

## Libraries

### Firmware (Arduino)
- Adafruit MPU6050, Adafruit Unified Sensor
- Adafruit NeoPixel (WS2812B matrix)
- WiFiManager
- PubSubClient (MQTT)
- ArduinoJson
- HTTPUpdate (OTA)
- Preferences, FreeRTOS (ESP32 built-in)

### Dashboard
- Hono (Cloudflare Workers framework)
- Leaflet.js (maps)
- MQTT.js (WebSocket MQTT client)
- Font Awesome 6 (icons)

---

## Issue Tracking

Uses `bd` (beads) for task management. See `AGENTS.md` for workflow.

```bash
bd ready          # Find available work
bd show <id>      # View issue details
bd update <id> --claim  # Claim work
bd close <id>     # Complete work
```

---

## References

- [ESP32 + MPU6050 Wiring Guide — Random Nerd Tutorials](https://randomnerdtutorials.com/esp32-mpu-6050-accelerometer-gyroscope-arduino/)
- [ESP32 Pinout Reference — Random Nerd Tutorials](https://randomnerdtutorials.com/esp32-pinout-reference-gpios/)
- [Waze CIFS Road Closure Specification](https://developers.google.com/waze/data-feed/road-closure-information)
- [HiveMQ Cloud — Free MQTT Broker](https://www.hivemq.com/cloud/)
- [Ntfy.sh — Push Notifications](https://ntfy.sh)
- [Hono — Cloudflare Workers Framework](https://hono.dev)
- [Leaflet.js — Interactive Maps](https://leafletjs.com)

---

&copy; Smart Cone 2026. Licensed under the [MIT License](LICENSE).
