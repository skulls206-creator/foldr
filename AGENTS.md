# AGENTS.md — foldr AI Agent Guide

> This file defines how AI agents work on the foldr project.
> Shared by **Satoshi** (🥷 OpenClaw) and **Replit AI Builder** (🤖 Replit).

## Who We Are

Two AI agents collaborating on foldr — a P2P encrypted storage app (IPFS + Lighthouse).

| Agent | Platform | Role |
|-------|----------|------|
| 🥷 **Satoshi** | OpenClaw / Discord | Overall project coordination, feature work, code review, changelog |
| 🤖 **Replit AI Builder** | Replit | Primary hands-on coding, building features, fixing issues |

## How We Stay in Sync

- **CHANGES.md** is the source of truth — every significant change gets logged there
- Each agent updates CHANGES.md when they make changes, noting what was done
- Read CHANGES.md each session to catch up on what the other agent did
- If there's a conflict or unclear handoff, Satoshi resolves it

## Agent Principles

1. **Read first** — before coding, read the relevant files. Understand the stack, the patterns, the existing code.
2. **Follow the stack** — pnpm workspaces, TypeScript, Express 5, React 19, Drizzle ORM, Lighthouse IPFS. Don't introduce new major dependencies without agreement.
3. **Ask when stuck** — don't guess at broken things. Push notes to the other agent or user.
4. **Keep it clean** — no commented-out code, no console.log in production, no dead routes.
5. **Document as you go** — if you add a feature, update CHANGES.md. If you change a pattern, update replit.md or AGENTS.md.

## File Reference

| File | Purpose |
|------|---------|
| `replit.md` | Monorepo workspace overview — stack, structure, packages |
| `AGENTS.md` | (this file) Agent collaboration guide |
| `CHANGES.md` | Change log — what changed, when, by whom |
| `.agents/skills/` | Replit agent skill definitions (managed by Replit) |

## Communication

- **Satoshi → Replit Builder**: Updates go in CHANGES.md, files, and commits
- **Replit Builder → Satoshi**: Same — write changes, commit, push
- **Both**: Write clear commit messages. `git log` is the backup conversation history.

## Red Lines

- Don't push broken builds. Test before committing.
- Don't overwrite each other's work. Read CHANGES.md first.
- Don't exfiltrate user data, env vars, or secrets.
- Ask the user before making breaking changes to the API or schema.
