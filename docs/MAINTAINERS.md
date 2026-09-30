# Maintainer runbook

This runbook complements [GOVERNANCE](../GOVERNANCE.md), [CONTRIBUTING](../CONTRIBUTING.md) and [RELEASING](RELEASING.md). It describes the intended process, not settings that have already been enabled.

## Triage and review

For a report, confirm the release/commit, browser, deployment mode and a minimal fictional example. Identify whether it is a defect, support request, accessibility issue, proposed feature or private security concern. Search existing issues before duplicating work. Do not close reports solely because they are old; record a reason when closing, deferring or requesting missing evidence.

Before accepting a PR, inspect the diff, its upstream base, generated files and dependency changes. Verify the latest head SHA, not an older green check. Require an explicit list of tested and untested cases. UI changes need a real-browser check where possible; data changes need migration/rejection and rollback tests. AI features need cancellation, validation, failure, budget and application-boundary tests with fictional data. Plan dependencies cannot be bypassed by selective application.

Use these gates in sequence:

```bash
npm ci
npm run doctor
npm run check
npm run security:report
```

`check` includes maintenance-script tests, repository hygiene, release-metadata tests, TypeScript, lint, Vitest and production build. Browser workflows remain separate. `security:report` writes full and production-scope npm audit evidence to `artifacts/dependency-audit/`; high or critical findings in either scope block the check. Lower severities remain visible and require triage. A failed registry request or malformed report is an error, not a clean audit.

## Dependency changes

Keep `package.json` and `package-lock.json` consistent. Compare advisory ranges against the locked version and actual use; distinguish development tooling from shipped runtime dependencies. Prefer the smallest compatible update. Never run `npm audit fix --force` as an unattended maintenance policy. Re-run install, full checks and affected browser paths after lockfile changes.

The 2026-09-30 repair in commit `59258ceb327a7ca6280870f4223e32690da96c16` updates the Vitest 4.1.11 family and affected transitive development packages. The audit for maintenance commit `d4e897bf05731073cc9d868d5f723072876fae76` reported zero findings in both scopes at that time. It is historical evidence, not a permanent zero-vulnerability promise. Reference: [audit run](https://github.com/Xhhemoing/cengfan-map-studio/actions/runs/36688054638), [tracking issue #67](https://github.com/Xhhemoing/cengfan-map-studio/issues/67).

Temporary lockfile repair workflows with write permission must not remain in the branch. Routine PR verification uses read-only permissions and does not publish artifacts as releases. Actions are pinned to reviewed commit SHAs, with Dependabot proposing updates. Pinning direct actions does not audit their transitive behavior or every downloaded dependency.

## Repository settings: verify manually

The file-based baseline cannot enable administration settings. Before treating the repository as protected, verify in GitHub Settings:

- A main-branch rule requires PRs, the intended checks and resolution of review conversations; prevent force pushes and deletion. Select actual workflow check names after they exist, and ensure path-filtered checks are not required on unrelated PRs. Choose reviewer requirements appropriate to the number of maintainers; do not make a single-maintainer repository permanently unmergeable.
- Enable private vulnerability reporting and test the documented reporting entry point. Enable available dependency alerts, secret scanning and push protection, reviewing their plan/permission prerequisites. Do not invent a private security email.
- Confirm minimal Actions token permissions and which actions may execute. Fork PRs must not receive production credentials. Protect deployment environments and production credentials separately from ordinary CI.

Record the date, reviewer and evidence of each setting check in the maintenance issue. Having this checklist, CODEOWNERS or a security policy does not mean these settings are active.

Official references: [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository), [Actions security](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).

## Before a release

Follow the existing release workflow with an explicitly reviewed version and main SHA. Confirm the changelog and release notes, privacy notices, source-license terms, third-party asset inventory, real-browser evidence and rollback instructions. Re-audit the final release snapshot, not only a parent branch. Never advertise unfinished experimental AI, account-level collaboration or third-party resource clearance as shipped guarantees.

Outstanding product work belongs in [ROADMAP](ROADMAP.md), not hidden inside a green CI result. For PR #66, real-provider evaluation and durable task recovery remain separate acceptance items. Keep public examples fictional, and never include private project databases or model keys in QA artifacts.
