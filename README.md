<div align="center">

![Zip2Repo](https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=3,4,21&height=200&section=header&text=Zip2Repo&fontSize=72&fontColor=ffffff&animation=fadeIn)

#### 𝗭𝗶𝗽𝟮𝗥𝗲𝗽𝗼

![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&size=24&duration=3000&pause=1000&color=00D4FF&center=true&vCenter=true&width=680&lines=ZIP+in%2C+GitHub+repo+out;Upload+a+project%2C+push+it+to+GitHub;AI+Doctor+manages+your+repos)

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![GitHub](https://img.shields.io/badge/GitHub-REST%20%26%20Git%20API-181717?style=for-the-badge&logo=github&logoColor=white)
![Node](https://img.shields.io/badge/Node-22+-339933?style=for-the-badge&logo=node.js&logoColor=white)

</div>

---

**Push a ZIP project to a new or existing GitHub repository.** AI Doctor manages your GitHub account in plain English, and the in-app Guide explains every feature.

## Features

The app has a **Guide** tab with step-by-step instructions for every feature.

- **ZIP to GitHub.** Upload a ZIP of up to 200 MB. Choose a new repository, or add the files to one you can push to.
- **Safe overwrites.** Files with the same path are replaced. Files that are not in the ZIP stay as they are.
- **.gitignore on push.** If the ZIP has none, Zip2Repo can add one for the project type.
- **Project check.** Detects the framework and reports missing build or start scripts, a missing lockfile or .gitignore, and similar problems.
- **Large uploads.** Text files go up in batched Git Data API calls. GitHub rate-limit responses pause and retry automatically, with progress shown in the UI.
- **AI Doctor.** Describe a task and it runs the GitHub steps. Destructive actions show a Confirm button first.
- **Activity log.** Uploads, pushes, and AI Doctor actions are recorded.
- **Guide.** A built-in guide covers connecting GitHub, pushing, repositories, AI Doctor, and troubleshooting.
- **Permissions.** Settings shows what your token allows, grouped by purpose, and what AI Doctor may do. You can turn off changes and destructive actions. The server enforces these switches.
- **Link previews.** Shared links show the logo, title, and description on Telegram, Instagram, WhatsApp, Slack, and X.

### AI Doctor

AI Doctor can:

- **Account:** view and update your profile.
- **Repositories:** list, inspect, create, change settings, set topics, star, rename, change visibility, archive, and delete.
- **Branches and commits:** list, create, and delete branches; list recent commits.
- **Issues and pull requests:** list, open, edit, comment, open pull requests, and merge.
- **Releases:** publish tagged releases.
- **Files:** browse, read, create or replace, and delete files with a commit.
- **Ignore rules:** add a `.gitignore` from one of GitHub's templates.

Type `@` in the chat box to pick a repository. The last repository you tag becomes the focus of that chat, so "make it private" works without repeating the name.

Rename, visibility changes, archiving, deleting, merging, and deleting branches or files each require a click on Confirm.

## Requirements

- Node.js 22 or newer
- A GitHub Personal Access Token (classic with the `repo` scope, or fine-grained with write access to the repositories you want to push to)
- A Gemini API key, only if you want AI Doctor

## Run locally

```bash
npm install
cp .env.example .env     # then fill in your values
npm run dev
```

Open <http://localhost:3000>.

## Run with Docker

```bash
cp .env.example .env     # fill in your values
docker compose up --build
```

Open <http://localhost:3000>. Without Compose: `docker build -t zip2repo . && docker run --env-file .env -p 3000:3000 zip2repo`.

## Build and run in production

```bash
npm run build
npm start
```

`npm start` serves the built frontend and the API from one process. Any host that runs a Node.js web process works.

## Environment variables

| Name | Required | Description |
|---|---|---|
| `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, ... | For AI Doctor | Numbered keys, tried in numeric order. |
| `GEMINI_API_KEYS` | Optional | Pool of comma, space, or newline separated keys. |
| `GEMINI_API_KEY` | Optional | Legacy single key. |
| `GEMINI_MODEL` | No | Model name. Default `gemini-3.1-flash-lite`. |
| `GEMINI_FALLBACK_MODELS` | No | Models tried when Gemini is overloaded. |
| `GITHUB_TOKEN` | No | Default GitHub token. Users can also connect their own in the app. |
| `APP_URL` | No | Public address of the site, used for link preview images. Defaults to the address the request came in on. |
| `PORT` | No | Server port. Default `3000`. |

AI Doctor tries each available key once per request. A key that fails is cooled down briefly, and the next key is tried. If Gemini returns a 5xx error, the fallback models are used.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "AI Doctor is off" | Set `GEMINI_API_KEY_1` (or `GEMINI_API_KEYS`) and restart. |
| AI Doctor reports that all keys are at their limit | Wait a minute and try again, or add more keys. |
| Upload stops with a GitHub rate-limit message | Wait. The app retries automatically. If it still fails, try again in 10 to 15 minutes. |
| "Your account does not have write access" | Choose a repository you own or have push access to, or use a token with write access. |
| `ERESOLVE` during install | The included `.npmrc` sets `legacy-peer-deps`. If you removed it, run `npm install --legacy-peer-deps`. |

## Health check

```
GET /api/health
```

```json
{ "status": "ok", "service": "Zip2Repo Server" }
```

## Security

- Never commit `.env` or API keys.
- The GitHub token is saved in the browser and sent to GitHub through the server on each request. The server does not write it to disk.
- AI Doctor chats and pending actions belong to the account whose token created them. Other accounts cannot see or confirm them. Chats live in memory and are lost when the server restarts.
- Destructive GitHub actions always require a button click.
- AI Doctor's permission switches are stored in server memory and reset when the server restarts. Changing a token's scopes has to be done on GitHub.

## Project structure

```
src/                     React frontend
  pages/                   Dashboard, repositories, activity, AI Doctor, settings
  components/              Navbar, GitHub connect dialog, post-push panel
  context/                 App state (GitHub account, current ZIP, navigation)
server/                  Backend services
  ai-doctor.ts             AI assistant, confirmations, Gemini key rotation
  github-service.ts        GitHub API, batched push, rate-limit retry
  zip-service.ts           ZIP inspection and extraction
  gitignore.ts             .gitignore generator for uploads without one
  activity-store.ts        Activity log
server.ts                Express server (API and built frontend)
```

## License

No license has been chosen yet. Until one is added, all rights are reserved by the author.

---

Created by [Ayush](https://github.com/ayush720000-rgb)
