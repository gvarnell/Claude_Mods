# prompt-jump

A Claude Code mod that jumps the transcript to your previous or next prompt,
so you can step back through a long session one prompt at a time.

## Install

Type this at the prompt of a Claude Code terminal session:

```
/plugin install prompt-jump --marketplace gvarnell/Claude_Mods
```

Then add the keys. Mac Terminal doesn't pass option+↑ / option+↓ through to
Claude Code (it sends a plain ↑, which scrolls your input history instead), so
the mod uses **option+k** and **option+j**. Add them to `~/.claude/keybindings.json`
(create the file if you don't have one; if you do, merge the `Global` entry in):

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "bindings": [
    {
      "context": "Global",
      "bindings": {
        "meta+k": "app:diffFileListUp",
        "meta+j": "app:diffFileListDown"
      }
    }
  ]
}
```

In Mac Terminal this needs **Use Option as Meta key** turned on (Settings →
Profiles → Keyboard). iTerm2: set the Option key to **Esc+**.

## Use

- **option+k**: scroll up to your previous prompt.
- **option+j**: scroll forward to your next one; past your newest it stops.
- A line above the prompt shows where you are and that prompt, e.g.
  `4/9 Can we package up this plugin…`. You can click its **↑** and **↓** too.
- Typing a new prompt resets it, so the next option+k starts from your latest.
- It covers the current session, back to its last `/clear`.

Without the keybindings, option+↑ / option+↓ and ctrl+↑ / ctrl+↓ are the
built-in keys for the same action, if your terminal sends them (macOS uses
ctrl+↑ / ctrl+↓ for Mission Control unless you turn that off). While the diff
panel is open, these keys belong to it.

## How it works

On each press the mod reads the session's transcript file under
`~/.claude/projects/` to find your typed prompts in order, then asks Claude
Code to scroll that prompt's row to the top of the screen. Claude Code only
allows that in response to your own key press or click.
