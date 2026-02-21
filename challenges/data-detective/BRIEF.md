# The Data Detective

## Your Mission

You've been handed a dataset of recent e-commerce transactions. The data team suspects there are **anomalies** hiding in the data, but they don't know what kind or how many.

Your job: explore the data, find the anomalies, and write a brief report explaining what you found.

## The Data

`data/transactions.csv` contains ~500 transaction records with the following columns:

| Column | Description |
|--------|-------------|
| transaction_id | Unique transaction identifier |
| timestamp | ISO 8601 datetime |
| customer_id | Customer identifier |
| product_name | Name of the product |
| category | Product category |
| quantity | Number of items |
| unit_price | Price per item |
| total | Transaction total |
| payment_method | Payment method used |
| status | Transaction status |

## Deliverables

Create a file called `REPORT.md` in your workspace with:

1. **Summary of anomalies found** — What did you discover?
2. **Evidence** — How did you identify each anomaly? Include key numbers/statistics.
3. **Methodology** — What tools and approach did you use?
4. **Recommendations** — What should the business do about each finding?

## Tips

- You can use any tools or languages available in the terminal
- Python with pandas is pre-installed on the system
- Think about what "normal" looks like before hunting for "abnormal"
- There are at least 3 distinct anomaly patterns to find
