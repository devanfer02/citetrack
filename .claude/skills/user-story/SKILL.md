---
name: user-story
description: Write structured user stories with acceptance criteria, edge cases, and test scenarios. Use this skill when the user asks to write user stories, define requirements, break down features into stories, create acceptance criteria, or plan feature implementation from a product perspective. Also use when the user says "write a story for..." or "what are the requirements for...".
---

# User Story Writer

Write clear, actionable user stories that bridge product intent and engineering execution.
Stories should be specific enough to implement without ambiguity, but not so prescriptive
that they dictate implementation details.

## Story Format

```markdown
## [STORY-ID] Story Title

**As a** [role],
**I want** [capability],
**So that** [benefit/outcome].

### Context
[1-2 sentences of background — why this story exists now, what triggered it,
any relevant decisions or constraints. Link to related stories if part of an epic.]

### Acceptance Criteria
- [ ] [Observable behavior or state change, written as a testable assertion]
- [ ] [Another criterion]
- [ ] [...]

### Edge Cases
- **[Scenario name]**: [What happens when X occurs]
- **[Scenario name]**: [What happens when Y occurs]

### Test Scenarios
| Scenario | Given | When | Then |
|----------|-------|------|------|
| Happy path | [precondition] | [action] | [expected result] |
| Error case | [precondition] | [action] | [expected result] |
| Edge case | [precondition] | [action] | [expected result] |

### Out of Scope
- [What this story explicitly does NOT cover]

### Dependencies
- [Other stories, APIs, or infrastructure this depends on]

### Notes
- [Implementation hints, design references, or open questions]
```

## Writing Guidelines

### Roles

Use the actual roles from the product, not generic placeholders:

| Role | Description |
|------|-------------|
| Siswa (Student) | Mobile app user taking quizzes |
| Guru (Teacher) | CMS user managing content |
| Admin | CMS user with full access |

### Acceptance Criteria Rules

1. **Each criterion must be independently testable** — it should be possible to write a single test that verifies it
2. **Use observable outcomes** — "the user sees X" not "the system stores X" (unless storage IS the feature)
3. **Include negative criteria** — what should NOT happen is often as important as what should
4. **Quantify where possible** — "loads within 2 seconds" not "loads quickly"
5. **One behavior per criterion** — don't chain with "and"

### Edge Cases to Always Consider

- **Empty state**: What happens when there's no data?
- **Boundary values**: Min/max inputs, zero, negative numbers
- **Concurrency**: What if two users act simultaneously?
- **Network failure**: What happens offline or on timeout?
- **Permission denial**: What if the user lacks access?
- **Duplicate action**: What if the user submits twice?
- **Stale data**: What if underlying data changed since page load?

### Sizing Guidance

| Size | Criteria | Typical Scope |
|------|----------|---------------|
| **S** | 1-3 acceptance criteria | Single UI change or API tweak |
| **M** | 4-6 acceptance criteria | New screen or endpoint with validation |
| **L** | 7-10 acceptance criteria | Feature spanning frontend + backend |
| **XL** | 10+ criteria | Should be split into smaller stories |

If a story reaches XL, split it. Each sub-story should be independently deliverable.

## Story Splitting Strategies

When a feature is too large for one story:

1. **By workflow step**: Login → View dashboard → Take action
2. **By user role**: Student flow vs Teacher flow
3. **By data operation**: Create → Read → Update → Delete
4. **By platform**: API endpoint → CMS UI → Mobile UI
5. **By complexity**: Happy path first → Error handling → Edge cases

Each split story must deliver user-visible value on its own. "Set up database table"
is not a valid story — it's a task within a story.

## Example: TelNetQuiz Story

```markdown
## GEO-042 Instant Answer Verification

**As a** siswa,
**I want** to see immediately whether my answer is correct after selecting it,
**So that** I get instant feedback and can learn from mistakes during the quiz.

### Context
Currently answers are only evaluated after submitting the entire quiz.
Research shows immediate feedback improves retention by 40%.
This requires a new verify endpoint and mobile UI changes.

### Acceptance Criteria
- [ ] After tapping an option, the app calls the verify endpoint and shows result within 1s
- [ ] Correct answers highlight the selected option in green
- [ ] Wrong answers highlight the selected option in red (do NOT reveal the correct answer)
- [ ] A "Selesai" (Finish) button appears after all questions are answered
- [ ] The user cannot change their answer after verification
- [ ] Network errors show a retry prompt, not a crash

### Edge Cases
- **Slow network**: Show loading indicator on the selected option while verifying
- **Double tap**: Ignore taps while a verification request is in flight
- **App backgrounded**: Resume verification state when app returns to foreground

### Test Scenarios
| Scenario | Given | When | Then |
|----------|-------|------|------|
| Correct answer | Quiz with known correct option | User taps correct option | Option turns green, score increments |
| Wrong answer | Quiz with known correct option | User taps wrong option | Selected option turns red, correct answer stays hidden |
| Network timeout | Device on slow connection | User taps option | Loading spinner for 5s, then retry prompt |
| All answered | 5/5 questions verified | Last answer verified | "Selesai" button appears |

### Out of Scope
- Remedial/retry flow (separate story GEO-043)
- Study material display (separate story GEO-044)

### Dependencies
- API: POST /api/quiz/verify endpoint must exist
- Mobile: Network client must support per-request timeout

### Notes
- Verify endpoint should NOT return isCorrect for other options — only for the answered one
- Consider optimistic UI if latency is consistently low
```

## Process

When asked to write stories:

1. **Clarify scope** — Ask what the feature is, who it's for, and why it matters now
2. **Identify roles** — Who are the actors? What are their goals?
3. **Draft stories** — Write each story following the format above
4. **Check completeness** — Run through the edge case checklist
5. **Size and split** — If any story is XL, propose a split
6. **Review with user** — Present stories for feedback before finalizing

When asked to break down an epic:

1. Map the full user journey end-to-end
2. Identify natural split points (see splitting strategies)
3. Order by dependency and user value
4. Write each story independently
5. Note cross-story dependencies explicitly
