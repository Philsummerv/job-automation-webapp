# Chatbot disclaimer copy + Terms paragraph

Written 2026-08-29, for the planned unemployment-questions chatbot. Nothing here
is live yet. Paste the Terms section in when the bot actually ships — don't add
it before, or the Terms describe a feature that doesn't exist.

The whole safety plan is three things working together:

1. The bot never invents an answer. It reads from a file you wrote, and every
   answer shows where it came from and when you checked it.
2. A watermark on every answer, so a screenshot still says what it is.
3. Some questions get refused outright.

---

## 1. The gate (first time they open the chat)

Shown once per session, with a button. Nothing happens until they click.

> **Read this first.**
>
> I'm a helper for finding your state's job-search rules. I'm not a lawyer and
> I'm not the unemployment office.
>
> Everything I tell you comes from your state's own published pages, and I'll
> always show you the link so you can check it yourself. Rules change, and I
> might be out of date.
>
> For anything about your own claim — whether you qualify, how much you get, a
> letter you were sent — call your state office. I can't help with that and I
> won't try.

Button: **Got it**

---

## 2. The bar (always visible, above the text box)

Never goes away. Not dismissible.

> Not legal advice. Not the unemployment office. Always check the source link.

Small grey text. Should still be readable in a screenshot.

---

## 3. The watermark (on every single answer)

This is the important one. People screenshot answers and paste them into
Facebook groups, and whoever sees that screenshot never saw the gate.

The watermark has to be **part of the answer bubble itself** — real text in the
card, not a tooltip, not something on hover, not a footer somewhere else on the
page. If it isn't inside the bubble, it won't be in the screenshot.

Top of every answer bubble, small grey text:

> JobAssistUI — general info, not legal advice

Bottom of every answer that has a rule or a number:

> Source: New York State DOL Claimant Handbook — checked August 2026
> dol.ny.gov/unemployment-insurance-claimant-handbook

**Print the web address as plain text, not just a link.** A screenshot loses
the link but keeps the words. Someone looking at a reposted screenshot should
still be able to go find the page themselves.

Fill the source name, address, and date from the `source_url` and `verified_on`
fields on the row that answered the question. Never hardcode a date.

---

## 4. When there's no answer in your file

> I don't have that one. I only answer from pages I've actually checked, and
> this isn't one of them.
>
> Your best bet is New York State DOL directly: 1-888-209-8124.

Swap the state and number from the same data row. Never guess, never let the
model fill this in.

---

## 5. When the question is on the refuse list

Triggers on: will I qualify, how much will I get, appeals, overpayments, fraud,
or anything about a letter they got.

> That one I have to leave alone. Questions about your own claim — whether you
> qualify, what you're owed, an appeal, or a letter you were sent — only the
> state can answer, and a wrong answer from me could cost you money.
>
> New York State DOL: 1-888-209-8124.
>
> I can still help with the general rules if you want to ask something else.

This is a hardcoded check that runs before anything else. Not a judgment call
the model makes.

---

## 6. Terms of Service — new section

Goes in `apps/web/app/terms/page.tsx` as a new **section 3**, right after
"2. You are the actor". Sections 3 through 10 then become 4 through 11.

Also bump the `updated=` date on the `LegalPage` component at the top.

```jsx
      <h2>3. The question helper</h2>
      <p>
        The Service includes a question helper (the &quot;Assistant&quot;) that
        answers general questions about state job-search requirements. The
        Assistant provides general information only. It does not provide legal
        advice, benefits advice, or advice about your individual claim, and
        using it does not create any professional relationship between you and
        us.
      </p>
      <p>
        Answers are drawn from publicly available state agency publications.
        Each answer shows its source and the date we last checked it. We do not
        guarantee that any answer is current, complete, or correct for your
        situation. Rules vary by state and change over time, and you are
        responsible for confirming anything you rely on against your state
        agency&apos;s own published rules.
      </p>
      <p>
        The Assistant will not answer questions about your individual claim,
        including whether you qualify for benefits, benefit amounts, appeals,
        overpayments, or correspondence you have received. Direct those
        questions to your state agency.
      </p>
      <p>
        <strong>
          JobAssistUI is not affiliated with, endorsed by, or acting on behalf
          of any state agency, any state department of labor, or the United
          States Department of Labor.
        </strong>{" "}
        We are an independent tool.
      </p>
```

---

## 7. Landing page, if the bot is public

One line under the chat box, so people know before they start:

> Free. No account needed. Answers come from your state's own published pages,
> with the link every time.
