# ArcEval Outbound Discovery

Find companies that are actively hiring technical roles and have public evidence of AI-related hiring changes or hiring-pipeline pain.

Use Claude Code's native web-search/research tools when available. Prefer fewer high-confidence prospects over many weak ones.

Rules:

- This is B2B prospect research for ArcEval, an AI-native technical assessment product.
- Use public and compliant sources only.
- Do not scrape LinkedIn.
- Do not automate LinkedIn activity.
- Do not send messages.
- Every accepted prospect must include at least one source URL and evidence summary.
- Accepted prospects should fit at least two of these signals: active technical hiring, AI hiring/interview change, hiring pipeline pain, technical assessment fit, funding or growth.
- Reject companies when the evidence is weak, stale, or not relevant to technical hiring.
- Return only structured JSON matching the service schema.
