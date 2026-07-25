---
name: lithe-tool
description: Manage the current Lithe project, workspace, task, and Coding Agent session.
---

# Lithe Tool

Use the globally available `lithe-tool` command when working inside Lithe.
Every command returns one JSON object on stdout. Check `ok` before using `data`.

Start by running `lithe-tool context` to obtain stable project, workspace, and
task IDs. Calls from a normal terminal must pass the explicit IDs requested by
each command. Calls from a Lithe-launched Agent are restricted to its injected
capability.

After a new provider conversation starts, bind its opaque provider ID:

- Codex: read `CODEX_THREAD_ID`.
- Claude Code: read `CLAUDE_CODE_SESSION_ID`.
- Run `lithe-tool agent bind --session-id <id>`.
- If the variable is absent, report an incompatible CLI version. Do not inspect
  history folders, parse terminal output, or guess an ID.

Available task commands:

- `lithe-tool task create --workspace-id <id> --name <name>`
- `lithe-tool task rename --task-id <id> --name <name>`

Available Agent commands:

- `lithe-tool agent bind --session-id <id>`
- `lithe-tool agent start --task-id <id>`
- `lithe-tool agent resume --task-id <id>`
- `lithe-tool agent stop --task-id <id>`
- `lithe-tool agent fork --task-id <id>`

Run `lithe-tool --help` for the complete command list installed by this Lithe
version. Never request a destructive operation unless the user clearly asked
for it. A UI approval request is not approval; wait for Lithe to return success.
