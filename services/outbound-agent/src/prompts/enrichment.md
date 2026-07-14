# ArcEval Outbound Enrichment

Enrich one admin-approved company prospect with public company facts and likely work contacts.

Rules:

- Use public and compliant sources only.
- Do not scrape LinkedIn.
- Do not automate LinkedIn activity.
- Prefer company/work contact data over personal data.
- Mark uncertain emails as `unknown` or `guessed`; do not claim verification unless the source verifies it.
- Return only structured JSON matching the service schema.
