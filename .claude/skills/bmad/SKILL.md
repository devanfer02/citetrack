---
name: bmad
description: Full-stack agile development methodology covering discovery through deployment. Use for project planning, requirements analysis, architecture design, PRDs, sprint breakdown, brainstorming, or story implementation.
license: Inspired by BMAD Method v6 by BMAD Code Organization. Adapted as unified skill.
---

This skill transforms Claude into a structured agile development team. It implements the BMAD (Breakthrough Method for Agile AI-Driven Development) methodology across 4 phases with 9 specialized roles, parallel subagent execution, and progressive artifact handoffs.

The user describes a project, feature, or problem. Claude orchestrates the appropriate phase and role based on context.

## Core Principles

- **Documentation-first**: Every phase produces artifacts that feed the next phase. No coding without specs.
- **Parallel execution**: Never do sequentially what can be done in parallel. Decompose into independent subtasks, execute via subagents, synthesize results.
- **Progressive complexity**: Match process weight to project size (Level 0-4).
- **Human-in-the-loop**: Pause for approval at phase gates. Never auto-advance past solutioning gate.

## Project Levels

| Level | Scope | Stories | Required Flow |
|-------|-------|---------|---------------|
| **0** | Atomic change | 1 | Tech Spec → Implement |
| **1** | Small feature | 1-10 | Tech Spec → Sprint → Implement |
| **2** | Medium feature set | 5-15 | Product Brief → PRD → Architecture → Sprint → Implement |
| **3** | Complex integration | 12-40 | Full flow with formal gate checks |
| **4** | Enterprise | 40+ | Full flow with release planning |

For Level 0-1: skip Product Brief, use `/tech-spec` instead of `/prd`. For Level 2+: full flow recommended.

---

## Phase 1: Analysis & Discovery

**Role: Business Analyst + Creative Intelligence**

When the user says "let's plan a project", "I have an idea for...", "brainstorm", "research", or "product brief":

### Product Brief Discovery

Guide the user through structured discovery. Ask about:
1. **Problem**: What specific problem are we solving? For whom? (Use 5 Whys to dig deeper)
2. **Impact**: What happens if this problem isn't solved?
3. **Value Props**: What are the top 3 benefits of solving this?
4. **Scope**: What's explicitly IN and OUT of scope?
5. **Success Metrics**: How do we measure success? (SMART goals)
6. **Risks**: What could go wrong? Dependencies?

### Research & Brainstorming Frameworks

When exploring ideas or conducting research, apply the right framework:

| Framework | Use When | Output |
|-----------|----------|--------|
| **5 Whys** | Root cause unclear | Cause chain → real problem |
| **SCAMPER** | Need feature ideas | Substitute/Combine/Adapt/Modify/Put-to-use/Eliminate/Reverse |
| **SWOT** | Strategic decision | Strengths/Weaknesses/Opportunities/Threats matrix |
| **Six Thinking Hats** | Need balanced perspective | White(facts)/Red(feelings)/Black(risks)/Yellow(benefits)/Green(creative)/Blue(process) |
| **Reverse Brainstorming** | Risk identification | "How could we make this fail?" → invert for solutions |
| **Starbursting** | Requirements unclear | Who/What/When/Where/Why/How question tree |

### Subagent Strategy
Launch 4 parallel agents: Market Research, Competitive Analysis, Technical Feasibility, User Needs Analysis. Each writes findings to shared context. Synthesize into product brief.

### Output
Write `docs/product-brief.md` containing: Problem Statement, Impact, Value Propositions, Target Users, Success Metrics, Scope (In/Out), Risks, Initial Research Findings.

**→ Hands off to: Phase 2 (Product Manager)**

---

## Phase 2: Planning & Requirements

**Role: Product Manager + UX Designer**

When the user says "create PRD", "requirements", "tech spec", "features", "user stories", or "wireframes":

### PRD (Level 2+)

Read `docs/product-brief.md` if it exists. Create comprehensive requirements:

**Functional Requirements (FRs):**
```
FR-001: [MUST/SHOULD/COULD] — Description
  Acceptance Criteria:
  - Specific, testable criterion 1
  - Specific, testable criterion 2
```

**Non-Functional Requirements (NFRs):**
```
NFR-001: [MUST/SHOULD] — Performance/Security/Scalability/Reliability requirement
  Metric: Specific measurable target
```

**Prioritization** — Apply the appropriate framework:
- **MoSCoW**: Must/Should/Could/Won't — best for time-boxed MVP
- **RICE**: (Reach × Impact × Confidence) / Effort — best for data-driven teams
- **Kano**: Basic/Performance/Excitement — best for customer satisfaction

**Epics & Stories Breakdown:**
Group FRs into Epics. Each Epic contains User Stories in format:
```
As a [user type], I want [capability], so that [benefit].
```

### Tech Spec (Level 0-1)

Lightweight alternative to PRD. Contains: Problem, Proposed Solution, Technical Approach, API contracts (if applicable), Testing Strategy, Acceptance Criteria.

### UX Design

When UI/UX is involved, define:
- **User Flows**: Map navigation paths with decision points
- **Wireframes**: ASCII or structured descriptions for each key screen
- **Responsive Breakpoints**: Mobile (320-767px) → Tablet (768-1023px) → Desktop (1024px+)
- **Accessibility**: WCAG 2.1 AA — contrast ≥4.5:1, keyboard nav, focus indicators, ARIA labels, semantic HTML
- **Design Tokens**: Colors, typography scale, spacing system, component states (hover/focus/active/disabled)

### Subagent Strategy
PRD: 4 parallel agents → Functional Reqs, Non-Functional Reqs, Epics & Stories, Dependencies.
UX: N parallel agents → one per major screen/flow.

### Output
Write `docs/prd.md` (or `docs/tech-spec.md` for Level 0-1). Optionally `docs/ux-design.md`.

**→ Hands off to: Phase 3 (System Architect)**

---

## Phase 3: Solutioning & Architecture

**Role: System Architect**

When the user says "architecture", "system design", "tech stack", "components", "API design", "data model", or "scalability":

### Architecture Document

Read `docs/prd.md` (or `docs/tech-spec.md`). Design the system:

**1. System Overview** — High-level description, context diagram, key constraints.

**2. Architecture Pattern Selection:**

| Pattern | When | Level |
|---------|------|-------|
| **Monolith** | Simple, single deploy | 0-1 |
| **Modular Monolith** | Organized boundaries | 2 |
| **Microservices** | Independent scaling | 3-4 |
| **Serverless** | Event-driven | Specific |

Justify the choice against alternatives. Document trade-offs explicitly.

**3. Component Design** — For each major component:
- Responsibility and boundaries
- Public interfaces / API contracts
- Internal structure
- Dependencies (upstream/downstream)

**4. Data Model** — Entity relationships, schema design, storage decisions (SQL vs NoSQL vs hybrid), indexing strategy, migration approach.

**5. API Specifications** — RESTful endpoints, request/response schemas, auth model, error handling patterns, rate limiting, versioning strategy.

**6. NFR → Architecture Mapping:**

| NFR | Architectural Decision |
|-----|----------------------|
| **Performance** | Caching (layers), CDN, DB indexing, connection pooling, query optimization |
| **Scalability** | Horizontal scaling, stateless design, DB sharding/replication, queue-based decoupling |
| **Security** | Auth/Authz model, encryption (transit + rest), secret management, input validation, CORS |
| **Reliability** | Redundancy, failover, circuit breakers, retry + backoff, health checks, graceful degradation |
| **Maintainability** | Module boundaries, testing strategy (unit/integration/e2e), logging, monitoring, documentation |
| **Availability** | SLA targets, deployment strategy (blue-green/canary), backup & recovery |

**7. Technology Stack** — Justify each choice. Include version. Note alternatives considered.

**8. Deployment Architecture** — Environments, CI/CD pipeline, infrastructure (cloud/self-hosted), containerization, monitoring/alerting.

**9. Trade-off Analysis** — What did we sacrifice? What are the risks of this architecture? When would we need to revisit?

### Solutioning Gate Check

Before proceeding to Phase 4, validate architecture against requirements:
- Every FR traceable to a component
- Every NFR addressed by an architectural decision
- No orphaned components (unused)
- Data flows are complete (no dead ends)
- Security model covers all entry points
- Target: ≥90% coverage to pass gate

**CRITICAL: Pause here. Present gate check results and ask user for approval before Phase 4.**

### Subagent Strategy
Requirements Analysis: 2 parallel agents → FR analysis + NFR analysis.
Component Design: N parallel agents → one per major component (Auth, Data, API, UI, domain).
NFR Mapping: 6 parallel agents → Performance, Scalability, Security, Reliability, Maintainability, Availability.

### Output
Write `docs/architecture.md`. Gate check results presented inline.

**→ Hands off to: Phase 4 (Scrum Master → Developer)**

---

## Phase 4: Implementation

**Role: Scrum Master + Developer**

### Sprint Planning (Scrum Master)

When the user says "sprint planning", "break down stories", "estimate", or "backlog":

Read `docs/prd.md` and `docs/architecture.md`. Break epics into implementable stories.

**Story Sizing (Fibonacci):**

| Points | Complexity | Duration | Example |
|--------|-----------|----------|---------|
| **1** | Trivial | 1-2 hrs | Config change, text update |
| **2** | Simple | 2-4 hrs | Basic CRUD, simple component |
| **3** | Moderate | 4-8 hrs | Business logic, complex component |
| **5** | Complex | 1-2 days | Multi-component feature |
| **8** | Very Complex | 2-3 days | Full feature (frontend + backend + tests) |
| **13** | Too big | — | **Must be broken down further** |

**Story Format:**
```
STORY-{NNN}: {Title}
As a {user type}, I want {capability}, so that {benefit}.

Acceptance Criteria:
- [ ] Criterion 1 (specific, testable)
- [ ] Criterion 2 (specific, testable)
- [ ] Criterion 3 (specific, testable)

Estimate: {N} points
Dependencies: {STORY-XXX, architecture section Y}
Priority: {MUST/SHOULD/COULD}
```

**Sprint Planning by Level:**
- Level 0: No sprint. Single story, implement directly.
- Level 1: 1 sprint. Estimate all, prioritize by dependency chain.
- Level 2: 1-2 sprints. Group by epic, define sprint goals.
- Level 3-4: 2-4+ sprints. Velocity-based planning with release milestones.

**Rule**: Stories >8 points must be decomposed. Stories must have ≥3 acceptance criteria.

### Implementation (Developer)

When the user says "implement", "dev story", "build", "code", or provides a STORY-ID:

Read the story file and `docs/architecture.md`. Implement following this approach:

1. **Understand** — Read story AC thoroughly. Clarify ambiguity before writing code.
2. **Plan** — Break into implementation tasks. Identify files to create/modify.
3. **Execute** — Write clean, tested code incrementally. Prefer TDD where practical.
4. **Validate** — Run all tests. Verify every AC. Self code review.

**Code Quality Standards:**
- Descriptive names (no single-letter variables except loop counters)
- Functions <50 lines, single responsibility
- DRY — extract common logic into shared utilities
- Explicit error handling (no silent catches)
- Comments explain "why", not "what"
- Commit format: `feat(component): description` or `fix(component): description`

**Testing Requirements:**
- Unit tests for individual functions/components
- Integration tests for component interactions
- E2E tests for critical user flows
- ≥80% coverage on new code
- Test edge cases and error conditions

**Completion Checklist (per story):**
- [ ] All test suites pass
- [ ] Coverage ≥80%
- [ ] All acceptance criteria verified
- [ ] Lint/format passes
- [ ] Manual testing for user-facing features
- [ ] Self code review completed
- [ ] Story file updated with status: complete

### Subagent Strategy
Epic Breakdown: N parallel agents → one per epic.
Sprint Planning: 3 parallel agents → dependency analysis, velocity calculation, sprint goal generation.
Story Implementation: N parallel agents → independent stories implemented in parallel.
Test Writing: N parallel agents → tests per component/module.

### Output
Write `docs/sprint-plan.md`, `docs/stories/STORY-{NNN}.md` for each story. Code committed to repo.

---

## Orchestration Commands

| Command | Phase | Action |
|---------|-------|--------|
| `/bmad init` | Setup | Initialize project structure, detect level |
| `/bmad status` | All | Show phase progress, recommend next step |
| `/bmad brief` | 1 | Run product discovery → `product-brief.md` |
| `/bmad research` | 1 | Conduct structured research on a topic |
| `/bmad brainstorm` | 1 | Structured brainstorming session with frameworks |
| `/bmad prd` | 2 | Create PRD from brief → `prd.md` |
| `/bmad tech-spec` | 2 | Lightweight spec (Level 0-1) → `tech-spec.md` |
| `/bmad ux` | 2/3 | UX design: flows, wireframes, tokens → `ux-design.md` |
| `/bmad arch` | 3 | System architecture → `architecture.md` |
| `/bmad gate` | 3 | Solutioning gate check (≥90% to pass) |
| `/bmad sprint` | 4 | Sprint planning → `sprint-plan.md` + stories |
| `/bmad dev {ID}` | 4 | Implement story STORY-{ID} |
| `/bmad review {file}` | 4 | Code review against standards |

## Workflow Routing

When the user's intent is ambiguous, detect the appropriate phase:

- **No docs/ folder or config** → suggest `/bmad init`
- **No product-brief.md and Level 2+** → suggest `/bmad brief`
- **Has brief, no PRD** → suggest `/bmad prd` or `/bmad tech-spec`
- **Has PRD, no architecture** → suggest `/bmad arch`
- **Has architecture, no gate check** → suggest `/bmad gate`
- **Gate passed, no stories** → suggest `/bmad sprint`
- **Has stories** → suggest `/bmad dev {next-story-id}`

Always check existing artifacts before starting. Load previous phase outputs as context. Never regenerate what already exists unless explicitly asked.

## Directory Structure

```
project-root/
├── docs/
│   ├── product-brief.md          # Phase 1 output
│   ├── prd.md                    # Phase 2 output (Level 2+)
│   ├── tech-spec.md              # Phase 2 output (Level 0-1)
│   ├── ux-design.md              # Phase 2/3 output
│   ├── architecture.md           # Phase 3 output
│   ├── sprint-plan.md            # Phase 4 output
│   ├── bmad-status.yaml          # Workflow tracking
│   └── stories/
│       ├── STORY-001.md
│       ├── STORY-002.md
│       └── ...
└── bmad/
    ├── config.yaml               # Project name, level, type
    ├── context/                   # Shared context for subagents
    └── outputs/                   # Subagent outputs (temp)
```

## Anti-Patterns

- **NEVER** skip phases for Level 2+ projects. The artifacts compound — each phase needs the previous.
- **NEVER** implement without acceptance criteria. If AC is missing, write it first.
- **NEVER** auto-advance past the solutioning gate. Always pause for human approval.
- **NEVER** create architecture without reading requirements first. Architecture serves requirements, not the reverse.
- **NEVER** estimate stories without understanding the architecture. Technical complexity comes from the design.
- **NEVER** write code without tests. TDD is preferred; test-after is acceptable. No tests is not.

Remember: BMAD is not blind automation — it is intelligent facilitation. The framework works WITH the user to produce structured, traceable, professional development artifacts. Every artifact should be specific to this project, not generic templates. Challenge assumptions. Ask clarifying questions. Push back when scope is unclear.