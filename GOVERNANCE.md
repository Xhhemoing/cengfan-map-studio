# Governance / Project stewardship

Cengfan Map Studio is a maintainer-led, local-first open-source editor. The current repository maintainer is **@Xhhemoing**. This is a lightweight operating model, not a claim that a foundation, review committee or support team exists.

## Decisions and participation

Anyone may report a reproducible defect, improve documentation, add tests or propose a feature in Chinese or English. No private group membership, donation, model subscription or contributor agreement beyond the existing [contribution terms](CONTRIBUTING.md) is required to participate.

Small fixes may start as a PR. Discuss new product scope, persistent data formats, external services, privacy changes or architectural changes in an Issue before implementation. Record the problem, alternatives, compatibility, validation and rollback; link the final decision from the PR. Use [ROADMAP](docs/ROADMAP.md) rather than maintaining competing task lists in old design drafts.

The maintainer decides scope, review acceptance and release timing. Decisions should be explained with the project's user needs, evidence, privacy boundaries and maintenance cost. Disagreement is welcome when it follows the [Code of Conduct](CODE_OF_CONDUCT.md). Request reconsideration with new evidence in the original discussion; do not turn personal attacks into a technical review process.

## Review and release authority

A green check means that particular check passed for a particular commit. It does not mean a change has been independently reviewed, merged, deployed, licensed by every third-party rights holder or certified secure. High-risk changes should receive another qualified review where available; a sole-maintainer change must disclose the lack of independent review rather than fabricate approval.

Release preparation follows [RELEASING](docs/RELEASING.md). Published tags must not be rewritten. Failed gates need a root cause, a minimal fix and a recheck. Do not silence checks simply to obtain a green badge.

CODEOWNERS routes review requests; it does not itself enforce branch protection. Required checks and review rules are repository settings and must be verified separately using the [maintainer checklist](docs/MAINTAINERS.md).

## AI-assisted contributions

AI assistance is welcome, but the submitter remains responsible for every changed line, asset origin, privacy boundary and claimed test result. Describe material AI assistance and the checks actually performed. Never submit generated credentials, invented sources, real student records or a claim that mock-provider tests prove real-provider reliability. Do not request private model reasoning; concise design rationale and observable evidence are sufficient.

## Maintainer continuity and security

Additional maintainers require a public proposal, sustained relevant contributions and an explicit decision by the existing maintainer. Grant only necessary permissions, document responsibilities, and review access when someone steps back. No automatic promotion or fixed response-time promise is implied.

Security and conduct reports follow [SECURITY](SECURITY.md) and [SUPPORT](SUPPORT.md). Do not post exploit details, credentials or personal data in public issues. If private reporting is unavailable, request a private contact channel without disclosing sensitive details.
