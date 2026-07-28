# SESSION 3 · LAB SHEET

## Working with data, using AI

*Your name: ____________________ · Section: ____ · Work solo. Your AI tool of choice. Any model allowed; judging looks at your verification, never your tool.*

Files you need (section folder): `moxie_retail_oct2025.csv` · `stocks_lab_12.csv` · `sp500_financials.csv`. Two more files arrive later in class; don't go looking.

*(For the LMS: this is a Session 3 material, kind `lab-sheet`. The "SHIP" section at the end maps to a Session 3 submission form: three verified numbers + the move used for each + one thing AI got wrong.)*

---

### LAB 1 · Make sense of it (14 min)

Upload `moxie_retail_oct2025.csv` to your AI tool. Get oriented, nothing fancy.

1. How many rows? ____________
2. What date range? ____________
3. What does ONE row represent? __________________________
4. How many stores does Moxie run, and what are they? __________________________
5. Anything about the store list that surprises you? __________________________

### LAB 2 · Hidden truths (12 min)

Ask open questions. Treat every answer as a hypothesis, not a fact.

1. Prompt: "What stands out in this data? Give me three things." Write the two most interesting, as hypotheses:
   - H1: __________________________
   - H2: __________________________
2. Prompt: "Chart daily revenue for the month." What does the picture show that the table hid? __________________________
3. Prompt: "What is our most popular product?" Answer you got: ____________
4. Before the debrief: what did the AI have to decide, without asking you, to answer question 3? __________________________

### LAB 3 · Clean it. Ground it. Make it auditable. (16 min)

1. The hygiene scan, one prompt: "Scan this file for: duplicate rows or IDs, impossible values, missing fields, inconsistent labels, and rows that aren't real sales. Give me counts for each." What did it find? __________________________
2. In rupees: how much was October's revenue overstated by dirt alone? ____________
3. Pick ONE number the AI gave you in Lab 2. Rebuild it yourself with a pivot table in Google Sheets. Match? YES / NO. If no, why? __________________________
4. Ask AI to WRITE a Sheets formula: clean October revenue for one store of your choice, excluding cancellation invoices (they start with "CN") and zero-price rows, after discounts. Paste it in your sheet next to your pivot.
   - Formula result: ____________ · Pivot result: ____________ · Gap, and your explanation: __________________________
5. Stretch: ask for an Apps Script that flags every invoice above ₹1,00,000. Run it. How many flags? ____________

### LAB 4 · The trading desk (14 min)

Switch files: `stocks_lab_12.csv`. Twelve real US stocks, five real years, daily prices.

0. FIRST, before anything else, ask your AI exactly this: **"Before you answer anything: how exactly are you processing this file? Are you reading every row as text, or writing and running code against it?"** Its answer, in one line: __________________________
1. Best performer over the five years, and by how much: ____________ Worst: ____________ Then ask: "One chart, all twelve stocks, compared fairly." What did the AI choose to do with the axis or scale, and did it tell you? __________________________
2. Riskiest of the twelve (your definition, but say it): ____________ Safest: ____________
3. Prompt: "Find the single worst one-day fall for any of these stocks. What happened that day?" Stock and date: ____________ The AI's explanation: __________________________ Do you believe it? What would you check? __________________________
4. Prompt: "Based on this file, is Coca-Cola a bad investment?" What's the honest limit of what this file can say? __________________________
5. Stretch: switch to `sp500_financials.csv`. "What is the average P/E of the S&P 500?" Number you got: ______ Now ask for the median. ______ Which would you quote in an interview, and why? __________________________

### LAB 5 · Scale like an operator (12 min)

You get ONLY two small files for this one: a schema card and 100 sample rows of the FULL market file (619,040 rows, which you do not have).

1. Using only those two files, get your AI to write a script (or an exact plan) that would answer: "top five stocks by average daily volume across the full file." Paste your script's core line here: __________________________
2. Predict the winner before the reveal: ____________
3. After the reveal: was your approach right, even if your guess wasn't? What does that tell you? __________________________

### SHIP (before you leave)

LMS form: three numbers you verified today, the move you used for each, and one thing your AI told you that turned out wrong or incomplete. This files into your portfolio.

*The five verification moves, for reference: 1 Reconcile the base · 2 Recompute one number · 3 Bounds and smell · 4 Ask for the working · 5 Ask again, differently.*
