# Session delete plugin

Adds a “Permanently delete session” action to the Web sidebar menu. Sessions opened during the current Harness run are refused with an explicit reason; restart Harness before deleting them. A deleted JSONL session directory is removed permanently; local image objects are removed only when no remaining session references them.

This is a standalone DSH Profile bundle: installing it automatically mounts its
Cordis configuration layer.

```bash
dsh plugin --profile web add @deepseek-ai/dsh-client-ui-session-delete
```

A tarball built from this repository can also be used for local or offline
installation. Restart the Profile after installing or updating it. The modified
Web Profile in this repository enables the plugin by default.

## Model Experience

This is a human-facing sidebar action and does not add a model tool.
