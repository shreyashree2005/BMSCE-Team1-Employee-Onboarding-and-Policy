# OnboardIQ — Employee Platform

**AI-powered employee onboarding and policy knowledge assistant**, built for the Dayforce Campus AI Innovation Challenge.

## Project Overview

- **What it is:**  A web-based platform that streamlines the employee onboarding process, guiding new hires from registration to successful onboarding while enabling HR to monitor and manage their progress efficiently.
- **The problem it solves:**
  - New hires often don't know what to do first, what's due today, or where to find the right policy.
  - Checklists in spreadsheets and emails get lost, and HR can't see who is stuck.
  - Policy questions take up HR's time, and answers can be inconsistent.
- **Its purpose:**
  - Give every employee a personalised checklist for their job role, with one clear next step at any moment.
  - Complete each task through a real action (form, upload, checklist, policy reading, training, quiz) that the server validates.
  - Answer policy questions from HR-approved documents, with citations.
  - Give HR a live view of onboarding progress, the policy library and support tickets.
- **Demo content:**
  - New hires are welcomed to **Dayforce** (welcome text and an official Dayforce video).
  - The policy documents and demo people are **fictional** ("OnboardIQ Technologies").

## Key Features

- **Accounts and access**
  - Employee registration and sign-in (session cookie, CSRF protection, login rate limiting).
  - Forgot password and password reset with single-use emailed links.
  - Job role selection during registration (9 roles).
  - Two roles: Employee and HR. HR access is never granted by registration or by the job role.
- **Onboarding checklist**
  - Role-based task generation: each job role gets its own checklist (10–13 tasks).
  - Personalised checklist with real task actions; the server decides when a task is complete.
  - Priority-based organisation (High / Medium / Low), set per task in the catalog.
  - Grouping by **Status → Priority → Tasks** (Pending, In Progress, Completed) on All Tasks.
  - Task dependencies and locking (for example, documents unlock after the profile).
  - Time tracking per task from server timestamps ("Completed in 4 minutes 32 seconds").
  - Congratulations messages after server-confirmed completions, with the next recommended task.
- **Home dashboard**
  - Welcome section with name, job role, onboarding day and a custom illustration.
  - **Your Next Step**: one recommended task, with a Start Task / Continue task button.
  - **Today's Tasks**: only work due today (plus overdue work), grouped by priority.
  - **Your Progress**: completion percentage and total / completed / in progress / pending counts.
  - **Onboarding journey**: five stage cards with progress; each opens All Tasks filtered to that stage.
  - 15-day onboarding calendar that explains every day without tasks.
  - Help Desk access.
- **Profile**
  - Employee profile (personal details completed through the profile task).
  - Profile photo upload (JPG/PNG), shown as a circle in the top-right corner with a profile menu.
- **Documents and policies**
  - Document upload and management for onboarding tasks (PDF/JPG/PNG, checked by file content).
  - Policy library: HR uploads and publishes policies; employees read them.
  - Policy acknowledgment with a signature.
  - Policy understanding quizzes (5 questions, explanations, retakes, attempts stored).
  - Policy Assistant: answers from approved policies with citations (retrieval-augmented generation).
  - Semantic search across policy documents.
- **Training**
  - Training modules to read and mark complete, followed by a graded quiz.
- **Support and guidance**
  - Help Desk: raise tickets with categories and attachments, and track their status; HR updates statuses.
  - First-login website tour (Next / Back / Skip / "Don't show this again"), replayable.
  - Dayforce company introduction with an optional, skippable official YouTube video.
- **HR**
  - HR dashboard: organisation totals, status and department breakdowns, each employee's progress.
  - Help Desk ticket queue with status updates.
- **Design**
  - Blue-and-white theme: blue sidebar, white workspace, blue headings and buttons.
  - Custom SVG illustrations for each onboarding section.
  - Responsive from 390 px phones to wide desktops.

## Employee Onboarding Workflow

1. Register with a job role (and optionally a photo), or sign in.
2. First visit: the website tour, then the Dayforce introduction (both optional).
3. **Home** shows your progress, **Your Next Step** and **Today's Tasks**.
4. Select **Start Task**: the task starts (the server records the time) and opens.
5. Do the task: fill the form, upload documents, tick the checklist, read and acknowledge policies, complete training or a quiz.
6. The server validates the submission and confirms completion.
7. A congratulations message appears, and Home updates your progress and next step.
8. Open **All Tasks** at any time for the full checklist, grouped by status and priority.

## Home Page

- A simple overview. It never shows the full checklist (that's All Tasks).
- **Welcome:** greeting, name, job role, location, onboarding day and the welcome illustration.
- **Your Next Step:** exactly one task, chosen by:
  1. prerequisites done;
  2. earliest deadline (overdue counts as today);
  3. in progress before not started;
  4. priority;
  5. catalog order.
  - Implemented in `getRecommendedTasks` (`frontend/src/utils/onboarding.ts`). It updates after every completion.
- **Today's Tasks:**
  - Only open tasks due today, plus overdue tasks (which still need doing). Tasks due on later days never appear.
  - Grouped under **High / Medium / Low Priority**, each heading shown once; empty groups are hidden; groups collapse.
  - Each row: task name, category and stage, due date, a lock note when blocked, and **Start Task** / **Continue**.
  - Tasks finished today sit in a collapsed **Completed today** list.
  - With nothing due, it explains why (for example a weekly holiday) and when work resumes.
- **Your Progress:** a progress ring with the percentage, plus Total, Completed, In progress and Pending tiles. Each opens All Tasks with that filter.
- **Your onboarding journey:** five stage cards (Welcome & IT setup, Documentation, Payroll & Benefits, Policies & Training, Ready to Go) with illustration, done count and percentage. Selecting one opens `/onboarding?stage=…`.
- **Calendar** and **Help Desk** sections.

## All Tasks Page

- The only page with the complete onboarding checklist.
- Grouped **Status → Priority → Tasks**:
  - status groups in the order Pending, In Progress, Completed, each heading shown once with a count;
  - inside each, High, Medium and Low Priority groups;
  - empty groups are hidden; every status and priority group can be collapsed.
- Light task rows: name (blue), category and stage, due date, and a dependency note only when the task is locked. Status and priority come from the group headings, so rows don't repeat them.
- Filters: status tabs (All / Pending / In Progress / Completed), journey stage, category and search.
- Deep links: `?status=pending|in_progress|completed`, `?stage=<stage name>`, `?task=<id>`.
- Task details open in a side panel on wide screens and in a dialog on smaller screens: a blue title, one line for status, priority and due date, the task's action, and stage, category, due date, prerequisites and time taken.

## First-Time User Guidance

- Shown automatically to employees whose account hasn't finished or dismissed it.
- The state is stored on the account (`users.tour_completed_at`), so it shows once per person, not once per browser.
- 7 illustrated steps: welcome, tasks, completing tasks, uploading documents, policies and quizzes, Help Desk, progress.
- **Next** and **Back** buttons, arrow keys and step dots.
- **Skip tour**:
  - without "Don't show this again": hidden for this browser session only;
  - with it: saved, so it won't show again.
- **Get started** on the last step also saves it as completed.
- Replay: **Settings → Replay website tour**, **Help Desk → Take the website tour**, or **Home → Help Desk → Take the tour again**.

## Dayforce Company Introduction

- Shown after the tour on the first visit, and on demand (Settings, Home → "Meet Dayforce").
- Shows "Welcome to Dayforce!", a short introduction and the official video **"Do the Work You're Meant to Do"** from the Dayforce YouTube channel (`4-JGpxcI0aI`).
  - The video ID was checked with YouTube's oEmbed endpoint (author: Dayforce).
- Lightweight: only a thumbnail loads until the employee selects play. It then embeds from `youtube-nocookie.com`.
- **Skip video** and **Continue to onboarding** close it at once; either choice is remembered (`users.company_intro_seen_at`).
- Fallback: if the thumbnail can't load (offline or blocked), a link to the official channel is shown (https://www.youtube.com/@Dayforce).
- Text and video live in `frontend/src/config/company.ts`.

## Role-Based Task Generation

- The job role is chosen at registration: Software Developer, AI/ML Engineer, Data Analyst, HR, Finance, Sales, Marketing, Intern, Other.
- The job role sets the checklist, job title and department. It **never** grants HR access ("HR" is a job function).
- Every role shares 8 tasks:
  - complete employee profile;
  - upload required documents;
  - salary bank details;
  - IT setup;
  - emergency contact;
  - read company policies;
  - security training;
  - 30-day goals.
- Role-specific tasks are added on top:

| Job role | Tasks | Role-specific tasks |
| --- | --- | --- |
| Software Developer | 13 | Development environment, Git access, IDE, meet the engineering team, technical onboarding |
| AI/ML Engineer | 13 | Python environment, GPU/ML platform access, Git access, AI/ML project docs, technical onboarding |
| Data Analyst | 12 | Analytics tool access, SQL environment, data governance, role training |
| HR | 10 | HR system training, employee management processes |
| Finance | 10 | Finance ERP access, finance process training |
| Sales | 11 | CRM access, sales onboarding, shadow a sales call |
| Marketing | 11 | Marketing tools access, brand guidelines, meet the marketing team |
| Intern | 10 | Intern orientation, meet your mentor |
| Other | 10 | Role orientation, meet your team |

- The catalog is in `backend/app/data/task_catalog.py`.
- Accounts created before role-based checklists keep their original 18 tasks, each mapped to an equivalent action.

## Task Priorities and Dependencies

- Each task's priority (High / Medium / Low) is set in the catalog. Each role has a mix, never all High.
- **Dependencies** (`DEPENDENCIES` in the catalog), for example:
  - documents, bank details, emergency contact and goals come after the profile;
  - Git access and security training come after IT setup;
  - the development environment comes after Git access, and the IDE after the development environment;
  - the SQL environment comes after analytics access.
- The server refuses to start, work on or complete a task before its prerequisites (HTTP 409, "Complete … first").
- The UI shows a lock, "After …", and a disabled **Locked** button.
- Due dates never fall on weekly days off or company holidays: they move to the next working day.

## Task Actions

| Action | What the employee does |
| --- | --- |
| Form | Profile, bank details (account number encrypted; only the last 4 digits are shown), emergency contact, access requests, goals, tax and benefits forms. Validated field by field on the server |
| Document upload | Upload each required document (PDF/JPG/PNG, max 5 MB, checked by file signature), view or replace it, then submit |
| Checklist | Tick each step (saved as you go), then complete |
| Policy acknowledgment | Open each policy, acknowledge it, sign with your full name, then pass each policy's understanding quiz |
| Training | Read and mark each module complete, then pass the quiz (80%) |
| Quiz | Answer every question; graded on the server; retakes allowed |

- A pending task first shows **Start task**, which starts its timer.
- An in-progress task shows a live timer and **Pause**.

## Task Status Management

- Statuses: **Pending**, **In Progress**, **Completed**.
- Start (or saving partial progress) → In Progress. Pause or Reopen → Pending.
- **Completed** is set only by the server, when the task's action succeeds. `PATCH status=completed` returns 409 for actionable tasks.
- Progress, Today's Tasks and Your Next Step change only after the server accepts an action.
- Celebrations appear only after the server confirms completion, once per completion:
  - "Congratulations! 🎉 You've completed this task. Let's move on to your next step."
  - "Great job! 🎉 You've completed all your tasks for today. See you tomorrow!" (or the date the next task is due)
  - "Congratulations! 🎉 You've successfully completed your onboarding journey. Welcome to the team!"
  - A light CSS confetti burst, disabled when the operating system asks for reduced motion.

## Task Time Tracking

- Columns `first_started_at`, `started_at` (current active period) and `time_spent_seconds` on `onboarding_tasks`.
- Server timestamps only:
  - Start opens an active period.
  - Pause, Reopen or Complete closes it and adds it to the total.
  - Reopened tasks keep their earlier time.
- Shown as "Completed in 4 minutes 32 seconds" in task details, task rows and the celebration. A live timer shows while a task is in progress.
- Tasks completed before tracking existed show no duration (never a made-up value).
- Timing is part of each employee's own task data. Other employees can't see it.

## Onboarding Calendar

- The next 15 days, on Home. Every day can be selected.
- Day styles: tasks due (blue, with a count and priority dots), all done (green), holiday (amber), weekly day off (grey stripes), empty working day (white). The selected day is solid blue; today has an outline.
- A day with tasks lists them (each opens the task). A day without tasks shows a title and an explanation:
  - **Sunday — Weekly Holiday:** "No onboarding activities are scheduled on this date because Sunday is a weekly holiday. Your next onboarding activity is scheduled for the next working day, Monday, November 9."
  - **Festival Holiday — Diwali (Balipadyami)** / **Company Holiday — Republic Day**, followed by when onboarding continues.
  - **No tasks scheduled:** "No onboarding tasks are scheduled for this date. Your next assigned activity is on …", plus a note that tasks are spread across working days.
  - **All tasks completed:** for days whose tasks are all done.
- A link jumps to the next activity date.
- No reason is ever invented: holidays come only from configuration, and an empty working day only says nothing is scheduled.
- Weekly days off: `WEEKLY_OFF_DAYS` (default Saturday and Sunday, matching the Monday–Friday week in the fictional Leave Policy). Set `["sunday"]` for a six-day week.
- Holidays: `backend/app/data/company_holidays.json` (a 2026 sample checked against published holiday lists; replace it with your HR calendar).
- Built by the API (`GET /api/v1/onboarding/calendar`); the same calendar moves due dates off non-working days.

## Document Upload

- PDF, JPG or PNG, up to 5 MB (`EMPLOYEE_DOCUMENT_MAX_MB`).
- The type is detected from the file's first bytes, not its name: a renamed `.exe` is rejected (415).
- Stored under random names in `backend/storage/employee-documents/<employee id>/`.
- Only the owner can download their files; another employee gets 404.
- Re-uploading a document type replaces the previous file.

## Employee Profile and Photo

- Upload during registration (optional) or later on **My Profile**.
- JPG/JPEG/PNG up to 2 MB (`PROFILE_PHOTO_MAX_MB`).
- The server checks the file signature, decodes the image with Pillow, refuses decompression bombs, resizes it to 512 px and re-encodes it (removing metadata such as GPS location).
- Replace or remove at any time; the old file is deleted.
- Shown as a circle with a blue ring in the top-right corner (40 px on phones, 48–52 px on larger screens), in the profile menu, on Settings and on My Profile. Initials are shown when there's no photo.
- Profile menu: name, job role, **My Profile**, **Settings**, **Help Desk** (employees) and **Logout**.
- The photo is served only to its owner (`GET /api/v1/auth/me/photo`).

## Policy Assistant and Policy Library

- HR uploads policy documents (PDF, DOCX, TXT) on the **Documents** page; employees get a read-only library.
- Policies are split into passages and indexed with sentence-transformer embeddings in FAISS.
- **Policy Assistant:** answers questions using only retrieved policy passages, cites its sources, and recommends contacting HR when the policies don't cover a question.
- **Semantic search:** finds relevant passages by meaning, not just keywords.
- Works with any OpenAI-compatible LLM (for example a local Ollama model).
- **Streaming answers:** the reply appears while the model writes it (`POST /policies/chat/stream`, newline-delimited JSON). The draft is then replaced by the validated answer, with citations or the HR fallback. `POST /policies/chat` still returns the whole answer at once.
- **Response speed:**
  - The embedding model and a local LLM are loaded in the background at startup (`WARM_UP_MODELS`).
  - Ollama keeps the model loaded between questions (`LLM_KEEP_ALIVE`).
  - The question is embedded once per request.
  - If the browser stops waiting, generation is cancelled, so the model isn't left busy for the next question.
- **Timing logs:** every question logs one `Policy chat timings` line with each stage's time: request, embed, faiss, db, context, llm_first_token, llm, validate and total.
- **Local model speed:** on a CPU-only laptop, almost all of the response time is the local model, which reads the passages and then writes about 5–7 words per second. Free RAM matters: when memory runs short, generation slows down a lot. Run only one API instance, and keep the model small.

## Policy Reading and Understanding Quiz

- Curated question bank: `backend/app/data/policy_quizzes.py`.
  - 5 questions each for the Code of Conduct (OIQ-HR-COC-007), IT and Information Security (OIQ-IT-SEC-006) and Leave and Attendance (OIQ-HR-LEA-001) policies.
- Every question is written from the policy text, and its explanation cites the policy section.
- Multiple choice with 4 options. Answers stay on the server; the browser gets questions and options only.
- Graded on the server. The result shows:
  - "Your Score: X/5";
  - "Great! You understood this concept." for correct answers;
  - the correct answer plus an explanation for wrong ones.
- All wrong: "You may want to read the policy again before attempting the quiz."
- Pass mark: `POLICY_QUIZ_PASS_PERCENT` (default 80% = 4/5). Retakes allowed; every attempt is stored (`policy_quiz_attempts`).
- The "Read company policies" task completes only when every policy is acknowledged **and** every quiz is passed.
- These curated quizzes are part of the "Read company policies" task. A quiz is available once HR has published that policy.

### Quiz on a Policy Assistant answer

- Every finished answer that cites the policies gets a **Take a 5-Question Quiz** button directly below it. No button appears while an answer is streaming, or when the policies didn't answer the question (HR fallback).
- The quiz appears inside the conversation:
  - one question at a time ("Question 1 of 5", progress bar, Previous/Next, Submit Quiz);
  - then the result: score, percentage, correct and incorrect counts, your answer and the correct one, an explanation, and a source chip that opens the passage in the source preview;
  - Retake Quiz and Continue Chat buttons.
- **How questions are made** (`backend/app/services/policy_quiz_generator.py`):
  - from the passages the answer cited, topped up from neighbouring passages of the same policy;
  - each question is a policy sentence with one figure blanked out ("Full-time employees receive ____ days of paid annual leave…"), and the correct option is the figure the policy states;
  - no language model writes questions or answer keys, so nothing is invented. Policies without enough specific figures get a clear "no quiz" message.
- **Grading:** the server rebuilds the quiz from the same passages, so correct answers never reach the browser. It then grades with the same scoring as the curated quizzes.
- **History:** attempts are stored per employee in `policy_quiz_attempts` under keys like `chat:OIQ-HR-LEA-001`. They never count towards the curated quizzes or complete onboarding tasks.
- API: `POST /policies/chat-quizzes` (build from `chunkIds`) · `POST /policies/chat-quizzes/attempts` (grade).

## Training and Assessments

- Training tasks have modules to read and mark complete. The quiz unlocks after all modules.
- Pass mark: 80%. Best score, last score and attempts are stored. Answers are never sent to the browser.

## Help Desk

- **Employees** (`/help`):
  - raise a ticket with a category, subject and description, plus an optional screenshot or PDF (max 5 MB, checked by content);
  - categories: IT Support, HR Support, Payroll Issues, Benefits Queries, Document Upload Issues, Onboarding Task Issues, Account/Login Issues, Other;
  - see their own tickets, each with its reference (HD-000042), creation date and status;
  - employees only ever see their own tickets: another person's ticket returns 404.
- **HR** (`/help` when signed in as HR): the queue of all tickets, a status filter, attachments and a status change per ticket.
- Statuses: Open → In Progress → Resolved → Closed (`resolvedAt` is recorded).
- No automatic or fake replies: a ticket changes only when HR updates it.

## HR Dashboard

- Organisation totals: employees onboarding, completed, open and overdue tasks.
- Cohort completion, status distribution and progress by department.
- Employee table with search, department filter and status tabs (at risk, not started, on track, completed).
- Each employee's journey, checklist, open and overdue tasks, and contact details.

## Design System

- **Layout:** a blue sidebar (white text and icons; the active page is a white highlight) and a white workspace.
- **Brand:** OnboardIQ logo with the subtitle **EMPLOYEE PLATFORM**.
- **Colour:** one blue palette (tokens in `frontend/src/index.css`); blue headings and primary buttons; light-blue borders and subtle blue shadows.
- **Illustrations:** custom inline SVGs in `frontend/src/components/illustrations/SectionIllustration.tsx`:
  - Welcome (a new employee walking into the office), Welcome & IT setup, Documentation, Payroll, Benefits, Training, Ready to Go, Help Desk and Day off;
  - layered shapes, gradients and soft shadows, with a different composition for each section; decorative only (`aria-hidden`).
- **Motion:** subtle fades, hover lifts and transitions; disabled when the operating system asks for reduced motion.
- **Responsive:** from 390 px phones up; no horizontal scrolling.

## Backend Architecture

- FastAPI app factory: `backend/app/main.py`.
  - Startup runs Alembic migrations, backfills task actions, seeds demo data and loads the work calendar.
- Routes in `backend/app/api/routes/`:
  - `auth` (session, registration, password reset, photo, preferences);
  - `onboarding` (tasks, actions, documents, calendar);
  - `policies` (documents, search, chat, quizzes);
  - `helpdesk`;
  - `hr`;
  - `health`.
- Services in `backend/app/services/`:
  - `task_actions`, `onboarding_repository`, `onboarding_service` (progress, calendar);
  - `work_calendar`, `policy_quiz`, `helpdesk`, `profile_photo`, `uploads` (shared file-signature checks);
  - `password_reset`, `mail`, `registration`, `hr_service`;
  - `policies/` (ingestion, FAISS, RAG).
- Data and configuration in `backend/app/data/`: `task_catalog`, `job_roles`, `policy_quizzes`, `company_holidays.json` and the fictional demo users.
- Security dependencies in `backend/app/api/auth.py`: session cookie, CSRF header, roles, session version.

## Frontend Architecture

- React 19 + TypeScript + Vite + Tailwind CSS 4.
- Pages (`frontend/src/pages/`):
  - Home (overview), All Tasks (full checklist);
  - Help Desk (employee and HR views);
  - My Profile, Settings;
  - Documents, Policy Assistant, HR Dashboard;
  - Login, Register, Forgot/Reset password.
- Context: `AuthContext`, `OnboardingContext` (tasks, celebrations), `GuidanceContext` (tour and company introduction), `ToastContext`.
- Components:
  - `home/` (Home sections, journey cards, calendar);
  - `tasks/` (`TaskGroups` for status and priority groups and task rows, task details, celebration, actions);
  - `guidance/`, `quiz/`, `helpdesk/`, `profile/`, `journey/`, `hr/`, `documents/`, `policy/`;
  - `illustrations/` (inline SVG illustrations);
  - `layout/` (sidebar, top bar, profile menu) and `ui/` (Button, Modal, SectionHeader, UserAvatar…).
- Task logic in `frontend/src/utils/onboarding.ts`: counts, stage progress, recommendations, `getTodayOverview`, `groupByPriority`, `groupByStatusAndPriority`.

## Database Structure

- `users`: account, role, password hash, session version, tour/intro flags, photo.
- `employee_profiles`: job details, job role, personal details from the profile task.
- `onboarding_tasks`: per-employee checklist with status, priority, due date, action key, `completed_at` and time-tracking columns.
- `task_progress`, `task_documents`, `emergency_contacts`, `bank_details` (account number encrypted): action data.
- `password_reset_tokens`: SHA-256 hashes of single-use reset tokens.
- `support_tickets`: Help Desk tickets and attachment metadata.
- `policy_quiz_attempts`: every graded policy quiz attempt.
- `policy_documents`, `policy_chunks`: uploaded policies and their passages.
- Migrations (Alembic, run automatically at startup):
  - `0001` initial schema;
  - `0002` users and per-employee tasks;
  - `0003` task actions and password reset;
  - `0004` guidance flags, profile photos, time tracking, Help Desk and policy quiz attempts.

## API Endpoints

- All under `/api/v1`. JSON uses camelCase. Interactive docs: http://localhost:8000/docs.
- Cookie-authenticated requests that change data must send `X-Requested-With: OnboardIQ`.

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public | Create an Employee account (`fullName, email, jobRole, password, confirmPassword`) |
| POST | `/auth/login` · `/auth/logout` | Public | Sign in (session cookie) · sign out |
| GET | `/auth/me` | Signed in | Current user (profile, `photoUrl`, `tourCompleted`, `companyIntroSeen`) |
| PATCH | `/auth/me/preferences` | Signed in | `{tourCompleted?, companyIntroSeen?}` |
| POST · DELETE · GET | `/auth/me/photo` | Signed in | Upload/replace · remove · download your profile photo |
| POST | `/auth/forgot-password` · `/auth/reset-password/verify` · `/auth/reset-password` | Public | Password reset |
| GET | `/onboarding/tasks` · `/onboarding/tasks/{id}` | Employee | Own tasks (`dependsOn`, `sequence`, timing fields); filters `status`, `category`, `stage` |
| PATCH | `/onboarding/tasks/{id}` | Employee | Start / pause / reopen (409 for "completed" on actionable tasks or when prerequisites are open) |
| GET · POST | `/onboarding/tasks/{id}/action` | Employee | Task action state · submit (422 with field errors, 409 when locked or out of order) |
| POST · DELETE · GET | `/onboarding/tasks/{id}/documents[/{docId}[/file]]` | Employee | Upload · remove · download own documents |
| GET | `/onboarding/progress` | Employee | Completion by stage and category |
| GET | `/onboarding/calendar?days=15` | Employee | Calendar days with type, title, tasks, explanation and next activity |
| GET | `/policies/quizzes` · `/policies/quizzes/{policyId}` | Signed in | Quiz list with best scores · questions (no answers) and history |
| POST | `/policies/quizzes/{policyId}/attempts` | Signed in | Grade `{answers}`; returns score, correct answers, explanations, completed task IDs |
| GET · POST · DELETE | `/policies/documents[/{id}]` | Signed in / HR | Policy library (HR uploads and deletes) |
| GET | `/policies/documents/{id}/file` | Signed in | Original policy file |
| POST | `/policies/search` · `/policies/chat` · `/policies/chat/stream` | Signed in | Semantic search · Policy Assistant (whole answer · streamed) |
| GET · POST | `/helpdesk/tickets` | Employee | Own tickets · create (multipart: `category, subject, description, attachment?`) |
| GET | `/helpdesk/tickets/{id}[/attachment]` | Employee | Own ticket · its attachment |
| GET | `/helpdesk/admin/tickets[?status=]` · `/helpdesk/admin/summary` | HR | All tickets · counts by status |
| PATCH | `/helpdesk/admin/tickets/{id}` | HR | `{status}` |
| GET | `/helpdesk/admin/tickets/{id}/attachment` | HR | Any ticket's attachment |
| GET | `/hr/summary` · `/hr/employees[/{id}]` | HR | Onboarding analytics |

## Technologies Used

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, React Router, Lucide icons, Vitest and Testing Library.
- **Backend:** Python 3.11+, FastAPI, Pydantic, SQLAlchemy 2, Alembic, Uvicorn.
- **Security:** scrypt password hashing, HS256 JWT in an httpOnly cookie, Fernet encryption (`cryptography`), Pillow image validation.
- **AI and search:** sentence-transformers (`all-MiniLM-L6-v2`), FAISS, any OpenAI-compatible LLM (e.g. local Ollama).
- **Database:** SQLite (local default) or PostgreSQL.
- **Browser testing:** Playwright (Microsoft Edge).

## Project Folder Structure

```
Employee_Onboarding/
├── frontend/
│   ├── src/
│   │   ├── components/   # home, tasks (+ actions), guidance, quiz, helpdesk, profile, journey, illustrations, layout, hr, documents, policy, ui
│   │   ├── config/       # navigation, company (Dayforce intro), job roles, stages, task meta, demo date
│   │   ├── context/      # Auth, Onboarding, Guidance, Toast
│   │   ├── hooks/ pages/ services/ types/ utils/
│   └── tests/            # Vitest + Testing Library
├── backend/
│   ├── app/
│   │   ├── api/          # auth dependencies, routes/
│   │   ├── core/         # settings, security, encryption, rate limiting
│   │   ├── data/         # task catalog, job roles, policy quizzes, company holidays, demo users (fictional)
│   │   ├── db/           # models, session, migrations runner, seeding
│   │   ├── schemas/ services/
│   │   └── main.py
│   ├── migrations/       # Alembic (0001–0004)
│   ├── evaluation/       # Policy Assistant evaluation
│   └── tests/            # Pytest
└── docs/                 # demo policies (fictional) and team docs
```

## Installation and Setup

- Prerequisites: Node.js 20+ and npm, Python 3.11+.
- Backend (Windows PowerShell; on macOS/Linux use `python3 -m venv .venv` and `source .venv/bin/activate`):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env    # optional: the defaults work locally
```

- Frontend:

```bash
cd frontend
npm install
```

- `pip install` includes PyTorch (CPU build, about 200 MB). The embedding model (about 90 MB) downloads on first use. Set `EMBEDDING_PROVIDER=hashing` to work offline.
- To try policy reading and quizzes, sign in as HR and upload the fictional PDFs from `docs/demo-policies/` on the Documents page.

## Environment Variables

- See `backend/.env.example` for every setting. The main ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | SQLite file | Database connection |
| `ENVIRONMENT` | `development` | `production` enables strict startup checks |
| `JWT_SECRET_KEY` | generated in dev | Session signing secret (required in production) |
| `COOKIE_SECURE` | `false` | HTTPS-only cookie (required in production) |
| `SEED_DEMO_DATA` / `DEMO_USER_PASSWORD` | `true` / dev password | Fictional demo accounts |
| `CORS_ORIGINS` | localhost:5173 | Allowed frontend origins |
| `FRONTEND_BASE_URL` | `http://localhost:5173` | Links in reset emails |
| `MAIL_BACKEND`, `SMTP_*` | `file` | `file` writes emails to `backend/storage/outbox/`; `smtp` sends them |
| `DATA_ENCRYPTION_KEY` | generated in dev | Fernet key for bank account numbers (required in production) |
| `EMPLOYEE_DOCUMENT_MAX_MB` | `5` | Task upload limit |
| `PROFILE_PHOTO_MAX_MB` | `2` | Profile photo limit |
| `HELPDESK_ATTACHMENT_MAX_MB` | `5` | Ticket attachment limit |
| `WEEKLY_OFF_DAYS` | `["saturday","sunday"]` | Weekly days off |
| `COMPANY_HOLIDAYS_FILE` | `app/data/company_holidays.json` | Company holiday calendar |
| `POLICY_QUIZ_PASS_PERCENT` | `80` | Policy quiz pass mark |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | unset | Policy Assistant LLM |
| `REFERENCE_DATE` | unset (`.env.example`: `2026-11-07`) | Fixed "today" for demo data |

- Frontend (`frontend/.env`):
  - `VITE_API_BASE_URL` (default `http://localhost:8000`);
  - `VITE_REFERENCE_DATE`;
  - `VITE_SHOW_DEMO_ACCOUNTS`.
  - These are visible in the browser, so never put secrets in them.

## Running the Application

- Backend:

```powershell
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000. Docs: http://localhost:8000/docs. Health: http://localhost:8000/health.
- Run only one API instance per database: each process keeps its own in-memory search index.
- Frontend:

```bash
cd frontend
npm run dev        # http://localhost:5173
npm run build      # type-check and production build
```

- Demo accounts (fictional, local only). Password: `OnboardIQ-Demo-2026`.
  - HR: `kavya.rao@onboardiq-demo.example`
  - Employee: `shreya.nambiar@onboardiq-demo.example`

## Testing

```bash
cd backend && pytest                 # backend suite
cd frontend && npm test              # frontend suite
cd frontend && npx tsc -b            # TypeScript check
cd frontend && npm run build         # production build
```

- **Backend unit and integration tests** (`backend/tests/`, FastAPI TestClient on a real SQLite database per test):
  - auth, roles and data isolation; registration → job role → role checklist;
  - dependencies (a blocked task can't be started, uploaded to or submitted);
  - server time tracking; work calendar, day titles and explanations, and a configurable six-day week;
  - task actions, documents, policy acknowledgment → quizzes → task completion;
  - quiz scoring, retakes, answers never exposed; Help Desk create → HR update → employee tracking;
  - profile photo validation; password reset; HR analytics; Policy Assistant.
- **Frontend unit tests** (`frontend/tests/guidedLogic.test.ts`):
  - grouping by status and by priority, empty-group handling;
  - today's tasks (no future tasks, overdue included, completed today kept separate);
  - progress counts and stage progress;
  - recommended-task ordering and locking; completion messages; duration formatting; photo, ticket and attachment validation.
- **Frontend integration tests** (Vitest + Testing Library with a mocked API, e.g. `homeAndChecklist.test.tsx`, `dashboards.test.tsx`, `guided.test.tsx`):
  - Home → Start Task → form → completion, with progress and the next step updating;
  - Home → All Tasks, journey stage → filtered checklist, Pending / In Progress / Completed views;
  - status and priority groups collapsing; rows without repeated labels; role-specific checklists;
  - calendar explanations; tour, company intro, profile menu and photo, Help Desk, policy quiz, locked tasks, registration, password reset.
- **Browser testing:** Playwright scripts drove Microsoft Edge against a fresh demo database, covering:
  - registration with job role and photo, the tour and the Dayforce video;
  - Home (Today's Tasks priority groups, journey cards), All Tasks grouping and collapsing, stage and status navigation;
  - completing tasks (profile form, document uploads with a fake PDF rejected, policy quiz fail / retake / pass);
  - calendar explanations, Help Desk with HR updates, forgot password and the 390 px phone layout.
- **Policy Assistant evaluation:** `python -m evaluation` (45 cases). See `backend/evaluation/README.md`.

## Security Features

- scrypt password hashing. Login rate limiting with lockout.
- httpOnly SameSite=Lax session cookie, plus a CSRF header on every change.
- Role-based access on every endpoint. HR access is never granted by the job role or by registration.
- Data isolation: employees can only reach their own tasks, documents, tickets, quiz attempts, photo and timing (others' IDs return 404).
- Uploads are checked by file content, size-limited and stored under random names. Photos are re-encoded with metadata removed.
- Bank account numbers are encrypted at rest (Fernet) and masked in responses.
- Single-use, hashed, 30-minute password reset tokens. A reset signs out every session.
- Quiz answers stay server-side until an attempt is graded.
- Strict production checks: the secret key, secure cookie, encryption key and demo password must be set safely.

## Known Limitations

- Emails (password reset) are written to `backend/storage/outbox/` unless SMTP is configured.
- The company holiday list is a configurable sample for 2026. Replace it with your HR calendar.
- Policy quizzes exist for three policies (Code of Conduct, IT Security, Leave). The others have no quiz yet.
- HR can update ticket statuses but can't add written replies. HR can't view employees' uploaded onboarding documents.
- Demo tasks seeded as completed have no stored submissions or timing.
- The policy viewer shows PDFs inline in the browser. DOCX policies download instead.
- The frontend bundle is just over Vite's 500 kB advisory size (a build warning, not an error).
- Not deployed. Before deploying, at minimum:
  - use PostgreSQL;
  - set `ENVIRONMENT=production`, a random `JWT_SECRET_KEY`, `COOKIE_SECURE=true`, `DATA_ENCRYPTION_KEY`, `SEED_DEMO_DATA=false` and SMTP;
  - serve over HTTPS, with frontend and API on the same site;
  - give `backend/storage/` persistent storage.

## Future Enhancements

- HR replies and comments on Help Desk tickets, with email notifications.
- Quiz banks for every published policy, managed by HR in the UI.
- HR review of uploaded documents.
- An HR screen to edit the holiday calendar and weekly schedule.
- Code-splitting the frontend bundle.
- Shared rate-limit store (e.g. Redis) for multiple API workers.
