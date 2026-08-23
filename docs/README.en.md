<div align="center">

![Logo](images/logo.png)

# AI Gist

![100% local data](https://img.shields.io/badge/Data%20storage-100%25%20local-success?style=flat&logo=database&logoColor=white) ![AI support](https://img.shields.io/badge/AI-Multi--model%20support-blue?style=flat&logo=openai&logoColor=white)  [![GitHub all releases](https://img.shields.io/github/downloads/yarin-zhang/AI-Gist/total?style=flat)](https://github.com/yarin-zhang/AI-Gist/releases)

![Desktop](https://img.shields.io/badge/Desktop-Windows%20%7C%20macOS%20%7C%20Linux-purple?style=flat&logo=electron&logoColor=white) ![Mobile](https://img.shields.io/badge/Mobile-Android%20%7C%20iOS-00A98F?style=flat&logo=capacitor&logoColor=white)

✨ AI Gist is a privacy-first AI prompt management tool designed to help you get the most out of the prompts you collect.

It supports variable substitution, Jinja templates, AI-powered generation and refinement, version history, cloud backups, and more.

![Main screenshot](images/image-main.png?v=202608170119)

[🏠 Official website](https://getaigist.com) | [🔗 Download from GitHub](https://github.com/yarin-zhang/AI-Gist/releases) | [🇨🇳 中文 README](../README.md)

</div>

## 📌 Features

AI Gist provides the essential features for creating, organizing, and using AI prompts efficiently, with support for Jinja templates.

* **Variable filling**: Enter variables dynamically when using a template. The structure stays clear and flexible, with Jinja template support.
* **Multiple views**: Manage prompt templates in one place with card, table, and category views.
* **Filtering and categorization**: Quickly filter, find, and organize prompts using tags, categories, ratings, favorites, and more.
* **Version history**: Keep track of changes so you can reuse and continuously improve your prompts, with a record you can revisit later.

![Features 01](images/image-main-dark.png?v=202608162327)

AI Gist also integrates AI models to help you generate and refine prompts more efficiently. Polish it before you use it.

* **Multiple AI models**: Connect a variety of AI models, including local models from Ollama and LM Studio, as well as popular online models such as OpenAI.
* **AI generation**: Generate prompts quickly with AI and customize the system prompt.
* **AI refinement**: Rewrite prompts with AI to make them more specific and detailed, with support for custom refinement instructions.
* **AI variable extraction**: Let AI identify potential variables automatically instead of adding placeholders manually.

![Features 02](images/image-ai-generator.png?v=202608162327)

AI Gist puts privacy and data security first. All data is stored locally, and cloud backup makes it easy to keep data in sync across devices.

* **Local-first**: All data is stored locally. Under normal circumstances, the app does not need an internet connection, helping protect your privacy and security.
* **Data control**: You retain full control of your data, with complete export and import support, plus export to the widely compatible CSV format.
* **Cloud backup**: Back up and restore through WebDAV or iCloud to share data across multiple devices.

![Features 03](images/image-data-cloud-backup.png?v=202608162327)

* **Cross-platform support**: Available on Windows, macOS, and Linux desktop, as well as Android (APK) and iOS (App Store).
* **Multiple languages**: Supports Simplified Chinese, Traditional Chinese, English, and Japanese.

## ⬇️ Download

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/yarin-zhang/AI-Gist?style=flat)](https://github.com/yarin-zhang/AI-Gist/releases/latest) [![GitHub all releases](https://img.shields.io/github/downloads/yarin-zhang/AI-Gist/total?style=flat)](https://github.com/yarin-zhang/AI-Gist/releases)

| Platform | Installer | App store | Notes |
|------|----------|----------|------|
| ![Windows](https://custom-icon-badges.demolab.com/badge/Windows-0078D6?logo=windows11&logoColor=white) | [Windows Setup](https://github.com/yarin-zhang/AI-Gist/releases/latest) | [Microsoft Store](https://apps.microsoft.com/detail/9n6vb23vsk8k?hl=zh-CN&gl=US) | Windows installer |
| ![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white) | [macOS (Apple Silicon)](https://github.com/yarin-zhang/AI-Gist/releases/latest) | [App Store](https://apps.apple.com/us/app/ai-gist/id6762559220) | For Apple Silicon Macs |
| ![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white) | [macOS (Intel)](https://github.com/yarin-zhang/AI-Gist/releases/latest) | [App Store](https://apps.apple.com/us/app/ai-gist/id6762559220) | For Intel Macs |
| ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black) | [Linux AppImage](https://github.com/yarin-zhang/AI-Gist/releases/latest) | [Snap Store](https://snapcraft.io/ai-gist) | Universal Linux application |
| ![Android](https://img.shields.io/badge/Android-APK-3DDC84?style=flat&logo=android&logoColor=white) | [Android APK](https://github.com/yarin-zhang/AI-Gist/releases/latest) |  | APK installer |
| ![iOS](https://img.shields.io/badge/iOS-App%20Store-000000?style=flat&logo=apple&logoColor=white) | | [App Store](https://apps.apple.com/cn/app/ai-gist/id6762559220) | App Store |

If GitHub downloads are slow, you can try Baidu Netdisk or SourceForge instead.

| Mirror | Download link | Notes |
|------|----------|------|
| [<img src="https://img.shields.io/badge/Baidu%20Netdisk-Download-blue?logo=baidu&style=flat-square" alt="Baidu Download">](https://pan.baidu.com/s/10apxOpgNciADcKfhuli5sA?pwd=4321) | [Baidu Netdisk](https://pan.baidu.com/s/10apxOpgNciADcKfhuli5sA?pwd=4321) | Recommended for users in China. Extraction code: 4321 |
| [![Download AI-Gist](https://img.shields.io/badge/SourceForge-Download-green?logo=sourceforge&style=flat)](https://sourceforge.net/projects/ai-gist/files/latest/download) | [SourceForge](https://sourceforge.net/projects/ai-gist/files/latest/download) | Recommended for international users |

## 🚀 Installation

- **Windows:** Download the `.exe` file and double-click it to run the installer.
- **macOS:** Download the `.dmg` file, open it, and drag the app to the Applications folder. Signed and notarized versions can be launched directly. Older unsigned versions still require `xattr -cr /Applications/AI\ Gist.app` in Terminal before launching.
- **Linux:** Download the `.AppImage` file and make it executable with `chmod +x ai-gist-linux.AppImage`.
- **Android:** Download the `.apk` file and, when prompted, allow installation from your browser or file manager.
- **iOS:** Search for AI Gist in the [App Store](https://apps.apple.com/cn/app/ai-gist/id6762559220), or open the link to install it.

## 📒 Use Cases

### Manage prompts

- Click “New Prompt”.
- Enter a prompt template and use `{{variableName}}` to insert variables. AI Gist will detect them automatically.
- Select the template when you want to use it, then enter values for the variables.
- Click “Copy Content” to copy the content and automatically record its usage history.

### Generate prompts with AI

- Add an AI model in the app. Local Ollama and LM Studio models, as well as common online models such as OpenAI and DeepSeek, are supported.
- Click the “AI Generate” button on the home page to generate a prompt with your selected AI model.

### Refine prompts with AI

- Add an AI model first.
- On the prompt editing page, quickly refine an existing prompt with actions such as “Extract Variables” or “Make It More Specific”. You can also provide custom refinement instructions.

## Development

### Install dependencies

```bash
yarn install
```

### Start the development environment

```bash
yarn dev
```

If the project is located in WSL but you want to preview the Windows client directly, run:

```bash
yarn dev:win
```

Changes to the renderer are updated instantly by Vite. Changes to the Electron main process and preload scripts are automatically recompiled and restart the client. The first run caches a Windows Electron development runtime; subsequent runs do not need to package it again.

To preview only the web version in a browser, run:

```bash
yarn dev:web
```

To develop the iOS or Android app, build and sync with Capacitor first, then open the native project in Xcode or Android Studio:

```bash
yarn build:mobile   # Build the renderer and sync with Capacitor
yarn cap:ios        # Open the iOS project in Xcode (requires macOS + Xcode)
yarn cap:android    # Open the Android project in Android Studio (requires Android Studio)
```

### Other common commands

```bash
# Development
yarn dev            # Start the app with hot reload
yarn dev:win        # Start the Windows client from WSL with hot reload
yarn build          # Package the app; output goes to "dist"

# Cross-platform builds
yarn build:win      # Build the Windows installer
yarn build:mac      # Build the macOS installer
yarn build:linux    # Build the Linux installer
```

### Development guides

For detailed development documentation, see the following files:

- [Project architecture guide](./project-architecture.md)
- [Local web deployment and cross-platform differences](./web-deployment-and-platform-differences.md)
- [Mobile development guide](./mobile-development.md)
- [GitHub Actions build and release automation](./github-actions.md)

## Contributing

This project is primarily developed by one person, and all code is open source. If you find it useful, click the Star button in the upper-right corner to support the project. It helps motivate continued improvement and maintenance.

For questions or suggestions, feel free to open an Issue or Pull Request on GitHub.

You are also welcome to join the QQ group to exchange ideas with the developer and other users, report problems, and get the latest updates.

<p align="center">
  <img src="images/QQ-QRCode.png?v=202507031628" alt="QQ group" width="200" />
</p>

## Screenshots

<div align="center">

![Variable filling](images/image-variable-fill.png?v=202608162327)

Variable filling

![Prompt editing](images/image-edit-prompt.png?v=202608162327)

Prompt editing

![Jinja template](images/image-jinja-template.png?v=202608162327)

Jinja template

![AI model management](images/image-ai-config.png?v=202608162327)

AI model management

![Add AI configuration](images/image-ai-add-config.png?v=202608162327)

Add AI configuration

![Quick AI adjustment](images/image-ai-quick-adjust.png?v=202608162327)

Quick AI adjustment

![Advanced filtering](images/image-filter.png?v=202608162327)

Advanced filtering

![Table view](images/image-table-view.png?v=202608162327)

Table view

![Folder view](images/image-folder-view.png?v=202608162327)

Folder view

![Category management](images/image-category.png?v=202608162327)

Category management

![Data backup](images/image-data-local-backup.png?v=202608162327)

Data backup

![Light mode](images/image-main-light.png?v=202608162327)

Light mode

</div>

## License

This project is licensed under the [AGPL License](../LICENSE). Please comply with its terms when using the project.
