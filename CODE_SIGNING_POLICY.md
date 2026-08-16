# Code signing policy

AI Gist uses free code signing provided by [SignPath.io](https://signpath.io/), with a certificate issued to [SignPath Foundation](https://signpath.org/), for official Windows releases. Official macOS releases are signed with an Apple Developer ID Application certificate and notarized by Apple when the required Apple Developer credentials are available.

Older releases and builds produced while either onboarding process is pending may be unsigned. The release notes identify that status. Only artifacts produced by the repository's GitHub Actions release workflow are eligible for signing.

## Build provenance

Official release artifacts are built from the public [AI Gist source repository](https://github.com/yarin-zhang/AI-Gist) by [GitHub Actions](https://github.com/yarin-zhang/AI-Gist/actions) on GitHub-hosted runners. The Windows installer is uploaded as a workflow artifact before it is submitted to SignPath. A maintainer must approve each SignPath signing request before the signed installer is published to GitHub Releases.

## Team roles

- Committer and reviewer: [Yarin Zhang (@yarin-zhang)](https://github.com/yarin-zhang)
- Signing approver: [Yarin Zhang (@yarin-zhang)](https://github.com/yarin-zhang)

Changes from contributors without direct commit access are accepted through pull requests and reviewed by a maintainer. Repository and SignPath accounts used for release signing must have multi-factor authentication enabled.

## Privacy and security

AI Gist's data handling is described in the [privacy policy](PRIVACY.md). Concerns about a release or signing process can be reported through the [AI Gist issue tracker](https://github.com/yarin-zhang/AI-Gist/issues).
