# Voice Coder ⛷

> Speak to edit code. Push to GitHub.

Voice-powered GitHub code editor built for the Gemini 3.1 Hackathon. Edit your codebase with just your voice — no keyboard needed.

## Screenshot

<p align="center">
  <img src="screenshot.png" alt="Voice Coder Screenshot" width="300" />
</p>

## Demo

1. Select a GitHub repository
2. Tap the mic and say: *"Change all font colors to red"*
3. Gemini AI identifies the right files, modifies the code, and pushes to GitHub

## Tech Stack

- **Voice Input**: Web Speech API (browser-native STT)
- **AI**: Google Gemini 3.1 Flash Lite (code understanding + modification)
- **GitHub**: REST API (read files, commit & push)
- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JS (mobile-friendly dark theme)

## Setup

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Add your keys:
# GEMINI_API_KEY=your_key_here
# GITHUB_TOKEN=your_github_pat_here

# Run
node server.js
```

Open `http://localhost:3001` in Chrome.

## How It Works

```
🎤 Voice Command
  → Speech-to-Text (Web Speech API)
  → Gemini: "Which files need to change?"
  → GitHub API: Read those files
  → Gemini: "Apply the changes"
  → GitHub API: Commit & Push
```

## API Keys

- **Gemini API Key**: [Google AI Studio](https://aistudio.google.com/apikey)
- **GitHub PAT**: [GitHub Settings](https://github.com/settings/tokens) → `repo` scope
