# ReverseMind: detailed notes

**A local-first agent workspace for Linux.** ReverseMind combines coding agents, real terminals, a file editor, Git review, an embedded browser, tickets, routines and MCP connections in one Electron desktop app. There is no account, hosted gateway, cloud requirement or telemetry.

Version **0.1.0** · Electron + React + TypeScript · MIT (see [License](#license))

---

## Status: usable beta, not release-ready

ReverseMind is a working local-first MVP. The core loop — create a workspace, talk to an agent, approve file/Git/shell actions, and inspect the result in panes — works end to end. The production build and the 46-test Playwright suite pass in this checkout.

It is **not** production-ready. The largest gaps are release packaging, MCP integration depth, agent-mode behavior, and general hardening. The table below is the honest completion picture.

| Area | State | Notes |
| --- | --- | --- |
| App shell, window controls, tray, quit behavior | **Working** | Frameless window, custom titlebar, tray on close, keep-running vs quit setting. No single-instance lock. |
| Local state and persistence | **Working** | Debounced, atomic JSON writes to Electron `userData`. No schema migrations. |
| Agents, chats, memory, skills | **Working** | Multiple agents, tabs, search, per-agent memory and skills, saved prompts. |
| Agent runtime | **Working** | Deterministic offline rules by default; streamed OpenAI-compatible or Anthropic calls with native tool use when configured. The model sees every tool result and keeps going (up to 15 rounds per message). Ask is read-only, Plan never runs tools, and Agent can act; Stop aborts the request; Regenerate re-runs the latest answer. Attachments are path references only. |
| Tool calls and approvals | **Working** | File read/write/list, commands, Git status/diff/stage/commit, MCP calls. Ask-first or auto-approve, per-agent and global. Built-in plugins gate their tools. |
| Workspaces and pane layout | **Working** | Local folders and SSH workspaces, persisted per-workspace layouts. Fixed two-column grid; panes are not resizable or draggable. |
| Files and editor | **Working with gaps** | Tree, create, rename, delete (with confirmation), search, reveal, text editor with tabs, autosave, save/revert. The editor is a plain textarea with no syntax highlighting or find/replace. |
| Git review | **Working** | Status, diffs, stage/unstage, discard, commit, history, branch checkout, worktrees. No pull/push/fetch/remotes. Discard asks for confirmation. |
| Terminal and CLI launchers | **Working, host-dependent** | Real PTYs through a Python host. Terminals keep running when you switch views or workspaces and end when the pane is closed. Requires `python3` and a POSIX shell. Launched CLIs (Claude Code, Codex, etc.) must already be installed. |
| Browser threads | **Working** | `<webview>` pane, local `rm://home/` sandbox, history and page reader. Needs webview hardening before shipping. |
| SSH / remote workspaces | **Working, intentionally narrow** | Probe and real SSH terminal. Remote files, Git and agent chat are disabled by design. Use an absolute remote path; `~` is not expanded. |
| Tickets | **Working** | Kanban board, assignment, dispatch to an agent with a pre-filled draft. Dispatch does not auto-send. |
| Routines | **Working while the app is open** | Manual/hourly/daily/weekday schedules, 20-second local poll, every run becomes a chat. No background daemon. |
| Plugins and MCP | **Working** | Built-in gating works. Enabled servers reconnect on start and status follows crashes; stderr is shown on failure. Connected tools are advertised to hosted agents with their schemas, and disabling the server plugin both hides and denies its calls. Tools only; resources and prompts are not supported. |
| Prompts, skills, notifications | **Working** | Prompt library and drawer, per-agent skills, desktop notifications, system sound, in-app chime, notification centre. |
| Usage metering | **Working, estimated** | Per-call token/cost records and charts. Costs use a fixed $3/$15 per-million formula, not provider pricing. No export. |
| Settings | **Working with gaps** | Theme, accent, zoom, autosave, editor presentation, approval, provider, shell, notifications, voice. Default-workspace and reflection-mode settings are stored but not applied; telemetry is a reserved toggle. |
| Packaging and release | **Working, unsigned** | `npm run package` builds a 130 MB AppImage; the unpacked build passes a release smoke suite (`npm run test:packaged`: starts, offline chat, real terminal, bundled MCP server). Not tested on a clean machine. No auto-update or code signing. |
| Automated tests and CI | **Partial** | 46 Playwright tests (including a mock-provider agent loop, streaming, hardening, terminals, panes). CI workflow runs typecheck, build and the suite; there is no ESLint. |

### What is solid

- The offline runtime makes ReverseMind immediately usable without an API key.
- Direct provider calls work with OpenAI-compatible endpoints and Anthropic Messages.
- Ask/Plan/Agent modes and MCP/plugin gating are enforced in the runtime, not just hidden in the UI.
- Workspace filesystem access is root-jailed; tools and commands are explicit and reviewable.
- The app persists everything locally and survives restarts, including pane layouts and chat history.

### Known gaps, roughly in priority order

1. **Release path is only half-proven.** The AppImage builds and its unpacked form passes the smoke suite, but it has not been run on a clean machine, is unsigned, and needs `python3` on the host for terminals.
2. **Editor and file operations are basic.** Wire the existing rename/delete backend to the Files pane; add syntax highlighting, find/replace and a diff viewer that honors the editor font/wrap settings.
3. **Git is review-only.** Add pull/push and remote management if this is meant to replace a terminal Git workflow. Confirm destructive discard.
4. **MCP is tools-only.** Connectors cannot expose MCP resources or prompts, and there is no per-tool allowlist.
5. **Settings that do nothing.** Apply `defaultWorkspaceId` to new chats, implement or remove `reflectionMode`, and remove or clearly label the reserved telemetry switch.
6. **Cost accuracy.** Usage costs are estimates with a fixed formula.
7. **Hardening.** Add tests for the agent parser and routine scheduling, and expand SSH path handling.

---

## Features

### Three ways to work

- **Agent** — a dedicated chat surface per agent, with tabs, conversation search and saved prompts.
- **Code** — a workspace with chat, terminal, editor, files, Git and browser panes.
- **Thread** — one searchable inbox for conversations across all agents.

### Agents

Each agent has a name, color, engine, brief, private memory, notes about you, skills and an approval policy. Skills are injected into the agent context when enabled. Autopilot can auto-run a bounded number of proposed actions per turn; everything beyond that waits for approval.

The **engine** selector distinguishes the built-in ReverseMind runtime from terminal-based CLIs. Selecting a CLI changes the agent header and adds a **Launch** action that opens the real CLI in a terminal pane; it does not change how chat messages are processed.

### Agent runtime

- **Offline (default):** deterministic local rules recognize common intents such as creating a file, running a command, listing files, reading a file, checking Git status/diff and committing. It proposes real tool cards; nothing executes without approval unless auto-approve is enabled.
- **Hosted:** configure a provider in **Settings → Model providers**. The main process streams the endpoint directly and offers the model native tools: read, write, list, run command, Git status/diff/stage/commit and connected MCP tools. Each call appears as a reviewable card; once the batch is approved, denied or auto-run, the results go back to the model and it continues. It stops after 15 tool rounds, when you press Stop, or when it answers without calling a tool. Provider requests give up after two minutes of silence.
- **Modes:** **Ask** allows only read-only tools (read, list, Git status/diff); **Plan** emits a plan and never runs tools; **Agent** may propose any enabled tool. Modes are applied to offline replies and to the hosted system prompt, and tool execution is re-checked against the current mode.
- **Regenerate:** the latest assistant response can be regenerated in place from its preceding user message.
- **Usage:** every call records estimated input/output tokens and a dollar estimate. Offline calls are recorded at $0.

### Workspaces and panes

Create a local folder (optionally initializing Git) or add an SSH host. Code mode gives each workspace a persisted pane layout with:

- **Agent chat** for the selected agent.
- **Terminal** using a real PTY.
- **Editor** with tabs, autosave, save/revert and line numbers.
- **Files** with a tree, create, search and reveal.
- **Git** with changes, history and worktrees.
- **Browser** with a local sandbox page, navigation, history and a page reader.

### Work management

- **Tickets:** backlog → in progress → review → done, with priority, labels, agent and workspace assignment. Dispatch opens a chat with the ticket details pre-filled.
- **Routines:** recurring prompts that create a chat and run while ReverseMind is open.
- **Prompt library:** shared reusable prompts, searchable and taggable, insertable from the drawer, palette or agent view.
- **Skills:** reusable procedures owned by an agent.

### MCP

Add a stdio JSON-RPC server with a command, arguments and environment. ReverseMind performs the MCP handshake, lists tools, and lets you invoke a tool manually from the Test dialog. For hosted agents, tools from connected servers whose plugin is enabled are listed in the system prompt with their server ID, description and JSON schema, and are called through the `mcp_tool` tool. Disabling the server plugin removes those tools and denies their calls. A bundled server at `resources/test-mcp-server.mjs` exposes `echo`, `add` and `reverse` for verification.

### Privacy and notifications

State stays on disk. There is no account, ReverseMind proxy, billing layer, cloud workspace, update endpoint or telemetry sender. Desktop notifications are emitted by Electron when the document is hidden; an optional in-app chime uses the Web Audio API.

---

## Requirements

- **Linux** (the only configured package target)
- **Node.js 20+** and npm (Node 22 LTS recommended)
- **Python 3** with the standard `pty` module, for terminals
- **Git** and **bash**, for Git review and shell actions
- Optional: SSH keys/agent for remote workspaces, and any CLI engines you want to launch (`claude`, `codex`, `gemini`, `opencode`, `aider`, etc.)
- A graphical session for Electron; the E2E suite needs a display

No Python packages, database or external service are required.

## Getting started

```bash
npm install
npm run dev
```

`npm run dev` starts Vite on port 5273 and launches Electron against it. To run a production build:

```bash
npm run build
npm start
```

`npm run build` compiles the React renderer with Vite and bundles the Electron main/preload processes with esbuild into `dist-renderer/` and `dist-electron/`.

### Tests

```bash
npm run test:e2e
```

This builds first, then runs Playwright against Electron. Electron tests seed an isolated `state.json`, temporary workspace and temporary userData directory, so the suite does not touch your real data. Pure runtime checks run in the same suite without launching the app. It requires a graphical display for the Electron tests; in this environment `DISPLAY=:1` was used.

### Packaging

```bash
npm run package        # build + AppImage in release/
npm run test:packaged  # package, then smoke-test release/linux-unpacked
```

Targets a Linux AppImage via `electron-builder`. The AppImage is unsigned and needs `python3` on the host. If it exits immediately on a distribution that restricts unprivileged user namespaces (for example recent Ubuntu), run it with `--no-sandbox` or enable the AppArmor profile for it.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `REVERSEMIND_USERDATA` | Override Electron's `userData` directory (used by E2E). |
| `REVERSEMIND_DEV_URL` | Load a renderer URL instead of the built files. |
| `REVERSEMIND_SHOW_DEVTOOLS` | Set to `1` to open detached DevTools. |
| `REVERSEMIND_PYTHON` | Python executable for the PTY host (default `python3`). |

Provider API keys are not read from the environment; they are entered in Settings and stored in local state.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Renderer (React 19, Vite)                                   │
│  src/App.tsx, views, panes, components, store.tsx           │
│  window.rm context bridge                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ IPC (preload.ts)
┌──────────────────────────▼──────────────────────────────────┐
│ Electron main process (electron/)                           │
│  window/tray/menu · state.json · provider HTTP · MCP stdio   │
│  filesystem (root-jailed) · Git/shell/SSH subprocesses      │
└────────────┬──────────────────────────┬─────────────────────┘
             │                          │
   python/pty-host.py             MCP server processes
   (real PTYs, JSON lines)        (stdio JSON-RPC)
```

### Renderer

- `src/store.tsx` — global state, hydration, debounced persistence, toasts, notifications, chat creation.
- `src/agent.ts` — offline reply generation, tool directive parsing, tool execution, approvals, plugin gating, routine runner.
- `src/views/` — Agent, Code, Thread, Tickets, Routines, Plugins, Skills, Prompts, Usage, Remote, Settings.
- `src/components/panes/` — Terminal, Editor, Files, Git, Browser, Chat.
- `src/types.ts`, `src/defaults.ts` — state schema and defaults.
- `src/plugins.ts` — built-in tool-to-plugin mapping.
- `src/routines.ts` — next-run calculation.

The renderer has no Node access. It uses the typed `window.rm` API exposed by `electron/preload.ts`.

### Main process

- `electron/main.ts` — window, tray, quit behavior, custom `rm://` protocol, IPC registration, provider calls, notifications, zoom.
- `electron/store.ts` — JSON state load/save with defaults and atomic replace.
- `electron/services.ts` — root-jailed file operations, bounded tree/search, Git commands, shell execution, SSH probe.
- `electron/terminal.ts` — manages the Python PTY host and maps terminal IDs to panes.
- `electron/mcp.ts` — MCP lifecycle, JSON-RPC requests, tool calls, disconnect/shutdown.
- `python/pty-host.py` — one process managing multiple PTYs; newline-delimited JSON over stdin/stdout.

### Data and security model

- State lives in `state.json` under Electron `userData` (the exact path is shown in **Settings → General → Local data**). It contains chats, workspaces, provider keys and preferences as JSON (keys encrypted when the OS keyring allows).
- File, Git and shell IPC only accept folders registered in the main process (loaded workspaces plus folders created through the app), and only from the app's own window. Paths are rejected if they leave the workspace lexically or through symlinks. A shell command or terminal can still do anything your user can; approvals are the safeguard.
- Shell and Git commands run as your user inside the workspace. They are dangerous by nature, which is why tool calls are surfaced for approval. Auto-approve intentionally removes that check.
- `contextIsolation` and `sandbox` are on, `nodeIntegration` is off, and the production build has a CSP without inline scripts. The browser pane runs in its own partition with no preload, no popups and no device permissions.
- Provider API keys are encrypted with the OS keyring (`safeStorage`) when a real keyring backend is available; otherwise they stay plaintext in a `0600` file. A single-instance lock prevents two copies sharing one data folder, and an unreadable `state.json` is moved aside as `state.corrupt-*.json` instead of being overwritten.
- MCP servers and CLI engines are arbitrary local processes. Only add commands you trust.
- No state is sent to ReverseMind. Provider requests go directly to the base URL you configure.

### Testing layout

```text
e2e/
  helpers.ts                 isolated app launch (RM_PACKAGED switches to a built app)
  agent-modes.spec.ts        mode policy, Ask/Plan behavior, Regenerate
  agent-loop.spec.ts         mock Anthropic server: tool loop, approvals, denials, streaming, Stop
  provider-stream.spec.ts    SSE parsing for both APIs, history pairing, tool gating
  hardening.spec.ts          path jail, root registry, SSH/ref validation, state recovery, instance lock
  services-perf.spec.ts      bounded async tree/search, process-tree kill, output cap, routines, pricing
  workspace-panes.spec.ts    terminal persistence, file rename/delete, Git discard confirm, MCP reconnect
  plugin-gating.spec.ts      mapping, MCP advertisement/gating, files, browser, task board
  dictation.spec.ts          voice enabled/disabled and auto-send
  notification-chime.spec.ts in-app chime
  quit-behavior.spec.ts      keep-in-tray and quit
  packaged.spec.ts           release smoke tests (skipped unless RM_PACKAGED is set)
playwright.config.ts         serial, one worker, 60s timeout
```

Not covered: live provider endpoints (only mock servers), SSH, the editor, signing and clean-machine installs.

---

## Project layout

```text
electron/          Electron main process, preload, PTY and MCP services
src/               React renderer
  components/      shared UI, chat, modals, panes
  views/           top-level pages
  agent.ts         agent runtime, tools, approvals, routines
  store.tsx        application state and persistence
python/            PTY host
resources/         bundled test MCP server
e2e/               Playwright Electron tests
scripts/           dev launcher and esbuild bundler
dist-renderer/     generated renderer build
dist-electron/     generated main/preload bundles
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server + Electron with hot reload for the renderer. |
| `npm run build` | Build renderer and Electron bundles. |
| `npm start` | Build, then launch Electron. |
| `npm run test:e2e` | Build, then run Playwright. |
| `npm run test:e2e:headed` | Same, with a visible browser window. |
| `npm run package` | Build a Linux AppImage. |
| `npm run test:packaged` | Package, then run the release smoke tests against the unpacked app. |
| `npm run typecheck` | `tsc --noEmit` (also available as `npm run lint`). |

## License

MIT, as declared in `package.json`. A `LICENSE` file is not yet included in the repository.
