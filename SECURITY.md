# Security policy

This is an early community release. Security fixes target the latest version; there is no response-time guarantee.

Please report vulnerabilities privately using [GitHub's vulnerability form](https://github.com/liangshaobo2001/codex-lemma/security/advisories/new) if it is available. If private reporting is unavailable, contact the maintainer through a contact method on their [GitHub profile](https://github.com/liangshaobo2001). Do not include exploit details, tokens, or private workspace content in a public issue.

The app runs an agent with access to your workspace and a loopback backend. Use appropriate Codex approval/sandbox settings, review requested commands, and do not expose the backend port to a network. Provider keys in configuration are plaintext. See [privacy](docs/PRIVACY.md).
