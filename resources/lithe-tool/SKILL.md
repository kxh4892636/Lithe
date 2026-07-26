---
name: lithe-tool
description: Manage the current Lithe project, workspace, task, and Coding Agent session.
---

# Lithe Tool

Use the globally available `lithe-tool` command when working inside Lithe.
Every command returns one JSON object on stdout. Check `ok` before using `data`.

## Installed and development Lithe

The default `lithe-tool` discovery file belongs to the installed Lithe. An Agent
launched by `pnpm run dev` receives the development discovery path
automatically, so use `lithe-tool` normally inside that Agent and never replace
its injected `LITHE_CONTROL_DISCOVERY_PATH`.

From a normal PowerShell terminal, explicitly select the running development
Lithe, then remove the override before returning to the installed Lithe:

```powershell
$env:LITHE_CONTROL_DISCOVERY_PATH = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.lithe-development\control.json'
lithe-tool context
Remove-Item Env:LITHE_CONTROL_DISCOVERY_PATH
```

On macOS or Linux, scope the override to one command:

```sh
LITHE_CONTROL_DISCOVERY_PATH="$HOME/.lithe-development/control.json" lithe-tool context
```

To exercise the CLI implementation from the current repository instead of the
globally installed CLI, build it and run the generated entry with the same
development discovery override:

```powershell
pnpm run build:cli
$env:LITHE_CONTROL_DISCOVERY_PATH = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.lithe-development\control.json'
node packages/lithe-tool/dist/index.cjs context
Remove-Item Env:LITHE_CONTROL_DISCOVERY_PATH
```

The development Lithe must be running before these external-terminal commands.
Without the override, `lithe-tool` continues to target the installed Lithe.

Start by running `lithe-tool context` to obtain stable project, workspace, and
task IDs. Calls from a normal terminal must pass the explicit IDs requested by
each command. Calls from a Lithe-launched Agent are restricted to its injected
capability.

After a new provider conversation starts, determine its opaque provider session
ID using that Coding Agent's own supported mechanism, then run
`lithe-tool agent bind --session-id <id>`. Lithe does not manage provider
history or infer that ID.

Available task commands:

- `lithe-tool task create --workspace-id <id> --name <name>`
- `lithe-tool task create --name <name>` (create a managed temporary workspace)
- `lithe-tool task rename --task-id <id> --name <name>`
- `lithe-tool task unread [--task-id <id>]`
- `lithe-tool task running [--task-id <id>] [--instance-id <id>]`
- `lithe-tool task idle [--task-id <id>] [--instance-id <id>]`
- `lithe-tool task archive [--task-id <id>]`
- `lithe-tool task delete [--task-id <id>]`

Inside a Lithe Agent, state commands target the current task and the running
marker is isolated to the current Agent instance. A normal external terminal
must supply `--task-id`; `running` and `idle` also require a stable
`--instance-id`. Running tasks cannot be archived. Delete waits up to three
minutes for explicit UI approval.

Available Agent commands:

- `lithe-tool agent bind --session-id <id>`
- `lithe-tool agent start --task-id <id>`
- `lithe-tool agent resume --task-id <id>`
- `lithe-tool agent stop --task-id <id>`
- `lithe-tool agent fork --task-id <id>`

Run `lithe-tool --help` for the complete command list installed by this Lithe
version. Never request a destructive operation unless the user clearly asked
for it. A UI approval request is not approval; wait for Lithe to return success.
