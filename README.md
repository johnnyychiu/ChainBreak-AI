# ChainBreak AI Demo

ChainBreak AI is a single-page demo for defensive, attack-path reasoning. It accepts a system snapshot, sends it to Gemini 3 with a strict defensive prompt, and renders structured JSON results along with what-if analysis.

## Setup

```bash
npm install
npm run dev
```

Create a `.env.local` file with:

```bash
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3
```

Open `http://localhost:3000` to use the demo.

## Features

- Login-free, single-page UI with system snapshot inputs
- What-if buttons to re-run reasoning with delta summaries
- `/api/analyze` route that validates inputs, calls Gemini 3, and sanitizes output
- Raw JSON view plus defensive-only safety notes

## Screenshot

![ChainBreak AI demo screenshot](docs/chainbreak-ai-demo.png)
