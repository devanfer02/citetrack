---
name: ux-writing
description: Write or review user-facing copy for CiteTrack — UI strings, buttons, empty states, errors, loading messages, metadata (title/meta/OG), and marketing/landing prose. Trigger this skill whenever the user asks to add, change, review, or rewrite any text that ends up in front of a human, or when touching page <title>, meta tags, OpenGraph, microcopy, tooltips, error toasts, or hero/feature copy — even if they don't say "UX writing." Also trigger when reviewing existing copy that feels AI-generated, generic, or off-brand, and when writing new routes/pages where copy choices are non-trivial. The skill teaches the product voice, names the AI-default phrases to avoid, and gives surface-specific shapes for each kind of copy.
---

# UX Writing — CiteTrack

CiteTrack is a citation-tracing tool for Indonesian thesis students. The app already has a good voice: direct, practical, collaborative, with Indonesian academic terms woven in where they're the *real* name for the thing. This skill codifies that voice so new copy reinforces it instead of drifting into the generic AI-assistant register that makes a product feel forgettable.

## When this skill applies

Use it whenever you're about to type text that will be read by a user — including the parts people forget count as copy:

- Button labels, nav items, table headers
- Empty states, loading messages, tooltips, aria-labels
- Error banners, toast messages, validation strings
- Page `<title>`, meta descriptions, OpenGraph tags
- Marketing/landing prose, feature cards, hero copy
- Confirmation dialogs and destructive-action warnings

Don't use it for code comments, commit messages, PR bodies, or internal API error messages that no user will see.

## The voice, in one sentence

**A competent colleague handing you back your own work with the parts explained.**

That's it. Not a concierge, not a cheerleader, not a support agent. CiteTrack tells you what it did, what it found, and what to do next — in the fewest words that still feel human. The product knows academic writing is hard; it doesn't pretend otherwise and it doesn't sell positivity.

Three things that follow from this:

1. **We speak as "we."** "We extracted 247 citations" beats "247 citations were extracted." The user and the system are working together.
2. **Numbers over adjectives.** "Found 12 of 15" beats "most sources located." Specificity is the single biggest signal that a human — not a template — wrote the copy.
3. **Never fake-friendly.** No exclamation marks on success. No "Oops!" on errors. No "Awesome!" No emoji reactions to the user's own thesis.

## Principles, with CiteTrack examples

### 1. Every word earns its spot

Delete filler before you ship it. The copy below is from CiteTrack today and it's already tight; your job is to keep it that way.

- ✅ "Scanning for in-text citations..."
- ❌ "We are currently in the process of scanning your document for in-text citations, please wait..."

Common filler to cut:
- "in order to" → "to"
- "please note that" → (just say the thing)
- "click here to X" → "X" as the link text
- "due to the fact that" → "because"
- "at this point in time" → "now"

### 2. Write outcomes, not operations

Users care about what's true for them now, not what the system did internally.

- ✅ "Your citations are ready to review."
- ❌ "Citation parsing has completed successfully."

- ✅ "Found 12 of 15 source PDFs."
- ❌ "Source PDF fetch job finished."

### 3. Be consistent about names

Pick one name per concept and stick with it across the whole product. CiteTrack uses:

| Concept | Always call it |
|---|---|
| The user's uploaded document | "thesis" (not "document", "paper", "PDF" in prose — though "PDF" is fine for file-format specifics) |
| The reference list at the back | "references" or "Daftar Pustaka" when the academic context matters (not "bibliography") |
| An in-text citation | "citation" (not "quote", "reference" as noun, "cite") |
| The paper being cited | "source" or "source PDF" (not "target", "referenced paper") |
| A passage found in a source | "passage" (not "quote", "snippet", "excerpt") |

If you add a new concept, add it to this table.

### 4. CTAs are verbs that promise an outcome

- ✅ "Parse References →", "Match Citations →", "Find Passages with AI →"
- ❌ "Next", "Continue", "Submit", "Proceed", "OK"

Every forward CTA in CiteTrack ends with `→`; every back CTA starts with `←`. Keep it.

Secondary actions use plainer verbs: "Upload Another", "Start Over", "Retry", "Try Again". These aren't the main path, so they don't need arrows.

### 5. Errors: what happened, then what to do

An error message has exactly two jobs: tell the user what went wrong (specific enough that they believe you), and tell them the next move. Apology and blame-shifting are both noise.

- ✅ "Upload failed: file is 68 MB (limit is 50 MB). Compress the PDF or split it by chapter."
- ❌ "Oops! Something went wrong with your upload. Please try again."
- ❌ "Error: INVALID_FILE_SIZE"

When you genuinely can't diagnose it, say that, and give them a way out: "Something went wrong loading the preview." + Retry button. That's the pattern already in `PdfPreview.tsx`.

### 6. Loading messages name the actual work

Vague spinners feel like stalling. Specific ones feel like progress.

- ✅ "Scanning for in-text citations..."
- ✅ "Searching for source PDFs across DOI, Unpaywall, and Semantic Scholar..."
- ❌ "Processing..."
- ❌ "Please wait while we work our magic..."

Name the services you're hitting when it takes more than a couple of seconds; users are less anxious when they can see the shape of what's happening.

### 7. Empty states instruct, they don't apologize

- ✅ "No references found. The bibliography section could not be detected."
- ❌ "Oops, nothing here yet! 😊"

If there's a reason the space is empty, say it. If there's a next step the user can take, name it.

### 8. Keep contractions natural

We'll, we've, it's, you're, don't, can't — use them when speech would. Don't force them; don't avoid them. "Your citations are ready" and "We'll have your citations ready in a moment" are both fine.

## Writing for each surface

### Button labels
Verb-first, outcome-focused, Title Case. Keep under ~3 words. Put `→` on forward progress, `←` on back. Use sentence-case (not Title Case) only when the button is a full sentence ("Analyze another thesis" would be weird in title case).

### Table headers, nav items, section titles
Title Case. Noun phrases. Short. "Citation", "Occurrences", "Pages", "Source", "Status".

### Empty states
One line of what's true, one line of what to do. Two lines total. If there's no action, one line is fine.

### Tooltips & aria-labels
Describe the action in 2–4 words. Aria-labels complete the sentence "Click to ___": "Next page", "Zoom in", "Go to Citations". Don't repeat the visible label — complement it.

### Loading messages
Present continuous, end with `...`. Name the actual work. Under ~60 characters so they fit on small screens.

### Error panels
Three parts, in order: what happened (specific), why (if the user can act on it), what to do next. One sentence each, often collapsed into one paragraph. No exclamation marks; no "Oops!"; no bare error codes.

### Success / confirmation
State the result with a concrete number or object. Don't celebrate. "Found 12 of 15 source PDFs" is a perfect success message — the number does the work.

### Page `<title>`
50–60 characters. Most-distinctive word first, product name last, separated by ` — ` (em dash with spaces). "Review Citations — CiteTrack" is better than "CiteTrack | Review Citations". On the landing page only, an extra descriptor is fine: "CiteTrack — Citation Tracer".

### Meta description
150–160 characters. One sentence that describes what the user will actually do on the page, in the voice of the product. Include one search-relevant phrase naturally (e.g., "trace citations"), but don't keyword-stuff. Don't start with the company name.

- ✅ "Upload your thesis PDF and trace every citation back to its exact page and passage in the source — even across languages."
- ❌ "CiteTrack is the best citation tracer tool for students, researchers, academics. Try our citation tracing software today!"

### OpenGraph
`og:title` and `og:description` can be slightly bolder than SEO meta because they compete on a social feed, but they still must match the voice. Use the same title format as `<title>`; the description can be a tighter, more punchy version of the meta description.

### Hero / landing copy
The headline is one declarative sentence stating what the product lets the user do. The subhead adds one concrete detail that makes it believable. Feature cards are three parts each: title (2–3 words, Title Case), one sentence that names the specific behavior. Don't try to be clever; specificity is the hook.

## The AI-tell list

These are the phrases, shapes, and habits that make copy feel like it came out of a template. If you find yourself reaching for one of them, pick something else.

### Words and phrases to avoid by default

- **Hype**: seamless, powerful, robust, intuitive, elevate, empower, unlock, leverage, cutting-edge, game-changer, next-generation, world-class, best-in-class
- **Framing intros**: "In today's fast-paced world", "Let's dive into", "Let's explore", "In the realm of", "When it comes to"
- **Hedges without reason**: "may", "could", "might help", "can potentially"
- **Meta-commentary**: "It's important to note that", "It's worth mentioning", "As you can see"
- **Bootstrapped excitement**: "Exciting news!", "We're thrilled to announce", "You're going to love this"
- **Faux-humble apologies**: "Oops!", "Sorry about that!", "Our bad"
- **Call-to-nothing**: "Click here", "Learn more" without context, "Find out how"

### Shapes to avoid

- **The tricolon of mush**: "Fast, scalable, and reliable." Three adjectives with no evidence is the AI fingerprint.
- **"Not just X, but Y"**: this construction almost always signals that the writer didn't commit to what Y actually is.
- **Rhetorical question the writer then answers**: "What is a citation? A citation is…" — just say what it is.
- **Summary paragraph at the end** of every block of prose. Prose doesn't need to loop back; it can just stop.
- **Parallel sentence stacks**: "You can A. You can B. You can C." Vary the structure or cut some.
- **Over-punctuated lists** when a sentence would do.

### Em-dash discipline

CiteTrack's voice uses em-dashes deliberately (e.g., "CiteTrack — Citation Tracer"). That's good. The discipline:

- Use an em-dash for a real aside or a replacement phrase: "12 of 15 — the missing three were behind a paywall."
- Use a colon when you're introducing a list or explanation: "CiteTrack does three things:"
- Don't use an em-dash as a substitute for a comma, a semicolon, or sentence structure. If you have more than ~one em-dash per screen of prose, cut most of them.

## Language: English with Indonesian academic terms

CiteTrack's target audience is FILKOM skripsi students — Indonesian computer-science undergraduates writing their final thesis. The UI is English, but Indonesian academic terms appear where they're the real name for the concept.

### Keep Indonesian when:
- It's the actual term used in the thesis template or the institution (`Daftar Pustaka`, `Skripsi`, `FILKOM`). Swapping to "Bibliography" or "Thesis" actively hurts recognition — this is what the student's advisor calls it.
- It's a proper noun (institution names, university names).

### Default to English for:
- All CTAs, navigation, button labels, menu items.
- Instructional prose ("Upload your thesis...", "We'll extract text...").
- Error messages and validation.
- Metadata, page titles, meta descriptions.

### Mixing in a single sentence is fine if it's natural:
- ✅ "Detecting and parsing Daftar Pustaka..." — the verb is English, the object is Indonesian because that's what the reader knows it as.
- ❌ "Memeriksa your Daftar Pustaka..." — no code-switching in the middle of a phrase; pick one side per clause.

When in doubt: if you'd say it in English when talking to the student, write it in English. If you'd reach for the Indonesian word in conversation, use the Indonesian word.

## Before / after gallery

Calibrate with real CiteTrack-shaped copy.

### Meta description
- ❌ "CiteTrack is the ultimate AI-powered citation tracing platform, helping students and researchers unlock the full potential of their academic writing with powerful, intuitive tools."
- ✅ "Upload your thesis PDF and trace every citation back to its exact page and passage in the source — even across languages."

Why the fix works: names the action (upload, trace), names the concrete output (page and passage), and ends on the one unexpected capability (cross-language). No "powerful."

### Button label
- ❌ "Continue"
- ❌ "Submit for Processing"
- ✅ "Parse References →"

Why: the verb tells the user what will happen next, not which step number they're on.

### Error panel
- ❌ "Oops! Something went wrong. Please try again or contact support if the issue persists."
- ✅ "Upload failed: file is 68 MB (limit is 50 MB). Compress the PDF or split it by chapter."

Why: says exactly what failed, why it failed, and what the user can do without leaving the flow.

### Empty state
- ❌ "Nothing to see here yet! 🎉 Get started by uploading your first thesis."
- ✅ "No references found. The bibliography section could not be detected."

Why: one line of state, one line of cause. No celebration, no emoji, no imperative at the user while they're still figuring out what's wrong.

### Loading message
- ❌ "Working our magic... ✨"
- ✅ "Searching for source PDFs across DOI, Unpaywall, and Semantic Scholar..."

Why: names the actual work and the actual services, so a user who's been waiting 40 seconds trusts that progress is being made.

### Hero
- ❌ "Unlock the full potential of your academic citations with AI."
- ✅ "Trace every citation back to its source."

Why: declarative, concrete, believable. The AI capability can be mentioned later, as a mechanism, not as the sell.

### Success/confirmation
- ❌ "Amazing! We've successfully processed all your references! 🎉"
- ✅ "Parsed 247 references from your bibliography."

Why: the number is the success. Nothing else is needed.

## Self-check before you ship a string

Run this checklist on any copy you wrote or reviewed:

1. **Cut test.** Delete every word. If the sentence still makes sense, the word was filler — leave it cut.
2. **Specificity test.** Is there a number, a name, or a concrete object in here? If the whole sentence is abstract, find one real thing and put it in.
3. **AI-tell test.** Any of these present? *seamless, powerful, intuitive, unlock, elevate, empower, dive into, let's explore, it's important to note, oops, awesome.* If yes, rewrite.
4. **Voice test.** Read it out loud as if you were the colleague from the one-sentence voice. Does it sound like something that colleague would actually say? If it sounds like a brochure, it's wrong.
5. **Next-action test.** If this is an error or empty state, does it tell the user what to do next? If not, add it — or confirm that doing nothing is the right move and the copy reflects that.
6. **Consistency test.** Did you use one of the canonical names (thesis, references, citation, source, passage), or did you sneak in "document" / "paper" / "bibliography" / "quote"? Use the canonical name.
7. **Scan test.** Squint at the screen. Can a user who's glancing see what this thing does? The most important word should come first.

If a string passes all seven, ship it.
