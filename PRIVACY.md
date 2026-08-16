# AI Gist privacy policy

Last updated: August 15, 2026

AI Gist is a local-first application. Prompt libraries, categories, histories, preferences, AI service configurations, and locally created backups are stored on the user's device by default. The AI Gist maintainers do not operate an account service for the desktop or mobile applications and do not receive this local data.

AI Gist does not include advertising, analytics, telemetry, or crash-reporting services. It does not transfer user information to networked systems unless the user or the person installing or operating the application invokes or configures a network feature.

The following actions can make network requests:

- Checking for updates sends the installed AI Gist version and ordinary network metadata to the GitHub Releases API.
- Using an online AI provider sends the prompt content, selected model information, and the credentials required by that provider to the endpoint selected by the user. The provider's privacy policy applies. Local providers such as Ollama and LM Studio can be used without sending prompts to a public AI service.
- Enabling WebDAV backup or synchronization sends the selected AI Gist data and WebDAV credentials to the server configured by the user. iCloud synchronization is handled through the user's operating-system iCloud Drive.
- Running a proxy or connection test contacts the endpoints displayed by that feature.

The self-hosted Web edition uses a same-origin backend to proxy WebDAV and AI requests because browsers restrict direct cross-origin access. That backend processes credentials and request content in transit and does not intentionally persist them. The person deploying a Web edition controls its server, logs, network, and retention policy and is responsible for disclosing any additional processing.

Users can remove their data through AI Gist's delete and reset controls, delete exported or backup files from their chosen locations, or remove the application's local data through the operating system. Data already sent to a user-selected AI provider, WebDAV server, or other external service is governed by that service and must be deleted there.

Questions and privacy reports can be submitted through the [AI Gist issue tracker](https://github.com/yarin-zhang/AI-Gist/issues). Do not include API keys, passwords, prompt contents, or other sensitive data in a public issue.
