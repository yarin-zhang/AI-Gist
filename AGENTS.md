# AI Gist agent instructions

Before creating or changing any desktop or desktop-Web interface under `src/renderer`, read and follow [`docs/AI_UI_DESIGN_PROMPT.md`](docs/AI_UI_DESIGN_PROMPT.md).

The design prompt is a required implementation contract. New UI must use the canonical design tokens and the bordered, tinted-surface design language defined there. Do not add local theme systems or revive deprecated variables.

Ionic mobile pages retain native mobile structure; apply only the shared token rules unless the task explicitly requests a mobile redesign.

> Desktop UI contributions must follow [AI_UI_DESIGN_PROMPT.md](docs/AI_UI_DESIGN_PROMPT.md).

## Local CLI for prompt data

AI Gist's data lives only inside the running desktop app (Electron renderer's IndexedDB). To create, read, update, fill, or "挖空" (add `{{variable}}` placeholders to) prompts and categories from a terminal or from an agent session, use the bundled CLI instead of touching IndexedDB directly — there is no other supported way to reach this data from outside the app process:

```bash
node bin/ai-gist.js --help
```

The CLI talks to a running copy of AI Gist over a local, token-authenticated loopback connection that is off by default; the user must enable it once in Settings → Local CLI. Run `node bin/ai-gist.js status` first to confirm connectivity, then `node bin/ai-gist.js --help` (and `... <command> --help`) for the full command reference — that help text, not this file, is the source of truth for available commands and flags.

## 版本号

版本信息只在 `package.json` 的 `version` 和 `buildRevision` 里手写（读作 `2.1.1 (1)`），各平台的构建号从这两个字段推导，改完后运行 `yarn version:sync` 同步到原生工程。规则见 [`docs/versioning.md`](docs/versioning.md)，不要手改 `build.gradle` 或 `project.pbxproj` 里的版本字段。
