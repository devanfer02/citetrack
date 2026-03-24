---
name: address-gemini-review
description: Pull recent GitHub PRs and address Gemini code review comments. Use this skill when the user wants to check PR reviews, fix Gemini feedback, resolve review comments, or address code review suggestions on their GitHub PRs. Also use when the user says "check PR comments", "fix review feedback", "address reviews", or "what did Gemini say".
---

# Address Gemini Code Review

This skill fetches recent GitHub PRs from `devanfer02/citetrack`, reads Gemini code review
comments, and helps address them by making the suggested fixes in the codebase.

## Repository

- **GitHub**: `devanfer02/citetrack`
- **CLI**: All operations use `gh` CLI

## Workflow

### Step 1: Fetch Recent PRs

List recent open PRs:

```bash
gh pr list --repo devanfer02/citetrack --limit 10
```

List recently merged PRs:

```bash
gh pr list --repo devanfer02/citetrack --state merged --limit 10
```

Show a specific PR's details:

```bash
gh pr view <PR_NUMBER> --repo devanfer02/citetrack
```

### Step 2: Fetch Review Comments

Get all review comments on a PR (includes Gemini and other reviewers):

```bash
gh api repos/devanfer02/citetrack/pulls/<PR_NUMBER>/comments
```

Get top-level PR reviews (approve/request changes/comment):

```bash
gh api repos/devanfer02/citetrack/pulls/<PR_NUMBER>/reviews
```

Get issue-level comments (non-inline):

```bash
gh api repos/devanfer02/citetrack/issues/<PR_NUMBER>/comments
```

### Step 3: Filter Gemini Comments

Gemini code review comments come from a bot account. Filter by identifying
the bot user. Common Gemini bot identifiers:

- Username contains `gemini` or `google-gemini`
- The `user.type` field is `"Bot"`
- The comment body often includes structured feedback with severity levels

When parsing comments, extract:
- **File path** (`path` field) — which file the comment is on
- **Line number** (`line` or `original_line` field) — which line
- **Diff hunk** (`diff_hunk` field) — surrounding code context
- **Body** (`body` field) — the actual review feedback
- **Severity** — Gemini often labels issues as `critical`, `high`, `medium`, `low`

### Step 4: Categorize and Prioritize

Group Gemini comments by severity and type:

| Priority | Types | Action |
|----------|-------|--------|
| **P0 — Fix now** | Bugs, security issues, crashes | Fix immediately |
| **P1 — Should fix** | Performance, error handling, logic issues | Fix in this PR |
| **P2 — Consider** | Style, naming, minor improvements | Fix if quick, else note for later |
| **P3 — Optional** | Nitpicks, suggestions, alternatives | Acknowledge, skip if not valuable |

### Step 5: Address Each Comment

For each comment that needs action:

1. **Read the file** at the referenced path and line
2. **Understand the suggestion** — what Gemini is asking to change and why
3. **Evaluate validity** — Gemini can be wrong. Check if the suggestion actually applies:
   - Does the suggested pattern match the project's conventions?
   - Is the "bug" actually a bug, or is Gemini misunderstanding context?
   - Does the performance suggestion matter at the project's scale?
4. **Make the fix** if valid, following the project's existing patterns
5. **Skip with reason** if invalid — explain to the user why the suggestion doesn't apply

### Step 6: Report Summary

After addressing comments, provide a summary:

```markdown
## Gemini Review Summary — PR #<NUMBER>

### Addressed
- [file:line] <what was fixed and why>
- [file:line] <what was fixed and why>

### Skipped (with reason)
- [file:line] <suggestion> — Skipped: <reason>

### Needs Discussion
- [file:line] <suggestion> — <why this needs human decision>
```

## Useful gh CLI Commands Reference

```bash
# List open PRs
gh pr list --repo devanfer02/citetrack

# View specific PR with diff
gh pr view <N> --repo devanfer02/citetrack
gh pr diff <N> --repo devanfer02/citetrack

# Get PR review comments (inline code comments)
gh api repos/devanfer02/citetrack/pulls/<N>/comments

# Get PR reviews (top-level approve/reject)
gh api repos/devanfer02/citetrack/pulls/<N>/reviews

# Get PR issue comments (conversation-level)
gh api repos/devanfer02/citetrack/issues/<N>/comments

# Filter comments by bot user with jq
gh api repos/devanfer02/citetrack/pulls/<N>/comments \
  --jq '[.[] | select(.user.type == "Bot" or (.user.login | test("gemini";"i")))]'

# Get just comment bodies with file context
gh api repos/devanfer02/citetrack/pulls/<N>/comments \
  --jq '.[] | select(.user.type == "Bot") | {path, line, body}'

# Reply to a review comment
gh api repos/devanfer02/citetrack/pulls/<N>/comments/<COMMENT_ID>/replies \
  -f body="Fixed in <commit_sha>"

# Check PR checks/status
gh pr checks <N> --repo devanfer02/citetrack
```

## Behavioral Rules

1. **Always fetch fresh data** — don't rely on cached PR state
2. **Show the user what Gemini said** before making changes — present the categorized list first
3. **Don't blindly apply all suggestions** — evaluate each against project conventions
4. **Preserve existing patterns** — if Gemini suggests a pattern that contradicts the project's established approach, flag it rather than changing
5. **Group related fixes** — if multiple comments touch the same file, batch the edits
6. **Ask before large refactors** — if a suggestion would require changes across many files, get user approval first
