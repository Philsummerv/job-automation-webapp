# The BMAD team

Set up 2026-09-02. This folder is the team's workspace; the agents themselves
live in `.claude/agents/`.

BMAD is a development method, and it assumes the bottleneck is building. On this
project it is not — the product is live and has no users — so the standard roles
are here plus a **Growth** role, and the cycle starts with an audit rather than
a PRD.

## The roles

| Agent | Who | Use it for |
|---|---|---|
| `bmad-analyst` | Mary | Ground truth. What is actually true right now. Research. Briefs. |
| `bmad-growth` | Dana | Distribution, channels, copy. The role that matters most right now. |
| `bmad-ux` | Sally | Flows, mobile, in-app browser, empty states. |
| `bmad-pm` | John | PRDs, epics, sequencing, the cut list. |
| `bmad-architect` | Winston | File-level technical design before code. |
| `bmad-sm` | Bob | Turns one epic into one dev-ready story file. |
| `bmad-dev` | James | Implements exactly one story. |
| `bmad-qa` | Quinn | Reviews it adversarially. |

## The cycle

```
Mary (audit)  ┐
Dana (growth) ├─► John (PRD + sequence) ─► Winston (arch) ─► Bob (story)
Sally (UX)    ┘                                                  │
                                                                 ▼
                                              Quinn (review) ◄─ James (build)
```

Discovery runs in parallel. Build runs one story at a time — that is the point
of the method, not an accident of it.

## How to run it

```
Use the bmad-analyst agent to audit <thing>
Use the bmad-pm agent to turn docs/bmad/audit-x.md into a PRD
Use the bmad-sm agent to prepare story 1.1
Use the bmad-dev agent to implement docs/bmad/stories/1.1-*.md
Use the bmad-qa agent to review it
```

Run `/agents` to see or edit them.

## Rules the whole team inherits

- Write plainly. Short sentences, point first.
- State a concern in one sentence, then do the thing that was asked. Do not
  substitute a safer or different task.
- Never re-open: no Facebook automation; the tracker is free permanently; only
  Guided assist is paid ($12/mo from 2027-01-01); the sign-in email subject
  stays as it is.
- Nothing may risk sign-in email deliverability. Login and any other mail share
  one domain.

## Files

- `audit-*.md` — Mary
- `growth-*.md` — Dana
- `ux-*.md` — Sally
- `prd-*.md` — John
- `arch-*.md` — Winston
- `stories/*.md` — Bob writes, James fills the Dev Record, Quinn appends the QA Record
