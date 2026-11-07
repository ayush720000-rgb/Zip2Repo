/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanDescription } from './server/zip-service.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

import * as zipService from './server/zip-service.js';
import * as ghService from './server/github-service.js';
import * as renderService from './server/render-service.js';
import * as aiDoctor from './server/ai-doctor.js';
import { activityStore } from './server/activity-store.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// 5-minute (300,000ms) timeout for slow network connections
export const TIMEOUT_5_MINUTES = 5 * 60 * 1000;

// Set 5-minute timeout for all incoming HTTP requests
app.use((req, res, next) => {
  req.setTimeout(TIMEOUT_5_MINUTES);
  res.setTimeout(TIMEOUT_5_MINUTES);
  next();
});

// Basic middleware
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));
app.use(cookieParser());

// Multer in-memory storage for ZIP files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files (.zip) are supported'));
    }
  },
});

// Helper to extract GitHub token from request
function extractGhToken(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const customHeader = req.headers['x-github-token'] as string;
  if (customHeader) {
    return customHeader.trim();
  }
  if (req.cookies && req.cookies.gh_token) {
    return req.cookies.gh_token;
  }
  return process.env.GITHUB_TOKEN;
}

// In-memory cache for inspected uploads (session-scoped)
const uploadCache = new Map<string, { buffer: Buffer; filename: string; timestamp: number }>();

// Clean old upload cache entries periodically (kept for 60 minutes for slow connections)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of uploadCache.entries()) {
    if (now - value.timestamp > 60 * 60 * 1000) {
      uploadCache.delete(key);
    }
  }
}, 15 * 60 * 1000);

// ================= API ROUTES =================

// 1. Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Zip2Repo Server',
    features: ['zip-inspection', 'git-tree-push', 'render-automation', 'ai-doctor'],
  });
});

// 2. GitHub Auth Verification
app.post('/api/auth/github/verify', async (req, res) => {
  const token = req.body.token || extractGhToken(req);
  if (!token) {
    return res.status(400).json({ error: 'GitHub token is required' });
  }

  try {
    const user = await ghService.verifyGitHubToken(token);
    // Optionally set cookie
    res.cookie('gh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    activityStore.logActivity({
      type: 'settings',
      title: 'GitHub Connected',
      description: `Authenticated as @${user.login}`,
      status: 'success',
      metadata: { username: user.login },
    });

    res.json({ success: true, user });
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'GitHub verification failed' });
  }
});

app.get('/api/auth/github/user', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const user = await ghService.verifyGitHubToken(token);
    res.json({ authenticated: true, user });
  } catch (err: any) {
    res.json({ authenticated: false, error: err.message });
  }
});

app.post('/api/auth/github/disconnect', (_req, res) => {
  res.clearCookie('gh_token');
  res.json({ success: true });
});

// 3. ZIP Upload & Safety Inspection
app.post('/api/zip/inspect', upload.single('file'), async (req, res) => {
  try {
    let buffer: Buffer | undefined;
    let originalName = 'project.zip';

    if (req.file) {
      buffer = req.file.buffer;
      originalName = req.file.originalname;
    } else if (req.body.base64Data) {
      buffer = Buffer.from(req.body.base64Data, 'base64');
      originalName = req.body.filename || 'project.zip';
    }

    if (!buffer) {
      return res.status(400).json({ error: 'No ZIP file uploaded' });
    }

    const { analysis, fileList } = await zipService.inspectZip(buffer, originalName);

    // Cache buffer for pushing
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    uploadCache.set(uploadId, {
      buffer,
      filename: originalName,
      timestamp: Date.now(),
    });

    activityStore.logActivity({
      type: 'upload',
      title: `ZIP Inspected: ${originalName}`,
      description: `Detected ${analysis.frameworkName} (${analysis.fileCount} files, ${analysis.formattedSize})`,
      status: 'success',
      metadata: { uploadId, fileCount: analysis.fileCount },
    });

    res.json({
      success: true,
      uploadId,
      filename: originalName,
      analysis,
      filesPreview: fileList.slice(0, 30),
    });
  } catch (err: any) {
    activityStore.logActivity({
      type: 'error',
      title: 'ZIP Inspection Failed',
      description: err.message || 'Unknown archive error',
      status: 'failed',
    });
    res.status(400).json({ error: err.message || 'Failed to inspect ZIP file' });
  }
});

// 4. Sample project generator (Allows users to test immediately without an external ZIP)
app.post('/api/sample-zip/:type', async (req, res) => {
  const type = req.params.type;
  const zip = new JSZip();

  if (type === 'vite-react') {
    zip.file('package.json', JSON.stringify({
      name: 'vite-react-starter',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^18.3.1',
        'react-dom': '^18.3.1',
      },
      devDependencies: {
        '@vitejs/plugin-react': '^4.3.1',
        vite: '^5.4.2',
      },
    }, null, 2));

    zip.file('vite.config.js', `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
});`);

    zip.file('index.html', `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite React Starter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`);

    zip.file('src/main.jsx', `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`);

    zip.file('src/App.jsx', `export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', textAlign: 'center' }}>
      <h1>Deployed with Zip2Repo ⚡</h1>
      <p>Your Vite + React application is live and performing wonderfully!</p>
    </div>
  );
}`);

    zip.file('.gitignore', `node_modules\ndist\n.DS_Store\n`);
  } else if (type === 'node-express') {
    zip.file('package.json', JSON.stringify({
      name: 'node-express-api',
      version: '1.0.0',
      main: 'index.js',
      scripts: {
        start: 'node index.js',
      },
      dependencies: {
        express: '^4.19.2',
      },
    }, null, 2));

    zip.file('index.js', `const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Node Express API deployed via Zip2Repo!', timestamp: new Date() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(port, () => {
  console.log('Server running on port ' + port);
});`);

    zip.file('.gitignore', `node_modules\n.env\n.DS_Store\n`);
  } else {
    // Static HTML starter
    zip.file('index.html', `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Portfolio Starter</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 600px; margin: 4rem auto; padding: 0 1rem; line-height: 1.6; }
      h1 { font-size: 2rem; }
    </style>
  </head>
  <body>
    <h1>Welcome to My Project</h1>
    <p>Uploaded from ZIP and pushed directly to GitHub with Zip2Repo.</p>
  </body>
</html>`);
    zip.file('README.md', `# Static Project\nCreated via Zip2Repo sample generator.`);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const filename = `${type}-starter.zip`;
  const { analysis, fileList } = await zipService.inspectZip(buffer, filename);

  const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  uploadCache.set(uploadId, {
    buffer,
    filename,
    timestamp: Date.now(),
  });

  res.json({
    success: true,
    uploadId,
    filename,
    analysis,
    filesPreview: fileList,
  });
});

// 5. Create Repo & Push Files
app.post('/api/zip/push-to-github', async (req, res) => {
  const { uploadId, repoName, description, isPrivate, branch = 'main', commitMessage } = req.body;
  const token = extractGhToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'GitHub token required. Please connect your GitHub account or provide a Personal Access Token.',
    });
  }

  if (!uploadId || !uploadCache.has(uploadId)) {
    return res.status(400).json({
      error: 'Upload session expired or invalid. Please re-upload your ZIP archive.',
    });
  }

  const cached = uploadCache.get(uploadId)!;
  const wantsStream = req.headers.accept?.includes('application/x-ndjson');

  if (wantsStream) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(JSON.stringify({ type: 'progress', message: 'Authenticating with GitHub...', percent: 10 }) + '\n');
  }

  try {
    // 1. Verify user to get owner username
    const user = await ghService.verifyGitHubToken(token);
    const owner = user.login;

    if (wantsStream) {
      res.write(JSON.stringify({ type: 'progress', message: `Creating repository on GitHub for ${owner}...`, percent: 20 }) + '\n');
    }

    // 2. Create the repository
    const sanitizedRepoName = repoName.replace(/[^a-zA-Z0-9._-]/g, '-');
    const createdRepo = await ghService.createRepository(token, {
      name: sanitizedRepoName,
      description: cleanDescription(description, 'Repository created by Zip2Repo.'),
      isPrivate: isPrivate ?? true,
      autoInit: true,
    });

    activityStore.logActivity({
      type: 'repo_create',
      title: `Created Repository ${createdRepo.full_name}`,
      description: `Created ${createdRepo.private ? 'private' : 'public'} GitHub repository.`,
      status: 'success',
      metadata: { repoUrl: createdRepo.html_url },
    });

    if (wantsStream) {
      res.write(JSON.stringify({ type: 'progress', message: `Extracting archive files safely...`, percent: 30 }) + '\n');
    }

    // 3. Extract and filter files safely
    const files = await zipService.extractAndPrepareFiles(cached.buffer);

    if (wantsStream) {
      res.write(JSON.stringify({ type: 'progress', message: `Prepared ${files.length} project files. Beginning Git blob upload...`, percent: 35 }) + '\n');
    }

    // 4. Push files using Git Trees API with live progress reporting
    const pushResult = await ghService.pushExtractedFiles(
      token,
      owner,
      createdRepo.name,
      branch,
      files,
      commitMessage || `Initial project commit pushed via Zip2Repo (${files.length} files)`,
      (stage, percent) => {
        if (wantsStream) {
          res.write(JSON.stringify({ type: 'progress', message: stage, percent }) + '\n');
        }
      }
    );

    activityStore.logActivity({
      type: 'push_files',
      title: `Pushed ${files.length} files to ${createdRepo.full_name}`,
      description: `Commit ${pushResult.commitSha.slice(0, 7)} created on branch ${branch}`,
      status: 'success',
      metadata: { commitUrl: pushResult.commitUrl },
    });

    if (wantsStream) {
      res.write(JSON.stringify({
        type: 'complete',
        success: true,
        repository: createdRepo,
        commitSha: pushResult.commitSha,
        commitUrl: pushResult.commitUrl,
        totalFiles: pushResult.totalFiles,
        branch,
      }) + '\n');
      res.end();
    } else {
      res.json({
        success: true,
        repository: createdRepo,
        commitSha: pushResult.commitSha,
        commitUrl: pushResult.commitUrl,
        totalFiles: pushResult.totalFiles,
        branch,
      });
    }
  } catch (err: any) {
    activityStore.logActivity({
      type: 'error',
      title: 'Push to GitHub Failed',
      description: err.message || 'Error occurred while creating repository or pushing files',
      status: 'failed',
    });

    if (wantsStream && !res.headersSent) {
      res.status(500).json({ error: err.message || 'Failed to push project to GitHub' });
    } else if (wantsStream) {
      res.write(JSON.stringify({ type: 'error', error: err.message || 'Failed to push project to GitHub' }) + '\n');
      res.end();
    } else {
      res.status(500).json({ error: err.message || 'Failed to push project to GitHub' });
    }
  }
});

// 6. Repositories API
app.get('/api/repos', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.status(401).json({ error: 'GitHub authentication required' });
  }

  try {
    const repos = await ghService.listUserRepositories(token, { perPage: 50 });
    res.json({ repositories: repos });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch repositories' });
  }
});

app.get('/api/repos/:owner/:repo', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.status(401).json({ error: 'GitHub authentication required' });
  }

  try {
    const repo = await ghService.getRepository(token, req.params.owner, req.params.repo);
    res.json({ repository: repo });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/repos/create', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.status(401).json({ error: 'GitHub authentication required' });
  }

  try {
    const { name, description, isPrivate } = req.body;
    const repo = await ghService.createRepository(token, { name, description, isPrivate });
    res.json({ repository: repo });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/repos/:owner/:repo/rename', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.status(401).json({ error: 'GitHub authentication required' });
  }

  try {
    const { newName } = req.body;
    const repo = await ghService.renameRepository(token, req.params.owner, req.params.repo, newName);
    res.json({ repository: repo });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/repos/:owner/:repo/visibility', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.status(401).json({ error: 'GitHub authentication required' });
  }

  try {
    const { isPrivate } = req.body;
    const repo = await ghService.updateRepoVisibility(token, req.params.owner, req.params.repo, isPrivate);
    res.json({ repository: repo });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/repos/:owner/:repo', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.status(401).json({ error: 'GitHub authentication required' });
  }

  const { confirmRepoName } = req.body || {};
  if (confirmRepoName && confirmRepoName !== req.params.repo) {
    return res.status(400).json({ error: `Confirmation mismatch: Please provide exact repository name "${req.params.repo}"` });
  }

  try {
    await ghService.deleteRepository(token, req.params.owner, req.params.repo);
    activityStore.logActivity({
      type: 'repo_create',
      title: `Deleted Repository ${req.params.owner}/${req.params.repo}`,
      description: 'Repository permanently deleted by user instruction.',
      status: 'warning',
    });
    res.json({ success: true, message: `Repository ${req.params.repo} deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/repos/:owner/:repo/files', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.status(401).json({ error: 'GitHub authentication required' });
  }

  try {
    const pathQuery = (req.query.path as string) || '';
    const files = await ghService.listRepoFiles(token, req.params.owner, req.params.repo, pathQuery);
    res.json({ files });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/repos/:owner/:repo/file-content', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.status(401).json({ error: 'GitHub authentication required' });
  }

  try {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: 'File path required' });
    const content = await ghService.getRepoFileContent(token, req.params.owner, req.params.repo, filePath);
    res.json(content);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Render Preparation & Deployment
app.post('/api/render/prepare', (req, res) => {
  const { projectType, packageDetails, existingFiles } = req.body;
  const result = renderService.prepareRenderCompatibility(projectType, packageDetails, existingFiles || []);
  res.json(result);
});

app.post('/api/render/commit-prepared', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.status(401).json({ error: 'GitHub authentication required' });
  }

  const { owner, repo, branch = 'main', files, commitMessage } = req.body;
  if (!owner || !repo || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const result = await ghService.commitFilesDirectly(
      token,
      owner,
      repo,
      files,
      commitMessage || 'Configure repository for Render deployment (render.yaml, .gitignore)',
      branch
    );

    activityStore.logActivity({
      type: 'settings',
      title: `Render Files Committed: ${repo}`,
      description: `Committed ${files.map((f: any) => f.path).join(', ')} to branch ${branch}`,
      status: 'success',
      metadata: { commitUrl: result.commitUrl },
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to commit configuration to repository' });
  }
});

app.post('/api/render/deploy', async (req, res) => {
  const { projectName, repoName, repoUrl, branch = 'main', renderApiKey, asIs = false } = req.body;
  if (!repoName || !repoUrl) {
    return res.status(400).json({ error: 'Repository name and URL are required' });
  }

  try {
    const deployment = await renderService.initiateRenderDeployment({
      projectName: projectName || repoName,
      repoName,
      repoUrl,
      branch,
      renderApiKey,
      asIs,
    });

    res.json({ success: true, deployment });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to initiate deployment' });
  }
});

app.get('/api/render/deployments', (_req, res) => {
  const deployments = activityStore.getDeployments();
  res.json({ deployments });
});

app.get('/api/render/deployments/:id', (req, res) => {
  const deployment = activityStore.getDeployment(req.params.id);
  if (!deployment) {
    return res.status(404).json({ error: 'Deployment not found' });
  }
  res.json({ deployment });
});

// 8. Activity Log API
app.get('/api/activity', (_req, res) => {
  const activities = activityStore.getActivities();
  res.json({ activities });
});

// 9. AI Doctor Conversation API
app.get('/api/doctor/conversations', (_req, res) => {
  const convs = aiDoctor.listConversations();
  res.json({ conversations: convs });
});

app.post('/api/doctor/conversations', (req, res) => {
  const conv = aiDoctor.getOrCreateConversation();
  res.json({ conversation: conv });
});

app.get('/api/doctor/conversations/:id', (req, res) => {
  const conv = aiDoctor.getOrCreateConversation(req.params.id);
  res.json({ conversation: conv });
});

app.delete('/api/doctor/conversations/:id', (req, res) => {
  const success = aiDoctor.deleteConversation(req.params.id);
  res.json({ success });
});

app.patch('/api/doctor/conversations/:id/rename', (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const success = aiDoctor.renameConversation(req.params.id, title);
  res.json({ success });
});

app.post('/api/doctor/chat', async (req, res) => {
  const { conversationId, message } = req.body;
  const githubToken = extractGhToken(req);

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    const assistantMessage = await aiDoctor.processDoctorMessage({
      conversationId: conversationId || 'default',
      userMessage: message,
      githubToken,
    });

    res.json({
      success: true,
      message: assistantMessage,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI Doctor failed to respond' });
  }
});

// Confirm / cancel buttons for destructive GitHub actions
app.post('/api/doctor/actions/:id/confirm', async (req, res) => {
  try {
    const message = await aiDoctor.confirmPendingAction(req.params.id, extractGhToken(req));
    res.json({ success: true, message });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Action failed' });
  }
});

app.post('/api/doctor/actions/:id/cancel', (req, res) => {
  const ok = aiDoctor.cancelPendingAction(req.params.id);
  res.json({ success: ok });
});

// ================= VITE DEV / STATIC SERVING =================
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ Zip2Repo full-stack server running on http://0.0.0.0:${PORT} (5 min timeout enabled)`);
  });

  // Set 5-minute socket, keep-alive and headers timeout for slow internet connections
  server.timeout = TIMEOUT_5_MINUTES;
  server.keepAliveTimeout = TIMEOUT_5_MINUTES;
  server.headersTimeout = TIMEOUT_5_MINUTES + 5000;
  if ('requestTimeout' in server) {
    (server as any).requestTimeout = TIMEOUT_5_MINUTES;
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
