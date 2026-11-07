# Zip2Repo

**Turn any ZIP archive into a GitHub repository in one step, then deploy it to Render.**

Zip2Repo unpacks your project, detects its framework, flags likely deployment problems, and pushes every file to a new or existing GitHub repo. An AI assistant, **AI Doctor**, can manage your repositories in plain English, with a confirmation button before anything destructive happens.

---

## Features

- **ZIP to repo.** Upload a ZIP of any size (up to 200 MB) and get a clean GitHub repository.
- **Reliable large uploads.** Text files are sent in batched Git API calls, so a 500-file project takes a few requests instead of hundreds. Rate-limit responses from GitHub pause and retry automatically, with live progress shown in the UI.
- **Framework detection.** Recognizes common stacks and reports missing scripts, lockfiles, or config.
- **Render deployment helpers.** Generates `render.yaml` and `.gitignore` for your project type.
- **Repository management.** List, inspect, rename, change visibility, and delete repos.
- **Confirm before destroying.** Delete, rename, and visibility changes show an inline **Confirm / Cancel** button. Nothing runs without a click. Bulk delete is refused.
- **AI Doctor (Gemini).** Natural-language help with GitHub and deployments. Supports several API keys and switches to the next key when one hits its quota.
- **Activity log.** Every upload, push, and AI action is recorded in the dashboard.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, Motion, Lucide icons |
| Backend | Node.js, Express 4, TypeScript (run with `tsx`) |
| Archives | JSZip, Multer (uploads) |
| AI | Google Gemini via `@google/genai` (function calling) |
| Integrations | GitHub REST and Git Data APIs, Render API |

## Quick start (local)

Requires **Node.js 22 or newer**.

```bash
git clone https://github.com/ayush720000-rgb/zip2repo-fixed.git
cd zip2repo-fixed
npm install
cp .env.example .env     # then fill in your values
npm run dev
```

Open <http://localhost:3000>.

## Environment variables

| Name | Required | Description |
|---|---|---|
| `GEMINI_API_KEYS` | For AI mode | Comma-separated Gemini keys. The app rotates to the next key when one is rate-limited. |
| `GEMINI_MODEL` | No | Gemini model name. Default `gemini-3.8-flash`. |
| `GITHUB_TOKEN` | No | Default GitHub token. Users can also connect their own in the app. |
| `RENDER_API_KEY` | No | Render API key for deployment. Can also be set in the app. |
| `APP_URL` | No | Public URL of the app. |
| `PORT` | No | Server port. Default `3000`. |

Without `GEMINI_API_KEYS`, AI Doctor still runs direct commands such as `list my repos`, `create repo my-app`, and `delete repo my-app`. It just won't answer free-form questions.

## Deploy on Render

Create a **Web Service** (not a Static Site) from this repository.

| Setting | Value |
|---|---|
| Runtime | Node |
| Node version | 22 or newer |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |

Add your variables (at least `GEMINI_API_KEYS`) in the **Environment** tab.

If the build fails with an `ERESOLVE` peer-dependency error, use this build command instead:

```bash
npm install --legacy-peer-deps && npm run build
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| "AI mode is off" | Set `GEMINI_API_KEYS` and redeploy. |
| "All AI keys are at their limit" | Add more keys to `GEMINI_API_KEYS`, or wait a minute. |
| "AI is unavailable right now" | Check the server logs for `[AI Doctor] Gemini request failed`. The line shows the cause, often a retired model name. Set `GEMINI_MODEL` to a current one. |
| Upload stops with a GitHub rate-limit message | Wait. The app retries automatically. If it still fails, try again in 10 to 15 minutes. |
| Build fails with `ERESOLVE` | Use the `--legacy-peer-deps` build command above. |

## Health check

```
GET /api/health
```

```json
{ "status": "ok", "service": "Zip2Repo Server" }
```

## Project structure

```
src/                 React frontend (pages, components, context)
server/              Backend services
  ai-doctor.ts         AI assistant, confirmations, Gemini key rotation
  github-service.ts    GitHub API, batched push, rate-limit retry
  zip-service.ts       ZIP inspection and extraction
  render-service.ts    Render config generation and deploy
  activity-store.ts    Activity log
server.ts            Express server (API + built frontend)
.env.example         Environment template
```

## Security

- Never commit `.env` or API keys. Use environment variables in production.
- Tokens are sent per request and are not stored on disk.
- Destructive GitHub actions always require a button click.

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.

---

<p align="center">Built by <a href="https://github.com/ayush720000-rgb">Ayush</a></p>
