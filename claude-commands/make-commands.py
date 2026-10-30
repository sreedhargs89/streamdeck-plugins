#!/usr/bin/env python3
"""Turn the Stream Deck / Sree Deck prompt files into Claude Code slash commands.

Reads ~/.claude/prompts/*.txt and ~/.claude/prompts/itops/*.txt (one prompt per file) and writes
~/.claude/commands/<name>.md, so the same prompt works as a deck key, as /<name> in any Claude Code tab,
and by voice through a Wispr Flow snippet ("slash reply" -> "/reply "). Anything typed after the command
is passed in as $ARGUMENTS (the mail subject, user, ticket…). Re-run after editing a prompt.
    python3 make-commands.py
"""
import os, re

PROMPTS = os.path.expanduser("~/.claude/prompts")
OUT = os.path.expanduser("~/.claude/commands")
# prompt file -> (command name, one-line description)
NAMES = {
    "1-reply-to-thread": ("reply", "Reply-all draft to the mail thread in simple words (never sends)"),
    "2-ticket-it": ("ticket", "Create or update the Wrike ticket for this work"),
    "3-open-in-chrome": ("chrome", "Open the last thing produced (draft, ticket, page) in Chrome"),
    "itops/read-mail": ("readmail", "Read a mail thread and tell me who/what/decided/open/next"),
    "itops/reply-simple": ("replysimple", "Reply-all draft written the way I write"),
    "itops/make-simpler": ("simpler", "Rewrite the last draft simpler and more human"),
    "itops/check-replies": ("replies", "Check the thread for new replies and what they need"),
    "itops/comment-ticket": ("comment", "Add a short comment to the Wrike ticket"),
    "itops/find-ticket": ("findticket", "Find the Wrike ticket (search before creating)"),
    "itops/open-chrome": ("open", "Open what we were working on in Chrome"),
    "itops/double-check": ("check", "Double check facts, names, dates, links before I send"),
    "itops/status": ("status", "Status of this work and anything pending from me"),
    "itops/user-access": ("useraccess", "Check a user end to end (Entra, MFA, groups, licences)"),
    "itops/licence": ("licence", "Check and suggest licence changes for a user"),
    "itops/device": ("device", "Check a device in Intune"),
    "itops/cost": ("cost", "This month's Azure and AWS cost and top spenders"),
    "itops/dashboard": ("dashboard", "Update and open the IT Ops dashboard"),
}

os.makedirs(OUT, exist_ok=True)
made = []
for src, (name, desc) in NAMES.items():
    path = os.path.join(PROMPTS, f"{src}.txt")
    if not os.path.exists(path):
        continue
    prompt = open(path).read().strip()
    prompt = re.sub(r"(Mail subject or sender|Mail thread|Thread|Ticket or topic|About|Topic|User and the app or error they reported|User|Device name or user|Focus on):\s*$", "", prompt).rstrip()
    body = f"---\ndescription: {desc}\nargument-hint: [mail, user, ticket or topic]\n---\n{prompt}\n\nContext from me: $ARGUMENTS\n"
    open(os.path.join(OUT, f"{name}.md"), "w").write(body)
    made.append(name)
print("commands:", " ".join(f"/{n}" for n in made))
