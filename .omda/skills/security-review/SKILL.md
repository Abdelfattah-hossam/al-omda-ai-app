# Authorized Security Review Skill

Use only for repositories and systems the user owns or has explicit permission to assess.

1. Identify the authorized scope, assets, authentication roles, trust boundaries, and sensitive data.
2. Review authentication, authorization, tenant isolation, input validation, output encoding, file handling, secrets, SSRF, injection, dependency risks, and logging.
3. Prefer static analysis and source tracing before active requests.
4. Active HTTP inspection is limited to exact HTTPS hostnames in the local runtime allowlist. Do not scan unrelated hosts, private networks, or third-party infrastructure.
5. For each finding, state impact, preconditions, evidence, severity rationale, and a practical fix.
6. Do not claim a vulnerability is exploitable without evidence. Do not expose credentials or real user data.
7. File changes, terminal commands, and MCP actions require user approval.
