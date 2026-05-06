# Governance & Project Decisions

## Core decisions (2026-05-07)

| # | Питання | Рішення |
|---|---|---|
| 1 | License | **MIT** — максимум adoption, без friction для adoption |
| 2 | Domain | **holonext.dev** (`.com` зайнятий третьою стороною) |
| 3 | Stewardship model | **Single maintainer + open to contributors** — Alex Kravchuk як maintainer, PR від community вітаються |
| 4 | Business model | **Open source forever** — без комерційного fork, без enterprise tier у foreseeable future |
| 5 | Funding / backing | **Self-funded side project** — без VC, sponsorship чи corporate backing на запуск |

## What this means in practice

- Контриб'ютори вільно роблять PR; merge — за рішенням maintainer-а
- Архітектурні зміни через RFC у GitHub Discussions (формалізуємо при появі стороннього інтересу)
- Без CLA — MIT + GitHub Terms of Service достатньо
- Roadmap прозорий — у GitHub Projects / Issues
- Breaking changes — суворо за semver, з migration guides

## What this is *not*

- Не managed cloud сервіс
- Не open core / dual license
- Не комерційний продукт зараз або у v0.x

Якщо ці позиції зміняться — це великий event і буде явне публічне оголошення з обґрунтуванням.

---

Питання щодо governance — issue з тегом `governance`.
