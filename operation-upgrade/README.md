# Ninety Days at Bharat Bites

The Session 10 finale for *AI for Business: The Operating Stack* — a 120-minute
individual simulation for around 54 students a section.

A student is hired by Cutesh Ramanohan to change how his 25-outlet food business
works. They have ₹40 lakh a year and ninety days. Every problem in the business
can be answered by **hiring a person**, **building an AI system**, or
**changing the way the work happens** — each with a real annual cost, a week it
starts helping, and a risk. Then the world moves under their plan, something
they built fails, and they present one page to the board.

It is a standalone app with no accounts. A student opens the link, types the
word on the wall and a name, and plays.

## Run it

```bash
pnpm install
cp .env.example .env      # set JOIN_CODES and FACILITATOR_KEY
pnpm dev
```

The game works with no database at all — everything is computed and stored in
the browser. Attach Postgres (`DATABASE_URL`) and you additionally get the
facilitator's phase control, the wall display, and a backup of every board.

| Surface | Where | Who |
| --- | --- | --- |
| The game | `/` then `/play` | Students, with the code on the wall |
| Facilitator console | `/instructor` | Needs `FACILITATOR_KEY` |
| Wall display | `/wall?key=…&section=D` | Projector |

```bash
pnpm test        # 35 tests over the game engine
pnpm typecheck
pnpm build
```

## Why it is built this way

**The browser is authoritative while a student is playing.** Costs, dates, the
company brain's answers, the dealt cards, the memo — all of it is pure
functions in `lib/engine/`, run locally and saved to `localStorage`. The server
holds the facilitator's phase, the room aggregate for the wall, and a backup.
If the lecture-hall wifi dies mid-session, fifty-four students carry on and
sync when it returns. If the facilitator's console is unreachable, students
drive themselves rather than being stranded.

**Nothing is explained in the interface's own voice.** Every briefing is a
person — Cutesh setting the terms, Arun explaining the shelf, Priya reporting
what broke. Screens open with who is talking and what is still outstanding.

**Colour carries meaning and nothing else.** Hiring is terracotta, building is
indigo, changing the work is green. A plan that has gone all-in on AI is
visibly lopsided on the wall before anybody says so.

## The teaching

| Where | What it lands | How |
| --- | --- | --- |
| The company brain | Retrieval is a curation problem | Index both allergen guides and it answers wrongly, *with a correct citation* |
| The company brain | There is no private data in a corpus you chose | The payroll sheet is one drag away, and nothing warns you until you ask |
| The company brain | Untrusted sources become policy | A customer's invented refund rule, indexed, is repeated as fact |
| The decisions | Sequencing is cheaper, not slower | Clean the library first and the brain drops ₹9L → ₹7L and high risk → low |
| The decisions | Human gates need available humans | Name Arun on three systems and he goes on leave in week six |
| The plan | Evaluation is not the leftover budget | A second AI system makes testing compulsory, with the founder’s reason attached |
| The plan | The best AI decision is sometimes subtraction | The cheapest move on the board is to stop making four reports nobody reads |

## Content

Everything students read lives in `lib/content/` and is the single source of
truth for the printed pack too:

- `cast.ts` — Cutesh, Mariga, Arun, Priya and the rest, the mandate, the five rules
- `problems.ts` — seven problems, three options each, prices and unlocks
- `documents.ts` — the twelve-document shelf and every answer the brain can give
- `events.ts` — eight constraint cards and eight faults
- `radar.ts` — the take-home follow list

Bharat Bites is fictional. Every person, policy, number, incident and document
in it was written for teaching, and none of it describes a real company.
