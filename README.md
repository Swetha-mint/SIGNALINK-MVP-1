# SIGNALINK MVP-1

> Sense → Process → Communicate → Assist

The first standalone SIGNALINK MVP: a browser-based assistive communication proof of concept.

## MVP-1 flow

NFC / URL
→ SIGNALINK web app
→ camera permission
→ hand tracking
→ controlled gesture recognition
→ communication output

### Supported gestures

| Gesture | Output |
|---|---|
| Open hand | HELLO |
| Closed fist | STOP |
| Thumb up | YES |

This is intentionally a controlled proof of concept, not a complete sign-language translator.

## Camera policy

Camera access is required for MVP-1.

- Allow camera → the experience starts.
- Deny camera → the app explains why camera access is required and shows **Try Camera Again**.
- No microphone fallback in MVP-1. Microphone interaction belongs to a later MVP.

## Run

This is a static web app.

For local development, serve the folder with a local HTTP server because browser camera access requires a secure context such as HTTPS or localhost.

Example:

```bash
python -m http.server 8000
```

Then open:

```
http://localhost:8000
```

For deployment, GitHub Pages can host the project over HTTPS.

## Technology

- HTML / CSS / JavaScript
- Browser MediaDevices camera API
- MediaPipe Hand Landmarker
- Client-side gesture classification

The MediaPipe dependency is loaded from a CDN and its model is hosted separately. See the dependency's own license for its terms.

## Scope

MVP-1 proves the complete physical-to-digital communication entry path. NFC is the access layer; the communication experience is the actual MVP.

Next stages can increase the gesture vocabulary, improve robustness, add speech/text interaction, and eventually connect to SIGNALINK hardware.

## License

SIGNALINK MVP-1 is released under the GNU Affero General Public License v3 or later (AGPL-3.0-or-later).

Copyright (C) 2026 Swetha Senthilkumar.
