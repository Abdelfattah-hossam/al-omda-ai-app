# Security Policy

## Supported development line

Security fixes are applied to the latest code on the `main` branch.

## Reporting a vulnerability

Do not publish exploitable details, credentials, private customer data, or a working exploit in a public issue. Use GitHub's private vulnerability reporting for this repository when it is enabled. If private reporting is unavailable, contact the repository maintainer privately before disclosing details.

Include the affected component, impact, reproduction steps, and a suggested mitigation when possible. Do not include real secrets or data belonging to other people.

## Authorized security testing

AL OMDA AI security-research tools are intended for systems you own or have explicit written permission to test. Configure exact target hostnames in `OMDA_AGENT_ALLOWED_HOSTS`. Do not use the project to access, disrupt, persist in, or exfiltrate data from systems without authorization.

The local agent runtime binds to loopback by default. Do not expose it to a public network. Terminal execution is disabled by default; enabling host execution runs project commands with the operating-system permissions of the account that launched the runtime. Use a disposable development account or isolated VM for untrusted repositories.
