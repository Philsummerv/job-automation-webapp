# Auth email settings

The templates live in the Supabase dashboard, not in this repo. This folder is
the versioned copy of what should be pasted there, so the next person doesn't
have to reverse-engineer it from a received email.

## Sender identity
Supabase → Project Settings → Authentication → SMTP Settings

| Field | Value |
| --- | --- |
| Sender name | `JobAssistUI` |
| Sender email | `login@jobassistui.com` |

**The sender name was `ApplyAssistUI` until 2026-08-19** — the pre-rename product
name, which matched neither the sending domain nor the site. A display name that
disagrees with the domain is a phishing signal to filters and a trust problem for
users, and it is the most likely single contributor to Gmail spam-filing the
sign-in mail.

## Templates
Supabase → Authentication → Emails. Paste `otp-code.html` into **both**:

| Template | Subject |
| --- | --- |
| Confirm signup | `Your JobAssistUI sign-in code` |
| Magic Link | `Your JobAssistUI sign-in code` |

Supabase chooses between them by account state (new address vs. existing user),
so both must carry the same body or half of all users get the wrong experience.

The old subject was `Confirm your email address` — generic, brand-free, and
indistinguishable from the phishing template it resembles.

## Deliverability status (2026-08-19)
Verified live: SPF, DKIM and DMARC all PASS (Gmail headers + mail-tester).
SpamAssassin scores -1.1, well clear of the -5 spam threshold. Remaining
negatives are reputation, not configuration:

- The Amazon SES shared IP is listed on SpamCop and Yellow on Hostkarma. It is
  Resend's shared infrastructure, **not delistable by us**. A dedicated IP is a
  paid Resend feature and is not worth it at this volume.
- `jobassistui.com` is a new domain with almost no sending history. This only
  improves with consistent sending and recipient engagement.

Because the flow uses a typed code and not a link, a spam-filed email is an
annoyance rather than a dead end — the user can read the code out of the spam
folder. The login page says so explicitly.
