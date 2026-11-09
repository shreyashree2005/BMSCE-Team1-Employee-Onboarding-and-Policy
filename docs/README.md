# OnboardIQ Documentation

Project documentation lives here: architecture notes, API references, design decisions and demo guides.

## Development roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project foundation, frontend dashboard (mock data), FastAPI health check | Done |
| 2.1 | Onboarding checklist API + frontend integration | Done |
| 2.2 | Database persistence (SQLAlchemy · PostgreSQL / SQLite) | Done |
| 3.1 | Policy document ingestion & semantic retrieval (PDF/DOCX/TXT, sentence-transformers, FAISS) | Done |
| 3.2 | Policy Assistant chat: RAG over uploaded policies with any OpenAI-compatible LLM, citations, evidence and HR escalation | Done |
| 3.3 | AI quality evaluation (dataset, metrics, runner) and grounding improvements (citations, written numbers, conflicts, injection hardening) | Done |
| 3.4 | Authentication (scrypt + JWT session cookie), Employee/HR roles enforced by the API, per-employee checklists, HR dashboard API, Alembic migrations | Done |
| 3.5 | Integration and UI polish (sign-in page, role-aware navigation, data-driven dashboards and notifications), frontend tests, end-to-end verification, deployment documentation | Done |
| Next | Password reset and user administration, shared rate-limit store, token revocation, actual deployment | Planned |

## Conventions for contributors

- **Branches:** `feature/<area>-<short-description>` (e.g. `feature/frontend-hr-dashboard`), merged through pull requests into `main`.
- **Frontend:** reusable UI primitives go in `frontend/src/components/ui`, feature components in their own folder under `components/`, pages in `pages/`, shared types in `types/`.
- **Backend:** each feature gets a route module in `app/api/routes/` (registered in `app/api/router.py`) and Pydantic schemas in `app/schemas/`. Add a test in `backend/tests/` for every endpoint.
- **Secrets:** never commit `.env` files. Add new settings to `.env.example` with placeholder values.
