# DATA README · SESSION 3 DATASETS

*For the LMS build: these are the actual files that get staged as Session 3 materials (kind: `dataset` / `schema-pack`). The CSVs themselves are too large to travel through the doc pipeline, so Pushpak drops them into this Drive folder directly; they were delivered in the working chat. This file tells you what each one is so you can seed materials metadata and previews correctly.*

## The nine files

| File | Size | Rows | What it is | Gate behaviour in class |
| --- | --- | --- | --- | --- |
| moxie_retail_oct2025.csv | 2.4 MB | 34,897 | Fictional-but-realistic jewellery brand (Moxie) October 2025 transactions, 5 stores, seeded with data-quality traps for teaching | Open at session start |
| stocks_lab_12.csv | 750 KB | 15,108 | REAL daily prices, 12 US stocks (AAPL MSFT AMZN GOOGL NVDA NFLX JPM KO XOM WMT GE EBAY), 2013–2018 | Open at session start |
| sp500_financials.csv | 95 KB | 503 | REAL S&P 500 valuation snapshot: sector, price, P/E, dividend yield, market cap | Open at session start |
| moxie_retail_fy2025_26.csv.gz | 4.2 MB (22 MB unzipped) | 309,804 | Moxie full financial year; alternate "wall demo" file | Instructor-only |
| all_stocks_5yr.csv.gz | 10 MB (29 MB unzipped) | 619,040 | REAL: all 505 S&P stocks, 5 years daily; THE "wall demo" file | Instructor-only |
| schema_stocks.txt | 1 KB | — | Schema card for the full stocks file (embedded below) | SEALED until Lab 5, mid-class release |
| stocks_sample_100.csv | 5 KB | 100 | First 100 real rows of the full stocks file | SEALED until Lab 5 |
| schema_moxie_fy.txt | 1 KB | — | Schema card for Moxie FY (embedded below) | Instructor-only |
| moxie_sample_100.csv | 7 KB | 100 | First 100 rows of Moxie FY | Instructor-only |

Provenance: stock prices via the public plotly/datasets mirror of the Kaggle S&P 500 dataset (real market data, split-adjusted, NOT spin-off-adjusted, no dividends). Valuation snapshot via the public datasets/s-and-p-500-companies-financials repo. Moxie files are generated fiction, seed-locked so every section sees identical numbers; the instructor answer keys live in the Session 3 run book (instructor-only, not in this folder).

## schema_stocks.txt (embedded copy)

```
SCHEMA CARD — US stock daily prices, full file
Table: all_stocks_5yr
Rows: 619,040 (too large to paste into a chat window; use this card + the 100-row sample instead)

Column  Type     Notes
date    date     YYYY-MM-DD, trading days only, 2013-02-08 to 2018-02-07
open    decimal  USD, split-adjusted. NOT adjusted for spin-offs or dividends
high    decimal  USD
low     decimal  USD
close   decimal  USD, split-adjusted. NOT adjusted for spin-offs or dividends
volume  integer  shares traded that day
Name    text     ticker symbol, 505 distinct (S&P 500 members as of 2018; delisted companies absent)

First 100 real rows are in stocks_sample_100.csv: enough for an AI to see formats
and edge cases without ingesting the full 29 MB / ~7.9M-token file.
```

## schema_moxie_fy.txt (embedded copy)

```
SCHEMA CARD — Moxie retail transactions, full financial year
Table: moxie_retail_fy2025_26
Rows: 309,804 (Apr 2025 to Mar 2026; too large to paste into a chat; use this card + the sample)

Column          Type     Notes
invoice_id      text     MX-##### sale; CN-##### cancellation (negative units mirror the sale)
date            date     DD-MM-YYYY
store           text     4 stores + Online; NOTE: Indiranagar appears under two spellings
product         text     7 jewellery categories + service lines (GIFT WRAP, SHIPPING FEE, POLISH CLOTH at 0)
units           integer  negative on cancellation rows
unit_price_inr  integer  INR; can be 0 (freebies); at least one fat-finger entry exists
discount_pct    integer  0/5/10/15
customer_id     text     ~22% blank (walk-in / unlinked)
payment         text     UPI, Card, Cash, BNPL
```

First 100 real rows in moxie_sample_100.csv.

## LMS build notes

1. These map directly onto the Material + Gate system: three student files open at session start, the schema pack sealed until the instructor flips its gate mid-class (Lab 5's reveal moment), instructor-only files never gated open to students.
2. The Session 3 "SHIP" submission (see 07_session3_lab_sheet.md) is the `data-memo` assignment for this session.
3. CSV in-browser preview (first 100 rows) matters most for exactly these files.
