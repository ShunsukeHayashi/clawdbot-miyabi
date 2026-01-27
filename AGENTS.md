# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

**ALL responses, comments, and documentation in Japanese (日本語).**

## Repository Guidelines
- Repo: https://github.com/moltbot/moltbot
- GitHub issues/comments/PR comments: use literal multiline strings or `-F - <<'EOF'` (or $'...') for real newlines; never embed "\\n".

## Project Structure & Module Organization

### Core Directories

- **Source code**: `src/` (CLI wiring in `src/cli`, commands in `src/commands`, web provider in `src/provider-web.ts`, infra in `src/infra`, media pipeline in `src/media`)
- **Tests**: colocated `*.test.ts`
- **Docs**: `docs/` (images, queue, Pi config). Built output lives in `dist/`
- **Plugins/extensions**: live under `extensions/*` (workspace packages). Keep plugin-only deps in the extension `package.json`; do not add them to the root `package.json` unless core uses them.

### Entry Points

- `src/entry.ts` - Main CLI entry point (shebang, respawn, profile handling)
- `src/index.ts` - Main program exports and CLI initialization
- `src/cli/program.ts` - Commander.js CLI program builder

### Key Architectural Components

- **CLI Layer** (`src/cli/`): Command parsing, options handling, TTY UI
- **Commands** (`src/commands/`): Business logic for CLI commands (agent, config, models, etc.)
- **Gateway** (`src/gateway/`): WebSocket server for multi-device communication
- **Channels** (`src/channels/`): Messaging platform integrations (Discord, Slack, Telegram, etc.)
- **Agents** (`src/agents/`): AI agent execution (Pi AI integration, tool execution)
- **Routing** (`src/routing/`): Message routing and session key management
- **ACP** (`src/acp/`): Agent Client Protocol implementation
- **Config** (`src/config/`): Configuration loading and session management
- **Media** (`src/media/`): Media processing pipeline
- **Memory** (`src/memory/`): Vector memory with LanceDB/SQLite-vec
- **Extensions** (`extensions/`): 25+ channel and provider plugins

### Extension System

Each extension is a workspace package with its own `package.json`. Plugin discovery:
- `src/channels/plugins/index.ts` - Plugin loader
- `src/channels/plugins/load.ts` - Dynamic import resolution
- Channel plugins: Discord, Slack, Telegram, Signal, WhatsApp, iMessage, Matrix, etc.
- Provider plugins: Copilot Proxy, Google Gemini, OpenAI, etc.

### Workers (External Services)

- `workers/ppal-aws/` - AWS Lambda functions (e.g., Discord handler)
- Each worker has its own package.json and build process

## Build, Test, and Development Commands

### Runtime Baseline

- Node **22+** (keep Node + Bun paths working)
- pnpm package manager (pnpm@10.23.0)

### Development

```bash
# Install deps
pnpm install

# Run CLI in dev (hot reload via tsx)
pnpm dev
# or
pnpm moltbot ...

# Build TypeScript
pnpm build

# Watch mode for gateway
pnpm gateway:watch

# Gateway dev mode (skip channels)
pnpm gateway:dev
```

### Code Quality

```bash
# Lint (oxlint - type-aware linting)
pnpm lint

# Format (oxfmt - check)
pnpm format
pnpm format:fix  # write

# Pre-commit hooks
prek install  # runs same checks as CI
```

### Testing

```bash
# Unit tests (vitest)
pnpm test

# Watch mode
pnpm test:watch

# Coverage (V8, 70% thresholds)
pnpm test:coverage

# E2E tests
pnpm test:e2e

# Live tests (requires API keys)
CLAWDBOT_LIVE_TEST=1 pnpm test:live
# or
pnpm test:docker:live-models
pnpm test:docker:live-gateway
pnpm test:docker:all
```

### macOS App

```bash
# Package app
pnpm mac:package

# Restart gateway
pnpm mac:restart
```

## Coding Style & Naming Conventions

- **Language**: TypeScript (ESM). Prefer strict typing; avoid `any`
- **Formatting/linting**: Oxlint and Oxfmt
- **Naming**: use **Moltbot** for product/app/docs headings; use `moltbot` for CLI command, package/binary, paths, and config keys
- **Testing**: Match source names with `*.test.ts`; e2e in `*.e2e.test.ts`
- **File LOC guideline**: Aim for files under ~700 LOC (split/refactor when needed for clarity)

## Key Dependencies

- **@whiskeysockets/baileys**: WhatsApp Web integration
- **discord-api-types**: Discord type definitions
- **@mariozechner/pi-***: Pi AI agent framework
- **@agentclientprotocol/sdk**: ACP protocol
- **grammy**: Telegram Bot API framework
- **@slack/bolt**: Slack framework
- **hono**: HTTP framework
- **vitest**: Testing framework
- **zod**: Schema validation

## Configuration & Environment

- **Config loading**: `src/config/config.ts`
- **Sessions**: `~/.clawdbot/sessions/` (base directory not configurable)
- **Web provider credentials**: `~/.clawdbot/credentials/`
- **Environment variables**: See `~/.profile`

## Release Channels (Naming)

- **stable**: tagged releases only (e.g. `vYYYY.M.D`), npm dist-tag `latest`
- **beta**: prerelease tags `vYYYY.M.D-beta.N`, npm dist-tag `beta`
- **dev**: moving head on `main` (no tag; git checkout main)

## Messaging Channels

Always consider **all** built-in + extension channels when refactoring shared logic (routing, allowlists, pairing, command gating, onboarding, docs):
- Core channels: Discord, Slack, Signal, Telegram, WhatsApp, iMessage, Web
- Extensions: Matrix, MS Teams, Line, Twitch, Nostr, etc.

## Important Guardrails

- **Never edit node_modules** (global/Homebrew/npm/git installs too)
- **Any dependency with pnpm.patchedDependencies must use an exact version** (no `^`/`~`)
- **Patching dependencies requires explicit approval**
- **Tool schema guardrails**: avoid `Type.Union`; use `stringEnum`/`optionalStringEnum`
- **Avoid raw `format` property names in tool schemas** (reserved keyword)

## Multi-Agent Safety

- **Do NOT create/apply/drop git stash entries** unless explicitly requested
- **When user says "push"**: may `git pull --rebase` to integrate
- **When user says "commit"**: scope to your changes only
- **Do NOT switch branches** unless explicitly requested
- **Do NOT create/remove/modify git worktree checkouts**
- **Multiple agents running in parallel is OK** (each with own session)
- **Focus reports on your edits**; avoid guard-rail disclaimers unless blocked
