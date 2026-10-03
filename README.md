# AI Control Gateway

AI Control Gateway governs how AI uses company data and compute. It checks access, detects malicious instructions, stops excessive tool loops, and produces approved answers or sanitized exports. Security teams inspect decisions; managers see usage and clearly labelled cost estimates.

**Status:** implementation-ready specification and a Next.js/Supabase starter. The gateway, authentication flows, live model bridge, demo dataset, dashboards and security test suite described here are planned work, not shipped capabilities. The HTML pitch is a standalone presentation.

The reference application is an internal company chat. AsterCloud is a fictional acquisition target. All demonstration data is synthetic. Four prepared accounts show administrator, assigned analyst, employee and external-reviewer access.

## Start here

1. [Documentation map and authority](docs/README.md)
2. [Product requirements](docs/product/requirements.md)
3. [Architecture](docs/product/architecture.md) and [technical specification](docs/product/technical-spec.md)
4. [Your implementation task](docs/team/implementation-plan.md)
5. [Setup and command availability](docs/team/setup.md)
6. [Acceptance tests](docs/testing/acceptance.md) and [judge runbook](docs/demo/runbook.md)

Coding agents first read [AGENTS.md](AGENTS.md); Claude Code imports it through [CLAUDE.md](CLAUDE.md). Read [DESIGN.md](DESIGN.md) before implementing screens.

Available now: `npm ci`, `npm run dev`, `npm run check`. These operate on the starter; a green build does not prove the planned gateway works. Use the setup guide before configuring services or writing shared data.

[One-page pitch](docs/pitch/pitch.md) · [Six-slide presentation](docs/pitch/presentation.html) · [Historical evidence](docs/product/research-decisions.md)
