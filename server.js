require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`;

function githubHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'VoiceCoder',
  };
}

async function callGemini(prompt) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });
  const data = await res.json();
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('Gemini returned no response: ' + JSON.stringify(data));
  }
  return data.candidates[0].content.parts[0].text;
}

// GET /api/repos - list user's repos
app.get('/api/repos', async (req, res) => {
  try {
    const ghRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: githubHeaders(),
    });
    const repos = await ghRes.json();
    console.log('GitHub API status:', ghRes.status);
    console.log('GitHub API response:', JSON.stringify(repos).slice(0, 500));
    if (!Array.isArray(repos)) {
      return res.status(400).json({ error: 'Failed to fetch repos', details: repos });
    }
    res.json(repos.map((r) => ({ full_name: r.full_name, name: r.name, default_branch: r.default_branch })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/voice-command
app.post('/api/voice-command', async (req, res) => {
  const { text, repo } = req.body; // repo = "owner/repo"
  if (!text || !repo) return res.status(400).json({ error: 'text and repo are required' });

  const [owner, repoName] = repo.split('/');
  const logs = [];
  const log = (msg) => logs.push(msg);

  try {
    // 1. Get repo default branch
    log('Fetching repo info...');
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
      headers: githubHeaders(),
    });
    const repoInfo = await repoRes.json();
    const branch = repoInfo.default_branch || 'main';

    // 2. Get file tree
    log('Fetching file tree...');
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/git/trees/${branch}?recursive=1`,
      { headers: githubHeaders() }
    );
    const treeData = await treeRes.json();
    const files = (treeData.tree || [])
      .filter((f) => f.type === 'blob')
      .map((f) => f.path);

    // 3. Ask Gemini which files to modify
    log('Asking Gemini which files to modify...');
    const fileListStr = files.join('\n');
    const step1Prompt = `You are a code assistant. Given a voice command from a user and a list of files in a GitHub repository, determine which file(s) need to be modified.

Voice command: "${text}"

Files in the repository:
${fileListStr}

Respond with ONLY a JSON array of file paths that need to be modified. Example: ["src/style.css", "index.html"]
If no files match, respond with an empty array [].`;

    const step1Response = await callGemini(step1Prompt);
    let filesToModify;
    try {
      const jsonMatch = step1Response.match(/\[[\s\S]*?\]/);
      filesToModify = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('Gemini returned invalid file list: ' + step1Response);
    }

    if (filesToModify.length === 0) {
      return res.json({ success: false, message: 'No files matched the command', logs });
    }

    log(`Files to modify: ${filesToModify.join(', ')}`);

    // 4. For each file: read, modify with Gemini, push
    const results = [];
    for (const filePath of filesToModify) {
      log(`Reading ${filePath}...`);
      const fileRes = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}?ref=${branch}`,
        { headers: githubHeaders() }
      );
      const fileData = await fileRes.json();

      if (!fileData.content) {
        log(`Skipping ${filePath} - could not read`);
        continue;
      }

      const originalContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

      // 5. Ask Gemini to modify the file
      log(`Asking Gemini to modify ${filePath}...`);
      const step2Prompt = `You are a code assistant. Modify the following file according to the user's instruction.

User instruction: "${text}"

File: ${filePath}
Current content:
\`\`\`
${originalContent}
\`\`\`

Respond with ONLY the complete modified file content. No explanations, no markdown code fences, just the raw file content.`;

      const modifiedContent = await callGemini(step2Prompt);

      // Clean up: remove markdown fences if Gemini added them
      let cleanContent = modifiedContent;
      const fenceMatch = cleanContent.match(/^```[\w]*\n([\s\S]*?)\n```$/);
      if (fenceMatch) cleanContent = fenceMatch[1];

      // 6. Push to GitHub
      log(`Pushing ${filePath}...`);
      const commitMessage = `Voice edit: ${text}`;
      const putRes = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`,
        {
          method: 'PUT',
          headers: { ...githubHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: commitMessage,
            content: Buffer.from(cleanContent).toString('base64'),
            sha: fileData.sha,
            branch,
          }),
        }
      );
      const putData = await putRes.json();

      if (putData.commit) {
        log(`Pushed ${filePath} successfully!`);
        results.push({
          file: filePath,
          commitUrl: putData.commit.html_url,
          original: originalContent,
          modified: cleanContent,
        });
      } else {
        log(`Failed to push ${filePath}: ${JSON.stringify(putData)}`);
      }
    }

    res.json({ success: true, results, logs });
  } catch (err) {
    log(`Error: ${err.message}`);
    res.status(500).json({ error: err.message, logs });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Voice Coder running on http://localhost:${PORT}`));
