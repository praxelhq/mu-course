# Session 3 visualization check · learner-safe accessible artifacts

**Artifact set version:** `S3-VIZ-A11Y-v1`  
**Audience:** learners, facilitators and assistive-technology users  
**Key boundary:** this file contains no correct-option IDs, scores or rationales  
**Use:** display the matching artifact beside each scenario before shuffling the answer choices

These compact tables are the required non-image equivalents. They expose the data shape and reading task without identifying which candidate chart is best. A future rendered chart panel may supplement, but must not replace, the matching table and text description.

## `S3-VIZ-01-A11Y@1` · ranked startup comparison

**Text alternative:** Twenty named startups each have one snapshot revenue value in USD. Values range from $600 to $29,800; several names are long, and the reader must locate the five largest values. There is no date sequence. Country is present but is not the requested comparison.

| Example startup | Revenue, last 30 days (USD) |
|---|---:|
| Atlas Forms | 29,800 |
| BriefPilot | 21,400 |
| CartSignal | 18,900 |
| DeskMint | 11,250 |
| EchoKit | 8,700 |

*Table is an illustrative slice, not the complete 20-record scenario and not TrustMRR row data.*

## `S3-VIZ-02-A11Y@1` · traffic and revenue relationship

**Text alternative:** Each complete record contributes two quantitative values: visitors in the last 30 days and revenue in the same 30 days. The sample includes a dense low-value cluster, two high-visitor records with modest revenue, and one high-revenue outlier. Some source records are missing one of the two fields.

| Illustrative record | Visitors, 30d | Revenue, 30d (USD) |
|---|---:|---:|
| R1 | 1,200 | 900 |
| R2 | 4,800 | 3,600 |
| R3 | 9,500 | 4,100 |
| R4 | 11,000 | 17,500 |
| R5 | 24,000 | 6,300 |

## `S3-VIZ-03-A11Y@1` · skewed MRR distribution

**Text alternative:** MRR is quantitative and strongly right-skewed. Many records are zero or below $1,000, fewer sit between $1,000 and $10,000, and a small tail is above $50,000. Zero is a valid observed value in this scenario, not missing data.

| MRR range (USD) | Illustrative count |
|---|---:|
| Exactly 0 | 31 |
| 1–999 | 42 |
| 1,000–9,999 | 19 |
| 10,000–49,999 | 6 |
| 50,000+ | 2 |

## `S3-VIZ-04-A11Y@1` · growth around zero

**Text alternative:** Each category has one median 30-day revenue-growth percentage from a snapshot. Values can be below or above zero; the comparison needs direction and magnitude. These are not dated observations of a time series.

| Category | Median revenue growth, 30d |
|---|---:|
| Analytics | +18% |
| Commerce | +6% |
| Developer tools | 0% |
| Productivity | −7% |
| Marketing | −14% |

## `S3-VIZ-05-A11Y@1` · provider frequency

**Text alternative:** The field is categorical and the task is to compare record counts. Labels include individual providers, combined strings and missing values. A combined label such as “Stripe + Paddle” has not been split into two records in this table.

| Payment-provider label | Illustrative record count |
|---|---:|
| Stripe | 58 |
| Lemon Squeezy | 21 |
| Paddle | 14 |
| Stripe + Paddle | 7 |
| Other named labels | 16 |
| Missing | 4 |

## `S3-VIZ-06-A11Y@1` · MRR distributions by audience

**Text alternative:** Three audience groups contain unequal numbers of MRR observations. Every group is right-skewed and contains outliers. The task is to compare centre, spread and unusual values while keeping group size visible.

| Audience | Complete n | Median MRR (USD) | Middle 50% (USD) | Largest observed (USD) |
|---|---:|---:|---:|---:|
| B2B | 84 | 2,400 | 700–8,900 | 94,000 |
| B2C | 39 | 900 | 150–3,200 | 31,000 |
| Both | 27 | 1,700 | 400–6,100 | 57,000 |

## Release and rendering checks

- Keep artifact IDs and versions unchanged for all attempts using `assess_s3_visuals_v1`.
- Shuffle only the answer choices; never shuffle or relabel the data values inside an artifact.
- Do not add captions such as “best chart,” “right answer” or keyed option IDs to learner surfaces.
- Announce units, signs, missingness and table headers to screen-reader users.
- Do not encode positive/negative or pass/fail meaning by colour alone.
