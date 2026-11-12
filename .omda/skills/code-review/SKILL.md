# Code Review Skill

Use this workflow when asked to inspect a repository or review a change.

1. Map the project entry points, runtime boundaries, package scripts, and test commands before drawing conclusions.
2. Trace the full execution path for the affected behavior, including API validation, authorization, persistence, and UI state.
3. Prioritize correctness, security, data loss, concurrency, compatibility, and user-visible regressions.
4. Cite exact file paths and line ranges in findings. Separate confirmed bugs from risks and suggestions.
5. Do not edit files or run terminal commands until the user approves the exact proposed actions.
6. After approved changes, run focused tests first, then the project's typecheck/build commands.
7. Report commands that were not run and behaviors that could not be verified.
