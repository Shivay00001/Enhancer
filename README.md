# Enhancer — AI image zoom & enhancement demo

Built by [VisionQuantech](https://visionquantech.com) — AI agents, apps & tools for small businesses.

A Google AI Studio-style demo that lets you zoom into an image, describe the
selected region with Gemini, and generate an AI-upscaled/enhanced version
(`gemini-2.5-flash-image`). Includes a playful "nano banana" 🍌 easter egg and
a zoom-history GIF export.

## How to run

**Prerequisites:** Node.js 18+

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` (or `.env.local`) and set
   `GEMINI_API_KEY=YOUR_GEMINI_API_KEY` to your real Gemini API key
   (get one at https://aistudio.google.com/app/apikey)
3. Run the dev server: `npm run dev` — opens on http://localhost:3000

## API key handling

- The Gemini key is **never hardcoded in source**. It is read only from the
  `GEMINI_API_KEY` environment variable at build time (`vite.config.ts`
  injects it as `process.env.API_KEY`).
- `.env` files are gitignored; `.env.example` contains only the placeholder
  `YOUR_GEMINI_API_KEY`.
- Client-side key note: because this demo calls the Gemini API directly from
  the browser bundle, the key you build with is visible to anyone who opens
  the built site. Use a key with strict API restrictions (HTTP referrer /
  quota limits) and treat it as public. For production use, move the Gemini
  calls to a server-side endpoint.

## Current state (honest)

- `index.html` currently serves a static landing page; the React app
  (`App.tsx`, mounted via `index.tsx`) is present and type-checks
  (`npx tsc --noEmit` is clean) but is not wired into `index.html`. To run
  the full interactive demo, add `<div id="root"></div>` and
  `<script type="module" src="/index.tsx"></script>` to `index.html`
  before the closing `</body>`.
- Without a valid `GEMINI_API_KEY` the AI features throw a clear error
  message; everything else (upload, selection UI) still renders.

## License

Apache-2.0 (see LICENSE).