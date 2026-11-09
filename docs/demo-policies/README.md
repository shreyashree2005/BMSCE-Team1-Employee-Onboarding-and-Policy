# Demo policies: OnboardIQ Technologies (fictional)

**Fictional demonstration content.** OnboardIQ Technologies is not a real company. These documents were written for the OnboardIQ college project demo and are not real company policies.

| File | Policy ID | Version | Effective | Covers |
| --- | --- | --- | --- | --- |
| `OIQ-HR-LEA-001_Leave-and-Attendance-Policy.pdf` | OIQ-HR-LEA-001 | 3.1 | Jan 1, 2026 | Annual (18 days), sick (8), casual (6) leave, 10 public holidays, carry forward, applying for leave, attendance and core hours |
| `OIQ-HR-BEN-002_Employee-Benefits-Policy.pdf` | OIQ-HR-BEN-002 | 2.0 | Jan 1, 2026 | Eligibility, health insurance (INR 5,00,000 per family), life and accident cover, 10-day enrollment window, wellness allowance (INR 12,000), counselling |
| `OIQ-FIN-PAY-003_Payroll-and-Salary-Policy.pdf` | OIQ-FIN-PAY-003 | 2.2 | Apr 1, 2026 | Pay date (last working day), 20th cut-off, payslips, deductions (TDS, PF 12%, professional tax, loss of pay), payroll queries |
| `OIQ-HR-ONB-004_Employee-Onboarding-Policy.pdf` | OIQ-HR-ONB-004 | 1.4 | Jan 1, 2026 | Required documents, first-day checklist, orientation schedule, IT access, training, 90-day probation (matches the app's onboarding checklist) |
| `OIQ-HR-HYB-005_Hybrid-Work-Policy.pdf` | OIQ-HR-HYB-005 | 2.1 | Jan 1, 2026 | Remote eligibility (after 30 days, up to 2 days/week), 3 office days, working hours, remote expectations, home office allowance |
| `OIQ-IT-SEC-006_IT-and-Information-Security-Policy.pdf` | OIQ-IT-SEC-006 | 4.0 | Feb 1, 2026 | 14-character passwords and MFA, device rules, data classification, phishing, reporting incidents within 1 hour |
| `OIQ-HR-COC-007_Code-of-Conduct-Policy.pdf` | OIQ-HR-COC-007 | 3.0 | Jan 1, 2026 | Workplace behaviour, communication, anti-harassment (POSH), ethics and gifts (INR 2,000 limit), disciplinary stages and appeals |

The figures are consistent with each other, with `docs/sample-policies/` (used by the evaluation) and with the app's onboarding checklist, so they don't trigger conflict warnings. To demonstrate conflict detection, also upload `backend/evaluation/fixtures/leave-policy-amendment.txt` (it states 20 days of annual leave instead of 18) and ask about annual leave.

## Regenerating

The PDFs are generated from `generate_demo_policies.py` (all content lives in that file):

```bash
backend/.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
backend/.venv/Scripts/python docs/demo-policies/generate_demo_policies.py
```

Each section is kept on a single page because the ingestion pipeline extracts text per page and passages never span pages.

## Loading them into the app

Sign in as HR (`kavya.rao@onboardiq-demo.example`), open **Documents**, and upload the seven PDFs. Each one is extracted, chunked, embedded with MiniLM and indexed in FAISS. Sample questions:

- How many days of paid annual leave do full-time employees get?
- How many days of casual leave do I get, and can I carry them forward?
- How much is the annual wellness allowance?
- On which day is the monthly salary paid?
- What documents must I upload before my first day?
- How many days per week can I work from home?
- How long must my password be?
- Unanswerable (should recommend HR): Does the company offer an employee stock option plan?
