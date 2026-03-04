const repoSelect = document.getElementById('repo-select');
const micBtn = document.getElementById('mic-btn');
const micStatus = document.getElementById('mic-status');
const transcriptArea = document.getElementById('transcript-area');
const transcriptEl = document.getElementById('transcript');
const processing = document.getElementById('processing');
const processingText = document.getElementById('processing-text');
const resultsSection = document.getElementById('results');
const resultsContent = document.getElementById('results-content');
const logsArea = document.getElementById('logs-area');
const logsEl = document.getElementById('logs');

let isRecording = false;
let recognition = null;

// Load repos on page load
async function loadRepos() {
  try {
    const res = await fetch('/api/repos');
    const repos = await res.json();
    if (repos.error) {
      repoSelect.innerHTML = '<option>Error loading repos</option>';
      return;
    }
    repoSelect.innerHTML = '<option value="">-- Select a repository --</option>';
    repos.forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.full_name;
      opt.textContent = r.full_name;
      repoSelect.appendChild(opt);
    });
    repoSelect.disabled = false;
  } catch (err) {
    repoSelect.innerHTML = '<option>Failed to connect to server</option>';
  }
}

// Repo selection enables mic
repoSelect.addEventListener('change', () => {
  if (repoSelect.value) {
    micBtn.disabled = false;
    micStatus.textContent = 'Tap the mic and speak your command';
  } else {
    micBtn.disabled = true;
    micStatus.textContent = 'Select a repo to start';
  }
});

// Setup speech recognition
function setupRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micStatus.textContent = 'Speech recognition not supported in this browser. Use Chrome.';
    return null;
  }
  const rec = new SpeechRecognition();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;

  rec.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    transcriptEl.textContent = transcript;
    transcriptArea.classList.remove('hidden');
  };

  rec.onend = () => {
    isRecording = false;
    micBtn.classList.remove('recording');
    micStatus.textContent = 'Processing your command...';
    const finalText = transcriptEl.textContent.trim();
    if (finalText) {
      sendCommand(finalText);
    } else {
      micStatus.textContent = 'No speech detected. Try again.';
    }
  };

  rec.onerror = (event) => {
    isRecording = false;
    micBtn.classList.remove('recording');
    micStatus.textContent = `Error: ${event.error}. Try again.`;
  };

  return rec;
}

// Mic button click
micBtn.addEventListener('click', () => {
  if (!recognition) recognition = setupRecognition();
  if (!recognition) return;

  if (isRecording) {
    recognition.stop();
    isRecording = false;
    micBtn.classList.remove('recording');
  } else {
    // Reset UI
    resultsSection.classList.add('hidden');
    logsArea.classList.add('hidden');
    transcriptEl.textContent = '';
    resultsContent.innerHTML = '';
    logsEl.innerHTML = '';

    recognition.start();
    isRecording = true;
    micBtn.classList.add('recording');
    micStatus.textContent = 'Listening...';
    transcriptArea.classList.remove('hidden');
  }
});

// Send voice command to server
async function sendCommand(text) {
  const repo = repoSelect.value;
  if (!repo) return;

  processing.classList.remove('hidden');
  processingText.textContent = 'Sending to Gemini...';

  try {
    const res = await fetch('/api/voice-command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, repo }),
    });
    const data = await res.json();

    processing.classList.add('hidden');

    // Show logs
    if (data.logs && data.logs.length > 0) {
      logsArea.classList.remove('hidden');
      logsEl.innerHTML = data.logs.map((l) => `<div class="log-line">${l}</div>`).join('');
    }

    // Show results
    resultsSection.classList.remove('hidden');
    if (data.error) {
      resultsContent.innerHTML = `<div class="result-error">Error: ${data.error}</div>`;
      micStatus.textContent = 'Command failed. Try again.';
      return;
    }

    if (!data.success || !data.results || data.results.length === 0) {
      resultsContent.innerHTML = '<div class="result-error">No files were modified.</div>';
      micStatus.textContent = 'No changes made. Try a different command.';
      return;
    }

    let html = '';
    data.results.forEach((r) => {
      html += `
        <div class="result-item">
          <div class="result-file">${r.file}</div>
          <a href="${r.commitUrl}" target="_blank" class="result-link">View commit on GitHub</a>
        </div>
      `;
    });
    resultsContent.innerHTML = html;
    micStatus.textContent = `Done! Modified ${data.results.length} file(s) and pushed to GitHub.`;
  } catch (err) {
    processing.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    resultsContent.innerHTML = `<div class="result-error">Network error: ${err.message}</div>`;
    micStatus.textContent = 'Connection error. Try again.';
  }
}

// Init
loadRepos();
