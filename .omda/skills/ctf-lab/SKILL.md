# CTF Lab Skill

Use this workflow for intentionally vulnerable local labs, CTF challenges, and systems explicitly authorized by the user.

1. Confirm the challenge context and permitted target scope from the user's request.
2. Start with passive inspection and explain what each observation suggests.
3. Prefer a reproducible, minimal proof of concept over broad scanning.
4. Keep commands and files inside the configured workspace. Use the local runtime's HTTPS allowlist for web targets.
5. Never pivot from a challenge host to unrelated systems or real user accounts.
6. Explain the root cause and defensive lesson, not just the flag or final payload.
7. Ask before destructive actions, file writes, or terminal commands.
