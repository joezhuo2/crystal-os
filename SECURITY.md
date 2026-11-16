# Security Policy

## Supported versions

Only the latest release gets security fixes. Update to the newest version from the [releases page](https://github.com/joezhuo2/crystal-os/releases) before you report a problem.

## Report a vulnerability

Do not open a public issue for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**, or go to <https://github.com/joezhuo2/crystal-os/security/advisories/new>.

Include:

- the version of Crystal OS and your operating system,
- the steps to reproduce the problem,
- what an attacker could read or change.

You can expect a first reply within 7 days. If the report is confirmed, a fix is released as soon as it is ready and you are credited in the release notes, unless you ask not to be.

## Scope

Crystal OS runs on your own computer. Reports about these areas are the most useful:

- the local API (the sidecar) answering a request that does not carry its access token, or a request from another origin,
- reading or writing files outside the Obsidian vault or the app's data folder,
- secrets (`.env.local`, API keys, OAuth tokens) leaking into logs, the bundle, or a web page opened in The Portal,
- code execution through a note, an email, a calendar event, or a web page shown in the app,
- the auto-updater accepting an unsigned or tampered update.

Out of scope: problems that need an attacker who already controls your Windows account, and vulnerabilities in third-party services (Google, your AI provider) themselves.

## Your data

Tasks, transactions, habits, focus sessions and trades are stored as files on your device. Keys you enter are stored in `.env.local` on your device. Nothing is sent to the project's maintainers.
