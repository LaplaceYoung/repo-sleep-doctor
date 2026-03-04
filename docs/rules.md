# Rule Reference

This document explains the built-in rules currently emitted by Repo Sleep Doctor.

## Presets

- `all`: all rules in this document
- `release`: release-readiness and quality focused subset
- `security`: secret exposure and merge-risk focused subset

## merge-marker

- Severity: `p0`
- Detects unresolved Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
- Fix: resolve the merge conflict and remove markers.

## private-key-block

- Severity: `p0`
- Detects private key blocks in text files.
- Fix: rotate secrets and remove committed key material.

## aws-key

- Severity: `p0`
- Detects likely AWS access key IDs in source files.
- Fix: rotate keys and migrate to secure secret management.

## generic-secret

- Severity: `p0`
- Detects suspicious hardcoded secret-like assignments.
- Fix: move credentials to environment or vault.

## console-call

- Severity: `p1`
- Detects `console.log/debug/info/warn` in code.
- Fix: remove debug output or guard behind explicit debug flags.

## debugger

- Severity: `p1`
- Detects standalone `debugger` statements.
- Fix: remove debugger statements before release.

## print-call

- Severity: `p1`
- Detects likely debug `print(...)` calls.
- Fix: remove debug print lines or gate them in debug-only paths.

## todo-comment

- Severity: `p2`
- Detects TODO/FIXME/HACK markers in comment-like lines.
- Fix: link to tracked issues or close before release.

## large-file

- Severity: `p1`
- Detects files above configured size threshold.
- Fix: move large assets to artifact storage or add explicit ignore policy.

## missing-readme

- Severity: `p1`
- Detects missing root `README.md`.
- Fix: add project overview, install, and usage guidance.

## readme-install

- Severity: `p2`
- Detects missing installation section in README.
- Fix: add exact setup commands.

## readme-usage

- Severity: `p2`
- Detects missing usage section in README.
- Fix: add executable examples.

## missing-build-script

- Severity: `p2`
- Detects missing `scripts.build` in `package.json`.
- Fix: add deterministic build command.

## missing-test-script

- Severity: `p1`
- Detects missing `scripts.test` in `package.json`.
- Fix: add project test entry command.

## missing-lint-script

- Severity: `p2`
- Detects missing `scripts.lint` in `package.json`.
- Fix: add lint command used by CI.

## invalid-package-json

- Severity: `p1`
- Detects non-parseable root `package.json`.
- Fix: correct JSON syntax.

## missing-tests

- Severity: `p1` or `p2` (depends on code volume)
- Detects repository code with no test files found.
- Fix: add at least smoke tests before release.
