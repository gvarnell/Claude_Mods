# all-prompts

A Claude Code mod that adds a column on the right of the screen listing your
prompts from **every** Claude Code session, newest first, grouped under the
session each was typed in. Handy when you have a dozen sessions open and can't
remember which one you asked something in.

## Install

Type this at the prompt of a Claude Code terminal session:

```
/plugin install all-prompts --marketplace OWNER/REPO
```

Answer `y` to add the marketplace, then press Enter to install it at the user
scope. It runs in that session right away, and in every session you start after.

## Use

- **`/prompts`** shows or hides the column (`/prompts show` and `/prompts hide`
  set it directly). The **`[hide]`** button in the column hides it as well.
  Hidden stays hidden in new sessions until you show it again.
- Prompts are grouped by session name: **●** session still open, **○** ended.
  Your current session is marked "(this session)".
- **Click a prompt** to see its full text, time and folder, with buttons to
  **Copy prompt** and **Copy resume cmd** (`cd <folder> && claude --resume <id>`).
- **Filter box** matches prompt text or session name.
- **`[/cmds hidden]`** toggles whether slash commands (`/clear`, `/mcp`, ...)
  are listed.

The column docks on the right in Claude Code's fullscreen layout
(`"tui": "fullscreen"` in settings). It opens by itself only on a terminal at
least 144 columns wide; `/prompts` opens it at any width. On the main-screen
layout it opens above the prompt instead.

## How it works

Claude Code already appends every prompt, from every session, to
`~/.claude/history.jsonl`, and each open session keeps a small file in
`~/.claude/sessions/` with its name. The mod reads both every 3 seconds, so
other sessions don't need anything installed for their prompts to show up. It
reads only the last 2,000 prompts. Prompts from before a `/clear` keep their
terminal's name, marked "(pre-clear)".

Everything stays on your machine: the mod reads those two places and writes
nothing but its own small store (session names, and whether the column is
hidden).

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
