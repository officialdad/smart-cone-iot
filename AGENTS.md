# Smart Cone — IoT Cone Knockover Detection

ESP32 + MPU6050 detects when traffic cones are knocked over. Buzzer + LED for local alerts, MQTT + Ntfy for cloud notifications.

## Quick Commands

```bash
# Generate secrets from .env (run before first compile)
bash scripts/gen_secrets.sh

# Compile
~/.local/bin/arduino-cli compile --fqbn esp32:esp32:esp32 firmware/smart_cone/

# Flash
~/.local/bin/arduino-cli upload --fqbn esp32:esp32:esp32 --port /dev/ttyUSB0 firmware/smart_cone/

# Monitor serial
stty -F /dev/ttyUSB0 115200 raw -echo && cat /dev/ttyUSB0
```

## Firmware Structure

```
firmware/smart_cone/
├── smart_cone.ino     # Main sketch — state machine, sensor loop
├── config.h           # Pin defs, thresholds, MQTT topics, Ntfy URL
├── connectivity.h     # WiFiManager, MQTT publish, Ntfy POST
└── secrets.h          # Generated from .env — NEVER commit
```

## Issue Tracking

Uses `bd` (beads). See `AGENTS.md` for full workflow.

```bash
bd ready          # Find available work
bd show <id>      # View issue details
bd update <id> --claim  # Claim work
bd close <id>     # Complete work
```

## Credentials

- `.env` contains MQTT and Ntfy credentials — gitignored
- `secrets.h` is generated from `.env` by `scripts/gen_secrets.sh` — gitignored
- Never commit either file

## Hardware

- Board: ESP32 Dev Module (CH340, USB-C)
- FQBN: `esp32:esp32:esp32`
- Port: `/dev/ttyUSB0` at 115200 baud
- Sensor: MPU6050 (GY-521) on I2C (GPIO 21/22)
- Buzzer: Active 5V on GPIO 19
- LED: KY-016 RGB on GPIO 16 (R) / 17 (G)

## Libraries

Adafruit MPU6050, Adafruit Unified Sensor, WiFiManager, PubSubClient, ArduinoJson
