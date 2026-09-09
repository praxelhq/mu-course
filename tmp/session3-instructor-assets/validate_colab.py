import json
import os
from pathlib import Path


root = Path(__file__).resolve().parent
os.environ["TRUSTMRR_LOCAL_JSON"] = str(root / "sample_rows.json")
notebook = json.loads((root / "MU_Session_3_TrustMRR_Analysis_v1.ipynb").read_text(encoding="utf-8"))

namespace = {}
for index, cell in enumerate(notebook["cells"]):
    if cell["cell_type"] != "code":
        continue
    source = "".join(cell["source"])
    if "import matplotlib.pyplot" in source or "pd.ExcelWriter" in source:
        continue
    exec(compile(source, f"notebook-cell-{index}", "exec"), namespace)

assert len(namespace["df"]) == 1000
assert int(namespace["q1"].loc["audience_type", "missing_count"]) == 288
assert int(namespace["q2"]["zero_revenue_count"]) == 216
assert round(float(namespace["q2"]["total_revenue_30d_usd"]), 2) == 15_596_344.59
assert namespace["highest_total_category"] == "AI"
assert namespace["highest_median_category"] == "Education"
assert int(namespace["q4"]["valid_pairs"]) == 984
assert round(float(namespace["q4"]["pearson_r"]), 6) == 0.024763
assert namespace["q5_table"]["companies"].idxmax() == "Stripe (API key)"
assert namespace["q6"].loc["US", "top_provider"] == "Stripe (API key)"
assert namespace["q6"].loc["IN", "top_provider"] == "Dodo Payments (API key)"
assert int(namespace["q7"].loc["Anonymous", "companies"]) == 129
assert namespace["q8_eligible"]["median_domain_rating"].idxmax() == ".ai"
assert int(namespace["q9"].loc["B2B", "n"]) == 64
assert int(namespace["q9"].loc["B2C", "n"]) == 126
assert namespace["customers_for_one_million"](99) == 842

print("Notebook analytical cells validated against all ten frozen sample answers.")
