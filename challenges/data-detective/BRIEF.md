# The Data Detective

## Using Claude Code

Open your terminal and type `claude` to launch your AI assistant. Use it to write analysis scripts, interpret statistical output, suggest what to look at next, and help you structure your findings. The most effective approach here is iterative: explore broadly, find something interesting, ask the AI to help you quantify it, then move on to the next thread.

## Your Mission

You've been handed a dataset of recent e-commerce transactions. The data team suspects there are anomalies hidden in the data — but they don't know what kind or how many. Your job: explore the data systematically, identify the anomalies, and write a findings report that a business team could act on.

## The Data

`data/transactions.csv` contains ~500 transaction records:

| Column | Description |
|--------|-------------|
| transaction_id | Unique transaction identifier |
| timestamp | ISO 8601 datetime |
| customer_id | Customer identifier |
| product_name | Name of the product |
| category | Product category |
| quantity | Number of items |
| unit_price | Price per item |
| total | Transaction total (quantity × unit_price) |
| payment_method | Payment method used |
| status | Transaction status |

## Getting Started

```bash
# Python 3 with pandas is available
python3 -c "import pandas as pd; df = pd.read_csv('data/transactions.csv'); print(df.shape)"
```

Start with broad exploration before going narrow:

```python
import pandas as pd
df = pd.read_csv('data/transactions.csv')
print(df.describe())
print(df.dtypes)
print(df.isnull().sum())
```

## What to Look For

Anomalies can take many forms. A thorough investigation considers multiple angles:

- **Arithmetic integrity** — do calculated fields agree with their components?
- **Statistical outliers** — which values are far outside the normal distribution for their column or category?
- **Temporal patterns** — are there unusual clusters of activity or gaps in the timestamps?
- **Behavioural patterns** — do any customers, products, or payment methods behave very differently from the norm?

There are **at least 3 distinct anomaly patterns** embedded in this dataset. Quality of evidence and reasoning matters more than quantity of findings.

## Deliverable

Create `REPORT.md` using the template in `REPORT_TEMPLATE.md`. Your report should be concrete and actionable — assume you're presenting to a non-technical business team that will decide whether to escalate each finding.

## What's Being Evaluated

- How systematically and thoroughly you explore the data before drawing conclusions
- Whether you support each finding with specific numbers and statistics, not just assertions
- The clarity and actionability of your recommendations
- How you use the AI assistant to accelerate your analysis — ask it to help write scripts, explain statistical concepts, and draft sections of your report
