# Contributing to Liquid Chat

Thank you for your interest in contributing to **Liquid Chat**! We welcome contributions from developers worldwide to build a faster, more secure, and beautifully crafted messaging experience.

---

## 🛠️ How to Contribute

### 1. Reporting Bugs
- Search existing issues to ensure the bug hasn't already been reported.
- Open a new issue with a clear title, description, steps to reproduce, and environment details (Browser, OS, PHP/MySQL version).

### 2. Suggesting Enhancements
- Check open issues or discussions.
- Describe the feature clearly and explain why it would benefit users.

### 3. Pull Requests (PRs)
1. **Fork** the repository.
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes with descriptive commit messages.
4. Test your changes thoroughly (desktop, mobile viewports, PWA standalone).
5. **Push** to your fork and submit a **Pull Request**.

---

## 📋 Code Guidelines

- **PHP**: Adhere to PSR-12 coding style. Always use prepared statements (`$mysqli->prepare` or PDO) for database queries.
- **Frontend**: Clean vanilla JavaScript, no heavy unnecessary frameworks. Respect the Telegram-Z and Liquid Glass design tokens.
- **Mobile Native**:
  - Always support dynamic viewport units (`100dvh`).
  - Honor safe area insets (`env(safe-area-inset-*)`).
  - Test on real touch viewports without breaking desktop layout.
- **Security**: Never hardcode credentials, private keys, or tokens.

---

## ⚖️ License
By contributing to Liquid Chat, you agree that your contributions will be licensed under the project's [LCSL-1.0 License](LICENSE).
