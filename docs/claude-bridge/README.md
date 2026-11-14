# Claude → ChatGPT bridge for AL OMDA

This folder is a documentation-only handoff area. Nothing here is part of the app runtime, and changes here must never modify or deploy the application.

## Goal

Make the decisions and the two independent Claude designs readable from the existing GitHub repository:

1. Main application/interface design.
2. Chat design.

Keep those designs separate. Do not merge them into one design and do not reinterpret either design.

## What to export from Claude

Create these files in this folder:

- `conversation-summary.md`: concise but complete project context, requirements, decisions, rejected ideas, and unresolved questions from the relevant Claude conversation. Preserve exact constraints and distinguish confirmed decisions from suggestions.
- `main-interface-spec.md`: the main application interface only. Include layout, components, dimensions/responsiveness where known, colors, typography, states, interactions, and exact source/code if available.
- `chat-interface-spec.md`: the chat interface only. Include layout, message styles, composer, controls, scrolling behavior, responsive behavior, states, and exact source/code if available.
- `assets/`: original design assets or screenshots, if Claude can export them without changing them.

## Hard constraints

- Documentation and design handoff only. Do not edit app source files, configuration, dependencies, deployment workflows, or database files.
- Do not publish or deploy anything.
- Do not invent missing details. Mark unknowns as `غير محدد` / `not specified`.
- Preserve the original designs exactly; do not add glass effects, themes, animations, or other visual ideas unless they are explicitly present in the source design.
- Keep the main interface and chat interface as two separate deliverables.
- If you cannot write directly to this GitHub repository, return the complete contents of the four requested files and state clearly that no repository files were changed.

## Handoff prompt for Claude

Read the full relevant conversation and the two design artifacts. Prepare the files listed above in `docs/claude-bridge/` in this repository if GitHub repository editing is available. Otherwise provide the complete file contents. Do not touch the application code.