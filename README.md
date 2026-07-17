# Grow Together AI

A supportive, evidence-informed platform that helps parents understand and nurture their children's development (ages 6-12) through guided assessments, personalized weekly growth plans, and licensed-professional referral pathways.

---

## Disclaimer

**Grow Together AI provides general, educational child-development support only. It is not a medical, psychological, or diagnostic tool, and it does not replace consultation with a licensed pediatrician, psychologist, or other qualified professional.** Any content suggesting a referral is a prompt to seek professional guidance, never a clinical judgment. If you have concerns about a child's health, development, or safety, please consult a licensed professional directly.

---

## Vision

Every parent deserves clear, trustworthy guidance on how their child is growing — physically, cognitively, linguistically, socially, and emotionally — without needing to be a child-development expert themselves. Grow Together AI exists to make that guidance accessible and evidence-based, while always encouraging a real conversation with a licensed professional when one is warranted, never replacing one.

---

## Project Status (Current Phase)

**Phase 1 — Foundation.** This is a from-scratch production rebuild of a validated prototype: real accounts, a real database, multi-organization support, and rule-based "Preliminary" reports — deliberately without live AI yet. The full architecture, database design, API design, AI governance framework, and threat model have been completed and approved before any code was written.

| Phase | Scope | Status |
|---|---|---|
| Phase 1 — Foundation | Real accounts, real database, multi-organization support, rule-based "Preliminary" reports | **In progress** |
| Phase 2 — Intelligence | Live AI agents (Orchestrator, Child Development, Growth Plan), real Knowledge Base citations | Planned |
| Phase 3 — Scale | Administrator role, multi-org management UI, native mobile app | Planned |

A legal consultation (Saudi PDPL, Privacy Policy, Terms of Service, parental consent language) is running as a parallel workstream and **must be completed before any real users are onboarded** — no real family data is collected before that's in place.

## Current Milestone

**Milestone 0 — Project Setup**, in progress: creating the code repository, verifying the deployment pipeline with a minimal "Hello World" application, and preparing the development environment. No application features exist yet. See `Milestone_Map.md` for full milestone-by-milestone detail and completion criteria.

---

## Architecture Overview

A single, layered Next.js application — deliberately one deployable project rather than a multi-service system, to stay maintainable for a small team:

```
Browser (Parent / Counselor / Admin)
        |
Next.js Application
  |- Pages / UI (React)
  |- API Routes (REST, versioned)
  |- Authentication & Authorization (org + role scoped, enforced centrally)
  |- Database access (PostgreSQL via Prisma, provider-agnostic)
  |- File storage (PDF reports, provider-agnostic)
  `- Rule-based "Preliminary" report generator (Phase 1 only)
```

Every table that holds family data is scoped by organization from day one, enabling safe multi-tenancy without a future rebuild. Full detail lives in `Architecture.md`.

---

## Technology Stack

| Concern | Choice |
|---|---|
| Frontend + API | Next.js (React) + TypeScript |
| Styling | Tailwind CSS (Navy Blue design system) |
| Database | PostgreSQL via Prisma (hosting provider intentionally undecided — see below) |
| Authentication | Auth.js (NextAuth) |
| File storage | Object storage, behind a provider-agnostic adapter |
| Email delivery | Transactional email, behind a provider-agnostic adapter |
| PDF generation | Client-side (html2canvas + jsPDF) |
| Hosting | Provider intentionally undecided pending data-residency legal guidance |
| CI/CD | GitHub Actions |

**Note on cloud neutrality:** this project deliberately avoids hard-coding any specific cloud vendor's SDK or feature into application code. Database, storage, email, and hosting are all accessed through internal adapters, so the final vendor and region choice — made after Saudi PDPL legal consultation — is a configuration decision, not a rewrite.

---

## Repository Structure (high-level)

```
grow-together-ai/
|- prisma/           # Database schema and migrations (added at Milestone 1)
|- src/
|   |- app/          # Pages and API routes
|   |- components/   # UI components
|   |- lib/          # Shared logic: auth, permissions, adapters, audit
|   |- styles/       # Design system tokens
|   `- i18n/         # English / Arabic translations
|- tests/            # Unit, integration, and security tests
|- docs/             # Full architecture and governance documentation
`- public/           # Static assets
```

Full rationale in `Folder_Structure.md`.

---

## Development Workflow

Every milestone, and every meaningful change within it, follows the same six-stage cycle — none of these stages are skipped, even for small changes:

1. **Analysis** — what are we building, and why
2. **Design** — how will it work, in plain terms before any code
3. **Approval** — the project owner reviews and signs off
4. **Implementation** — the code is written
5. **Testing** — automated tests (including cross-tenant security checks) must pass before anything is considered done
6. **Documentation** — the relevant document(s) in this repository are updated in the same pass, so documentation never drifts out of sync with reality

Changes are committed to the `main` branch with clear, descriptive commit messages. As the codebase grows, feature work will move to short-lived branches merged only after review, per standard practice.

---

## Versioning Strategy

This project follows the phase-based versioning defined in the original product roadmap, mapped to semantic-style version tags once releases begin:

- **v1.x** — Phase 1 (Foundation): accounts, database, rule-based reports
- **v2.x** — Phase 2 (Intelligence): live AI agents, real citations, integrations
- **v3.x** — Phase 3 (Scale): multi-organization administration, mobile app

Within a phase, minor version increments (e.g., v1.1 -> v1.2) represent completed milestones; patch increments represent bug fixes. Git tags mark each release once deployments begin at Milestone 6.

---

## Security Notice

This project handles sensitive family and child data and is treated accordingly:

- No secrets, credentials, or API keys are ever committed to this repository — see `Secret_Management_Guide.md`.
- All family data access is scoped by organization and role, enforced centrally, and audited — see `Threat_Model.md` and `Database_Design.md`.
- A full risk analysis (security, privacy, child-data protection, compliance) is maintained in `Threat_Model.md` and reviewed as the system evolves.
- If you believe you've found a security issue, please report it privately rather than as a public issue *(reporting contact to be added once the project has a public-facing presence)*.

---

## Getting Started

*(Placeholder — setup instructions will be added once Milestone 0's application scaffold is created. This section will eventually cover prerequisites, local installation, environment configuration, and running the app locally.)*

---

## Documentation Map

This repository's documentation is organized in three layers, built in this order and kept in sync as the project evolves:

```
Layer 1 - Foundation & Architecture
  Architecture.md, SPEC.md, Folder_Structure.md,
  Database_Design.md, API_Design.md

Layer 2 - AI & Risk Governance (design-ahead, Phase 2+)
  Agent_Architecture.md, AI_Governance.md, Threat_Model.md

Layer 3 - Delivery & Operations
  Development_Roadmap.md, Technology_Stack.md, Milestone_Map.md,
  Development_Checklist.md, Environment_Variables_Guide.md,
  Accounts_Checklist.md, Secret_Management_Guide.md, Project_Glossary.md
```

Start with `Architecture.md` and `SPEC.md` for the "what and why," `Milestone_Map.md` for "what's next," and `Project_Glossary.md` any time a term is unfamiliar.

## Architecture Documents Index

| Document | Purpose |
|---|---|
| `Architecture.md` | System design, layers, multi-tenancy, data residency approach |
| `SPEC.md` | Product scope for the current phase |
| `Folder_Structure.md` | Codebase organization and layering rules |
| `Database_Design.md` | Full data model |
| `API_Design.md` | Every endpoint, its purpose, and access rules |
| `Agent_Architecture.md` | Future AI agent design (Phase 2) |
| `AI_Governance.md` | AI safety, oversight, and privacy rules (Phase 2) |
| `Threat_Model.md` | Security, privacy, and compliance risk analysis |
| `Development_Roadmap.md` | Phase-by-phase plan |
| `Technology_Stack.md` | Full technology rationale |
| `Development_Checklist.md` | End-to-end setup-to-launch checklist |
| `Environment_Variables_Guide.md` | Every configuration variable explained |
| `Accounts_Checklist.md` | Every external service needed, and when |
| `Secret_Management_Guide.md` | How credentials are protected |
| `Project_Glossary.md` | Plain-language definitions of technical terms |
| `Milestone_Map.md` | Every milestone, its output, and completion criteria |

---

## Future Roadmap

- **Milestone 0** — Project setup and deployment pipeline verification *(current)*
- **Milestones 1-5** — Accounts, children, assessments, history, resources, counselor dashboard
- **Milestone 5.5** — Security & compliance baseline
- **Milestone 6** — Hardening & launch
- **Phase 2** — Live AI agent integration
- **Phase 3** — Multi-organization administration, mobile app

Full detail in `Milestone_Map.md` and `Development_Roadmap.md`.

---

## License

*(Placeholder — license to be determined. This is currently a private, proprietary codebase; no open-source license applies unless and until decided otherwise.)*

---

## Contributing

*(Placeholder — this is currently a closed, single-maintainer project. Contribution guidelines will be added if and when the project opens up to additional collaborators.)*
