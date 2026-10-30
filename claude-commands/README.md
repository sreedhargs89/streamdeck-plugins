# Claude slash commands from the deck prompts

`python3 make-commands.py` turns the prompt files in `~/.claude/prompts/` (the same ones the Stream Deck / Sree Deck keys
paste) into Claude Code commands in `~/.claude/commands/` — `/reply`, `/ticket`, `/chrome`, `/check`, `/status`, … —
with anything typed after the command passed in as context. Re-run after editing a prompt. The prompts themselves stay
local (they're work-specific); only this generator is in the repo. Pair with Wispr Flow snippets ("slash reply" → `/reply `)
to run them by voice.
