# Decisions

One line per non-obvious choice, with what was rejected.

- **A standalone app rather than a route inside the Forge LMS** · The session
  needed its own identity and its own entry, and the Forge's brand and login
  were explicitly released as constraints · Rejected: reusing the Forge shell,
  which capped how distinct the finale could feel and coupled it to a login.

- **Class-code entry, no accounts** · A student types the word on the wall and a
  name. Fifty-four people get in without a single password reset · Rejected:
  Google sign-in, which costs the first ten minutes of a 120-minute session and
  is the most common way a live class loses time.

- **The browser is authoritative; the server is a phase clock and a backup** ·
  Everything is deterministic and local, so the game survives a dead network in
  a lecture hall · Rejected: server-authoritative state, which turns one wifi
  failure into fifty-four stopped games.

- **A problem accepts more than one change** · Cleaning the document library and
  then building on it is the strongest play in the game and had to be
  expressible · Rejected: one answer per problem, which made the discount
  mechanic unreachable and the sequencing lesson unteachable.

- **₹40 lakh, not ₹60** · At four changes the most expensive possible plan was
  ₹44L, so a ₹60L budget never bound and money was decoration · Rejected:
  keeping the source brief's figure for fidelity at the cost of the constraint
  doing any work.

- **Costs are annual rupees, not abstract points** · A recurring salary against
  a one-off build is the actual tension a transformation owner faces · Rejected:
  implementation points, which hide that hiring costs the same again next year.

- **Faults are dealt only from what the student built** · A failure in a system
  they chose is theirs; a failure in one they did not is a quiz question ·
  Rejected: dealing a fault from a fixed deck by seat.

- **The overload fault is earned, not dealt** · It becomes eligible only once
  one person is named on more systems than they can carry · Rejected: making it
  random, which would let a well-spread plan be punished for nothing.

- **Constraint cards are dealt evenly by seat** · Neighbours get different
  problems, so the debrief has something to compare · Rejected: a hash, which
  clusters and leaves some cards unseen in a section.

- **The fault questions are free text with no options** · Naming a control is
  the one thing a menu would do for the student · Rejected: multiple choice,
  which tests recall rather than judgement.

- **The document shelf warns only after a question is asked** · The payroll file
  looks useful and nothing stops the student indexing it; the consequence
  arrives when they ask what Arun earns · Rejected: a warning at drop time,
  which teaches them to avoid a red badge rather than to think about a corpus.

- **The reference architecture is never shown to students in the app** · It is
  the instructor's reveal on the wall · Rejected: shipping it in the student
  bundle, where it is one devtools inspection away from being the answer key.

- **Names, not emails, and no tally on a student's own screen** · Shared
  surfaces show what a student chose to be called; the vote count lives on the
  wall · Rejected: showing a live private tally, which is anxiety rather than
  drama.

- **The clock never advances a phase** · The facilitator moves the room ·
  Rejected: auto-advance, which takes the room away from the person running it
  mid-sentence.
