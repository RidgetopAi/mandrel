# 🎡 Spindles Viewer

Beautiful web-based real-time viewer for AI thinking blocks (spindles).

## Quick Start

```bash
cd ~/aidis/spindles-viewer
./start.sh
```

Then open in browser: **http://localhost:3737**

## Features

- 🎨 Blue sleek techy design (matches OBS overlays)
- 📡 Real-time streaming via Server-Sent Events
- ✨ Glowing borders with pulse animations
- 📊 Live stats (total count, session ID, connection status)
- 🔄 Auto-scrolling (newest first)
- 🎥 OBS-ready (1920×1080)

## Server Details

- **Port:** 3737
- **Main page:** http://localhost:3737
- **SSE stream:** http://localhost:3737/spindles/stream

## Integration

Connect any system that sends spindle JSON:

```json
{
  "spindle": {
    "id": "unique-id",
    "timestamp": "2025-11-08T01:00:00.000Z",
    "sessionId": "session-id",
    "type": "thinking",
    "content": "AI thinking text here...",
    "tokenCount": 123
  }
}
```

## For OBS

1. Add Browser Source
2. URL: http://localhost:3737
3. Width: 1920, Height: 1080
4. Done!
