import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "MU_Session_3_TrustMRR_Analysis_v1.ipynb"


def markdown(source):
    return {"cell_type": "markdown", "metadata": {}, "source": source.splitlines(keepends=True)}


def code(source):
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": source.splitlines(keepends=True),
    }


cells = [
    markdown("""# Session 3 · TrustMRR analysis with Google Colab

Use this notebook when the dataset is too large or inconvenient to paste into an LLM.

**What it does**

- reads either the frozen 1,000-row sheet or the frozen full sheet directly from Google Sheets;
- answers the same ten analytical questions with reproducible Python;
- produces a small visualization set;
- keeps the raw data inside your authenticated MU Google/Colab session.

**Run order:** choose a dataset below, then use **Runtime → Run all**. Sign in with your MU Google account when Colab asks.

Source snapshots frozen on 30 July 2026. Do not make this notebook public while it contains or processes TrustMRR data.
"""),
    code("""# Choose "sample" for the graded 1,000-row exercise or "full" for the scale demonstration.
DATASET = "sample"  # @param ["sample", "full"]

SHEETS = {
    "sample": {
        "url": "https://docs.google.com/spreadsheets/d/12Gl5MxibqaVOhLowNZotoapufn7UmQen34OVX0J-lKA/edit",
        "tab": "TrustMRR 1,000-Row Dataset",
    },
    "full": {
        "url": "https://docs.google.com/spreadsheets/d/1w2sQHU6z8E_OEQVBskfoxmS1wn_7XERH43UBGJPMMOk/edit",
        "tab": "TrustMRR Full Dataset",
    },
}

# Used only by the automated local test. Leave it untouched in Colab.
import os
LOCAL_JSON_PATH = os.environ.get("TRUSTMRR_LOCAL_JSON")
"""),
    code("""import json
import math
import re
from urllib.parse import urlparse

import numpy as np
import pandas as pd

pd.set_option("display.max_columns", 50)
pd.set_option("display.float_format", lambda value: f"{value:,.4f}")

EXPECTED_COLUMNS = [
    "record_id", "startup_name", "trustmrr_url", "website", "country",
    "x_followers", "payment_provider", "revenue_30d_usd", "revenue_3m_usd",
    "revenue_12m_usd", "revenue_all_time_usd", "revenue_growth_30d_pct",
    "mrr_usd", "mrr_growth_30d_pct", "active_subscriptions", "visitors_30d",
    "revenue_per_visitor_usd", "value_proposition", "problem_solved",
    "pricing_model", "target_persona", "audience_type", "category",
    "markets_json", "domain", "domain_rating", "on_sale", "asking_price_usd",
    "revenue_multiple",
]

NUMERIC_COLUMNS = [
    "x_followers", "revenue_30d_usd", "revenue_3m_usd", "revenue_12m_usd",
    "revenue_all_time_usd", "revenue_growth_30d_pct", "mrr_usd",
    "mrr_growth_30d_pct", "active_subscriptions", "visitors_30d",
    "revenue_per_visitor_usd", "domain_rating", "asking_price_usd",
]


def spreadsheet_id(url):
    match = re.search(r"/spreadsheets/d/([A-Za-z0-9_-]+)", url)
    if not match:
        raise ValueError("Not a valid Google Sheets URL")
    return match.group(1)


def load_rows_from_google_sheet(url, tab):
    from google.colab import auth
    import google.auth
    from googleapiclient.discovery import build

    auth.authenticate_user()
    credentials, _ = google.auth.default()
    service = build("sheets", "v4", credentials=credentials, cache_discovery=False)
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id(url),
        range=f"'{tab}'!A:AC",
        valueRenderOption="UNFORMATTED_VALUE",
    ).execute()
    return result.get("values", [])


def load_dataset(dataset_key):
    if dataset_key not in SHEETS:
        raise ValueError(f"DATASET must be one of {list(SHEETS)}")

    if LOCAL_JSON_PATH:
        with open(LOCAL_JSON_PATH, encoding="utf-8") as handle:
            rows = json.load(handle)
    else:
        source = SHEETS[dataset_key]
        rows = load_rows_from_google_sheet(source["url"], source["tab"])

    if not rows:
        raise ValueError("The selected sheet returned no data")
    header = rows[0]
    if header != EXPECTED_COLUMNS:
        raise ValueError(f"Schema mismatch. Expected 29 frozen columns; received {header}")

    normalized = [row + [None] * (len(header) - len(row)) for row in rows[1:]]
    frame = pd.DataFrame(normalized, columns=header)
    for column in NUMERIC_COLUMNS:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame["on_sale_bool"] = frame["on_sale"].astype(str).str.strip().str.lower().isin(["true", "1", "yes"])
    frame["identity_group"] = np.where(frame["startup_name"].eq("Stealth Company"), "Anonymous", "Named")
    frame["domain_tld"] = frame["domain"].astype("string").str.lower().str.extract(r"(\\.[^.]+)$", expand=False)
    frame["revenue_multiple_num"] = pd.to_numeric(
        frame["revenue_multiple"].astype("string").str.lower().str.replace("x", "", regex=False),
        errors="coerce",
    )
    return frame


df = load_dataset(DATASET)
MIN_GROUP_ROWS = math.ceil(len(df) * 0.01)
TOP_REVENUE_ROWS = 10 if DATASET == "sample" else math.ceil(len(df) * 0.01)

print(f"Loaded {len(df):,} rows × {len(EXPECTED_COLUMNS)} source columns from {DATASET!r}.")
print(f"Minimum group size: {MIN_GROUP_ROWS:,}; revenue concentration group: {TOP_REVENUE_ROWS:,} rows.")
df.head(3)
"""),
    markdown("""## Question 1 · Audit the dataset

Report total rows, duplicate `record_id` values, missing counts and percentages for the four required columns, and the field with the most missing data.
"""),
    code("""audit_columns = ["country", "audience_type", "category", "domain"]
q1 = pd.DataFrame({
    "missing_count": df[audit_columns].isna().sum(),
    "missing_pct": df[audit_columns].isna().mean() * 100,
})

print(f"Rows: {len(df):,}")
print(f"Duplicate record_id values beyond the first occurrence: {df['record_id'].duplicated().sum():,}")
print(f"Most missing: {q1['missing_count'].idxmax()}")
q1
"""),
    markdown("""## Question 2 · Revenue concentration

For the sample, the top group is exactly 10 rows. In full-sheet mode it becomes the top 1% of rows.
"""),
    code("""revenue_30d = df["revenue_30d_usd"].fillna(0)
total_revenue_30d = revenue_30d.sum()
top_revenue = revenue_30d.nlargest(TOP_REVENUE_ROWS).sum()
q2 = pd.Series({
    "zero_revenue_count": int(revenue_30d.eq(0).sum()),
    "zero_revenue_pct": revenue_30d.eq(0).mean() * 100,
    "total_revenue_30d_usd": total_revenue_30d,
    "top_group_rows": TOP_REVENUE_ROWS,
    "top_group_revenue_share_pct": top_revenue / total_revenue_30d * 100 if total_revenue_30d else np.nan,
})
q2.to_frame("result")
"""),
    markdown("""## Question 3 · Product categories

Blank categories are excluded. Median comparison is limited to categories meeting the minimum group size.
"""),
    code("""category_rows = df[df["category"].notna() & df["category"].astype(str).str.strip().ne("")]
q3_table = (
    category_rows.groupby("category", dropna=False)
    .agg(
        companies=("record_id", "count"),
        total_revenue_30d_usd=("revenue_30d_usd", "sum"),
        median_revenue_30d_usd=("revenue_30d_usd", "median"),
    )
    .sort_values("total_revenue_30d_usd", ascending=False)
)
highest_total_category = q3_table["total_revenue_30d_usd"].idxmax()
eligible_categories = q3_table[q3_table["companies"] >= MIN_GROUP_ROWS]
highest_median_category = eligible_categories["median_revenue_30d_usd"].idxmax()

print("Highest total:", highest_total_category)
print("Highest eligible median:", highest_median_category)
q3_table.head(15)
"""),
    markdown("""## Question 4 · X followers and 90-day revenue

Pearson correlation measures linear association. It does not establish causation.
"""),
    code("""q4_pairs = df[["x_followers", "revenue_3m_usd"]].dropna()
q4 = pd.Series({
    "valid_pairs": len(q4_pairs),
    "pearson_r": q4_pairs["x_followers"].corr(q4_pairs["revenue_3m_usd"]),
})
q4.to_frame("result")
"""),
    markdown("""## Question 5 · Payment providers

Blank providers are excluded. Each remaining distinct cell label is treated as one provider.
"""),
    code("""provider_rows = df[df["payment_provider"].notna() & df["payment_provider"].astype(str).str.strip().ne("")]
q5_table = (
    provider_rows.groupby("payment_provider")
    .agg(
        companies=("record_id", "count"),
        total_revenue_30d_usd=("revenue_30d_usd", "sum"),
    )
    .sort_values(["companies", "total_revenue_30d_usd"], ascending=False)
)
print("Most companies:", q5_table["companies"].idxmax())
print("Most 30-day revenue:", q5_table["total_revenue_30d_usd"].idxmax())
q5_table
"""),
    markdown("""## Question 6 · US and India payment preferences

Provider percentage uses all companies in that country as the denominator.
"""),
    code("""def country_provider_summary(frame, country_code):
    country_rows = frame[frame["country"].eq(country_code)]
    provider_counts = country_rows["payment_provider"].dropna().value_counts()
    if provider_counts.empty:
        return pd.Series({"companies": len(country_rows), "top_provider": None, "provider_count": 0, "provider_pct": np.nan})
    top_provider = provider_counts.index[0]
    provider_count = int(provider_counts.iloc[0])
    return pd.Series({
        "companies": len(country_rows),
        "top_provider": top_provider,
        "provider_count": provider_count,
        "provider_pct": provider_count / len(country_rows) * 100 if len(country_rows) else np.nan,
    })

q6 = pd.DataFrame({code: country_provider_summary(df, code) for code in ["US", "IN"]}).T
q6
"""),
    markdown("""## Question 7 · Anonymous and named startups

`Anonymous` means `startup_name` is exactly `Stealth Company`.
"""),
    code("""q7 = (
    df.groupby("identity_group")
    .agg(
        companies=("record_id", "count"),
        total_revenue_30d_usd=("revenue_30d_usd", "sum"),
        average_revenue_30d_usd=("revenue_30d_usd", "mean"),
    )
)
q7["company_pct"] = q7["companies"] / len(df) * 100
q7["revenue_pct"] = q7["total_revenue_30d_usd"] / df["revenue_30d_usd"].sum() * 100
q7[["companies", "company_pct", "total_revenue_30d_usd", "revenue_pct", "average_revenue_30d_usd"]]
"""),
    markdown("""## Question 8 · Domain TLD and domain rating

TLD is derived from the final suffix of `domain`. Only TLDs meeting the minimum group size are compared.
"""),
    code("""q8_table = (
    df[df["domain_tld"].notna()]
    .groupby("domain_tld")
    .agg(
        companies=("record_id", "count"),
        median_domain_rating=("domain_rating", "median"),
        mean_domain_rating=("domain_rating", "mean"),
    )
)
q8_eligible = q8_table[q8_table["companies"] >= MIN_GROUP_ROWS].sort_values("median_domain_rating", ascending=False)
print("Highest eligible median:", q8_eligible["median_domain_rating"].idxmax())
q8_eligible
"""),
    markdown("""## Question 9 · On-sale B2B and B2C revenue multiples

The `x` suffix is removed before calculating mean and median. Rows must be on sale and have a nonblank numeric multiple.
"""),
    code("""q9_rows = df[
    df["on_sale_bool"]
    & df["audience_type"].isin(["B2B", "B2C"])
    & df["revenue_multiple_num"].notna()
]
q9 = q9_rows.groupby("audience_type").agg(
    n=("record_id", "count"),
    mean_multiple=("revenue_multiple_num", "mean"),
    median_multiple=("revenue_multiple_num", "median"),
)
q9
"""),
    markdown("""## Question 10 · Design an indie hacker’s path to $1 million

Use at least four findings from Questions 2–9. The helper below checks the pricing arithmetic; your recommendation still requires judgment.
"""),
    code("""def customers_for_one_million(monthly_price_usd):
    annual_revenue_per_customer = monthly_price_usd * 12
    return math.ceil(1_000_000 / annual_revenue_per_customer)

pricing_scenarios = pd.DataFrame({
    "monthly_price_usd": [29, 49, 99, 199, 499],
})
pricing_scenarios["annual_revenue_per_customer_usd"] = pricing_scenarios["monthly_price_usd"] * 12
pricing_scenarios["customers_for_1m_arr"] = pricing_scenarios["monthly_price_usd"].map(customers_for_one_million)
pricing_scenarios
"""),
    markdown("""### Write the recommendation

In no more than 250 words, specify:

1. product category;
2. B2B or B2C audience;
3. customer geography;
4. payment provider;
5. one specific problem;
6. pricing and customers required for $1M annual revenue;
7. at least four calculated findings from Questions 2–9;
8. one attractive signal—followers, category revenue or TLD—that should not be followed blindly, with a reason.
"""),
    markdown("""## Visualization lab

These charts answer different questions. Use them as a starting point, then decide which visual best supports the business decision.
"""),
    code("""import matplotlib.pyplot as plt
import seaborn as sns

sns.set_theme(style="whitegrid")

fig, axes = plt.subplots(2, 2, figsize=(16, 11))

plot_revenue = df["revenue_30d_usd"].fillna(0)
sns.histplot(np.log1p(plot_revenue), bins=35, ax=axes[0, 0], color="#C56A2D")
axes[0, 0].set(title="30-day revenue distribution", xlabel="log(1 + 30-day revenue USD)")

category_plot = q3_table.head(10).sort_values("total_revenue_30d_usd")
category_plot["total_revenue_30d_usd"].plot.barh(ax=axes[0, 1], color="#1E4D43")
axes[0, 1].set(title="Top categories by total 30-day revenue", xlabel="USD", ylabel="")

scatter = q4_pairs[q4_pairs["revenue_3m_usd"].ge(0) & q4_pairs["x_followers"].ge(0)]
axes[1, 0].scatter(np.log1p(scatter["x_followers"]), np.log1p(scatter["revenue_3m_usd"]), alpha=0.35, color="#1E4D43")
axes[1, 0].set(title="Followers vs 90-day revenue", xlabel="log(1 + X followers)", ylabel="log(1 + 90-day revenue USD)")

sns.boxplot(data=q9_rows, x="audience_type", y="revenue_multiple_num", ax=axes[1, 1], color="#D9CBB7", showfliers=False)
axes[1, 1].set(title="On-sale revenue multiples", xlabel="Audience", ylabel="Revenue multiple")

plt.tight_layout()
plt.show()
"""),
    markdown("""## Export compact results

This saves only aggregate answers—never raw rows—to a small Excel workbook in the Colab runtime.
"""),
    code("""with pd.ExcelWriter("trustmrr_session3_aggregate_results.xlsx") as writer:
    q1.to_excel(writer, sheet_name="Q1 Audit")
    q2.to_frame("result").to_excel(writer, sheet_name="Q2 Revenue")
    q3_table.to_excel(writer, sheet_name="Q3 Categories")
    q4.to_frame("result").to_excel(writer, sheet_name="Q4 Correlation")
    q5_table.to_excel(writer, sheet_name="Q5 Providers")
    q6.to_excel(writer, sheet_name="Q6 Geography")
    q7.to_excel(writer, sheet_name="Q7 Identity")
    q8_eligible.to_excel(writer, sheet_name="Q8 TLD")
    q9.to_excel(writer, sheet_name="Q9 Multiples")
    pricing_scenarios.to_excel(writer, sheet_name="Q10 Pricing", index=False)

print("Saved trustmrr_session3_aggregate_results.xlsx")
"""),
]

notebook = {
    "cells": cells,
    "metadata": {
        "accelerator": "CPU",
        "colab": {"name": "MU Session 3 TrustMRR Analysis v1.ipynb", "provenance": []},
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3"},
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}

OUTPUT.write_text(json.dumps(notebook, indent=1), encoding="utf-8")
print(OUTPUT)
