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
import * as aiDoctor from './server/ai-doctor.js';
import { buildGitignore } from './server/gitignore.js';
import * as access from './server/access.js';
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
const uploadCache = new Map<string, { buffer: Buffer; filename: string; projectType: string; timestamp: number }>();

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
    features: ['zip-inspection', 'github-push', 'ai-doctor'],
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
      projectType: analysis.projectType,
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
      <h1>Hello from Zip2Repo</h1>
      <p>This Vite + React sample was pushed to GitHub with Zip2Repo.</p>
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
  res.json({ message: 'Hello from the Zip2Repo Express sample', timestamp: new Date() });
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
    <title>Static HTML sample</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 600px; margin: 4rem auto; padding: 0 1rem; line-height: 1.6; }
      h1 { font-size: 2rem; }
    </style>
  </head>
  <body>
    <h1>Static HTML sample</h1>
    <p>This page was pushed to GitHub with Zip2Repo.</p>
  </body>
</html>`);
    zip.file('README.md', `# Static HTML sample\nGenerated by the Zip2Repo sample generator.`);
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const filename = `${type}-starter.zip`;
  const { analysis, fileList } = await zipService.inspectZip(buffer, filename);

  const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  uploadCache.set(uploadId, {
    buffer,
    filename,
    projectType: analysis.projectType,
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

// 5. Push a ZIP to a new or existing GitHub repository
app.post('/api/zip/push-to-github', async (req, res) => {
  const {
    uploadId,
    mode = 'new',
    repoName,
    description,
    isPrivate,
    existingRepo,
    branch,
    commitMessage,
    addGitignore = true,
  } = req.body;
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

  if (mode !== 'new' && mode !== 'existing') {
    return res.status(400).json({ error: 'Unknown destination. Choose a new or existing repository.' });
  }
  if (mode === 'existing' && !(typeof existingRepo === 'string' && /^[^/\s]+\/[^/\s]+$/.test(existingRepo))) {
    return res.status(400).json({ error: 'Choose the repository to push to.' });
  }
  if (mode === 'new' && !(typeof repoName === 'string' && repoName.trim())) {
    return res.status(400).json({ error: 'Enter a name for the new repository.' });
  }

  const cached = uploadCache.get(uploadId)!;
  const wantsStream = req.headers.accept?.includes('application/x-ndjson');

  if (wantsStream) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
  }

  const progress = (message: string, percent: number) => {
    if (wantsStream) res.write(JSON.stringify({ type: 'progress', message, percent }) + '\n');
  };

  try {
    progress('Checking your GitHub account...', 10);
    const user = await ghService.verifyGitHubToken(token);

    // Resolve the target repository: create it, or check that it accepts pushes.
    let repo: any;
    if (mode === 'existing') {
      progress(`Checking write access to ${existingRepo}...`, 20);
      repo = await ghService.getRepository(token, ...(existingRepo.split('/') as [string, string]));
      if (!repo.permissions?.push) {
        throw new Error(`Your account does not have write access to ${repo.full_name}.`);
      }
      if (repo.archived) {
        throw new Error(`${repo.full_name} is archived. Unarchive it on GitHub before pushing.`);
      }
    } else {
      progress(`Creating repository on GitHub for ${user.login}...`, 20);
      repo = await ghService.createRepository(token, {
        name: String(repoName).trim().replace(/[^a-zA-Z0-9._-]/g, '-'),
        description: cleanDescription(description, 'Created with Zip2Repo.'),
        isPrivate: isPrivate ?? true,
        autoInit: true,
      });
      activityStore.logActivity({
        type: 'repo_create',
        title: `Created repository ${repo.full_name}`,
        description: `Created a ${repo.private ? 'private' : 'public'} GitHub repository.`,
        status: 'success',
        metadata: { repoUrl: repo.html_url },
      });
    }

    const owner: string = repo.owner.login;
    const targetBranch = (typeof branch === 'string' && branch.trim()) || repo.default_branch || 'main';

    progress('Extracting archive files safely...', 30);
    const files = await zipService.extractAndPrepareFiles(cached.buffer);

    // Add a .gitignore when the ZIP has none, so build output and local secrets stay out of Git.
    let gitignoreAdded = false;
    if (addGitignore && !files.some((f) => f.path === '.gitignore')) {
      const content = buildGitignore(cached.projectType);
      files.push({ path: '.gitignore', content: Buffer.from(content, 'utf8'), isBinary: false, size: Buffer.byteLength(content) });
      gitignoreAdded = true;
    }

    progress(`Prepared ${files.length} project files. Beginning Git upload...`, 35);

    const pushResult = await ghService.pushExtractedFiles(
      token,
      owner,
      repo.name,
      targetBranch,
      files,
      (typeof commitMessage === 'string' && commitMessage.trim()) || `${files.length} files deployed via Zip2Repo`,
      progress
    );

    activityStore.logActivity({
      type: 'push_files',
      title: `Pushed ${files.length} files to ${repo.full_name}`,
      description: `Commit ${pushResult.commitSha.slice(0, 7)} on branch ${targetBranch}${mode === 'existing' ? ' (existing repository)' : ''}`,
      status: 'success',
      metadata: { commitUrl: pushResult.commitUrl, gitignoreAdded },
    });

    const payload = {
      success: true,
      mode,
      repository: repo,
      commitSha: pushResult.commitSha,
      commitUrl: pushResult.commitUrl,
      totalFiles: pushResult.totalFiles,
      branch: targetBranch,
      gitignoreAdded,
    };

    if (wantsStream) {
      res.write(JSON.stringify({ type: 'complete', ...payload }) + '\n');
      res.end();
    } else {
      res.json(payload);
    }
  } catch (err: any) {
    activityStore.logActivity({
      type: 'error',
      title: 'Push to GitHub failed',
      description: err.message || 'Error occurred while creating repository or pushing files',
      status: 'failed',
    });

    const message = err.message || 'Failed to push project to GitHub';
    if (wantsStream && res.headersSent) {
      res.write(JSON.stringify({ type: 'error', error: message }) + '\n');
      res.end();
    } else {
      res.status(500).json({ error: message });
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

// Repositories the account can push to (write access, not archived), for the upload form
app.get('/api/repos/push-targets', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) {
    return res.status(401).json({ error: 'GitHub authentication required' });
  }

  try {
    const all: any[] = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await ghService.listUserRepositories(token, { perPage: 100, page });
      all.push(...batch);
      if (batch.length < 100) break;
    }
    res.json({
      repositories: all
        .filter((r: any) => r.permissions?.push && !r.archived)
        .map((r: any) => ({
          full_name: r.full_name,
          name: r.name,
          owner: r.owner?.login,
          private: r.private,
          default_branch: r.default_branch,
        })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load repositories' });
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

// 8. Activity Log API
app.get('/api/activity', (_req, res) => {
  const activities = activityStore.getActivities();
  res.json({ activities });
});

// 9. AI Doctor conversation API. Every chat belongs to the account whose token made it.
const doctorOwner = (req: express.Request) => aiDoctor.ownerKeyOf(extractGhToken(req));

app.get('/api/doctor/conversations', (req, res) => {
  res.json({ conversations: aiDoctor.listConversations(doctorOwner(req)) });
});

app.post('/api/doctor/conversations', (req, res) => {
  const conv = aiDoctor.getOrCreateConversation(undefined, doctorOwner(req));
  res.json({ conversation: conv });
});

app.get('/api/doctor/conversations/:id', (req, res) => {
  const conv = aiDoctor.getConversation(req.params.id, doctorOwner(req));
  if (!conv) return res.status(404).json({ error: 'Chat not found' });
  res.json({ conversation: conv });
});

app.delete('/api/doctor/conversations/:id', (req, res) => {
  res.json({ success: aiDoctor.deleteConversation(req.params.id, doctorOwner(req)) });
});

app.patch('/api/doctor/conversations/:id/rename', (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
  if (!title) return res.status(400).json({ error: 'Title required' });
  res.json({ success: aiDoctor.renameConversation(req.params.id, title, doctorOwner(req)) });
});

app.post('/api/doctor/chat', async (req, res) => {
  const { conversationId, message } = req.body ?? {};
  const githubToken = extractGhToken(req);

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    const assistantMessage = await aiDoctor.processDoctorMessage({
      conversationId: typeof conversationId === 'string' && conversationId ? conversationId : undefined,
      userMessage: message.slice(0, 8000),
      githubToken,
    });
    res.json({ success: true, message: assistantMessage });
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
  res.json({ success: aiDoctor.cancelPendingAction(req.params.id, extractGhToken(req)) });
});

// Repositories for the @ picker in AI Doctor (own, org, and collaborator repos, most recent first)
app.get('/api/doctor/repos', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) return res.status(401).json({ error: 'Connect GitHub first.' });
  try {
    const all: any[] = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await ghService.listUserRepositories(token, { perPage: 100, page });
      all.push(...batch);
      if (batch.length < 100) break;
    }
    res.json({
      repositories: all.map((r) => ({
        full_name: r.full_name,
        name: r.name,
        owner: r.owner?.login,
        private: r.private,
        description: r.description,
        default_branch: r.default_branch,
        updated_at: r.updated_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load repositories' });
  }
});

// Set or clear the repo a chat is focused on
app.put('/api/doctor/conversations/:id/focus', (req, res) => {
  const repo = typeof req.body?.repo === 'string' && req.body.repo.trim() ? req.body.repo.trim() : null;
  res.json({ success: aiDoctor.setFocusRepo(req.params.id, repo, doctorOwner(req)) });
});


// 10. Settings: token access and AI Doctor permissions
app.get('/api/settings/access', async (req, res) => {
  const token = extractGhToken(req);
  if (!token) return res.status(401).json({ error: 'Connect GitHub first.' });
  try {
    const user = await ghService.verifyGitHubToken(token);
    const type = access.tokenTypeOf(token);
    const permissions = access.getPermissions(doctorOwner(req));
    res.json({
      login: user.login,
      tokenType: type,
      scopes: user.scopes.map(access.describeScope),
      capabilities: access.capabilitiesFor(user.scopes, type, permissions),
      permissions,
    });
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Could not read the token' });
  }
});

app.put('/api/settings/permissions', (req, res) => {
  const token = extractGhToken(req);
  if (!token) return res.status(401).json({ error: 'Connect GitHub first.' });
  const patch: Partial<access.DoctorPermissions> = {};
  if (typeof req.body?.allowChanges === 'boolean') patch.allowChanges = req.body.allowChanges;
  if (typeof req.body?.allowDestructive === 'boolean') patch.allowDestructive = req.body.allowDestructive;
  res.json({ permissions: access.setPermissions(doctorOwner(req), patch) });
});

// Link previews need absolute image URLs. Use APP_URL when set, otherwise the address the request came in on.
const withSiteUrl = (html: string, req: express.Request): string => {
  const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return html.split('__SITE_URL__').join(base);
};

// ================= VITE DEV / STATIC SERVING =================
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    // Serve index.html with absolute preview URLs, passed through Vite so dev modules still load
    app.get('/', async (req, res, next) => {
      try {
        const raw = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');
        const html = await vite.transformIndexHtml(req.originalUrl, raw);
        res.type('html').send(withSiteUrl(html, req));
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.get('/', (req, res) => {
        const html = fs.readFileSync(path.resolve(distPath, 'index.html'), 'utf8');
        res.type('html').send(withSiteUrl(html, req));
      });
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Zip2Repo server running on http://0.0.0.0:${PORT} (5 minute timeout enabled)`);
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
