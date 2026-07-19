# Foundry Module Localization Policy

Status: required product standard; current implementation backlog is tracked as `MOD-I18N-001`.

## Scope

This policy applies to every Foundry module produced by this repository, including the current target-world spell resolver and any future module.

Every user-facing module surface must be available in both English and Simplified Chinese:

- module title, package-manager description, release description, and feature summary;
- settings menus, field names, hints, controls, and validation messages;
- dialogs, review screens, reports, status labels, notifications, warnings, and errors;
- embedded help, installation guidance, and operator-facing recovery instructions.

Package IDs, setting keys, stored values, document flags, hashes, source matching, and game mechanics must remain language-neutral. Changing display language must never change resolver behavior or saved data.

## Delivery hierarchy

1. **Required baseline:** provide complete `en` and `zh-CN` Foundry localization dictionaries and render every runtime user-facing string through Foundry localization APIs. The module must follow the active Foundry client language correctly.
2. **Preferred experience:** provide a per-client, module-local English / 简体中文 selector so a user can switch the module UI without changing the rest of Foundry. The switch may rerender or reopen module windows, but must not become a world-shared mechanics setting.
3. **Fallback when dynamic switching is impractical:** ship a complete, version-matched localized manifest/artifact or a verified manual replacement file with exact installation and rollback instructions. Do not label a partial string patch as a Chinese edition.

Manifest-facing metadata needs explicit treatment because static `module.json` fields may be displayed before module runtime localization is available. The chosen release method must make both the English and Chinese module title and functional description obtainable by ordinary users.

## Acceptance gate

A Foundry module is not localization-complete until all of the following pass:

- English and Simplified Chinese dictionaries have equal required key coverage.
- Both languages are opened in the exact supported Foundry/system runtime.
- Settings, dialogs, reports, notifications, and recovery paths show no raw localization keys or unintended fallback language.
- Long Chinese and English strings are visually checked for clipping, overflow, unreadable wrapping, and inaccessible controls.
- Switching language leaves package IDs, settings, Actor data, resolver selections, and mechanics unchanged.
- Module-list title and functional description have a documented English and Chinese delivery path.

## Current spell-resolver gap

As recorded from the production configuration screenshot on 2026-07-19, the spell resolver already ships complete `en.json` and `zh-CN.json` dictionaries with identical 101-key coverage, and its settings template uses Foundry localization calls. It currently follows the active Foundry client language.

The remaining deferred work is:

- add and accept a module-local per-client English / 简体中文 selector, or document why the fallback distribution path is used;
- provide a Chinese module title and functional description alongside the current static English `module.json` metadata;
- perform exact-runtime visual acceptance in both languages.

This policy records the requirement only. It does not authorize or claim the deferred UI/packaging implementation.
