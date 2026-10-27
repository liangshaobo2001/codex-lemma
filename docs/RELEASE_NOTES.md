Codex Lemma v0.1.16 adds clipboard attachments and fixes image tool compatibility for DeepSeek on OpenCode Go.

- Paste screenshots or image files into the composer and preview them before sending. Unsent image drafts stay with their chat. On Windows, files copied in Explorer can also be pasted as local file references.
- Clipboard contents that need staging are saved locally, with a 32 MiB limit per transferred file. Ordinary text paste still works. Files are passed as file references rather than automatically parsed.
- Fix HTTP 400 after an image tool result with `original` detail on OpenCode Go DeepSeek v4.1 Flash. The compatibility conversion applies to new requests and replayed history without modifying the stored image or session.
- Provider errors can now include a bounded, sanitized explanation. Clipboard behavior and provider compatibility have regression tests; the Windows desktop clipboard still needs real-device acceptance.

The Windows x64 installer includes Codex CLI 0.163.0, license notices, checksums, and a version-bound updater signature. The executable is not Authenticode-signed. Check for updates manually in Settings → General, or download the installer below.
