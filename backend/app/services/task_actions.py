"""Task actions: what an employee does to complete each onboarding task.

A task becomes ``completed`` only here, after the server has validated the action (a valid form, every required
document uploaded, every checklist item ticked, every policy acknowledged and signed, every training module read,
or a passing quiz score). Partial progress moves a pending task to ``in_progress``. Everything is scoped to the
signed-in employee: the task is looked up through their own repository.
"""

import hashlib
import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.encryption import DataCipher
from app.data.task_catalog import ActionDef, ActionType, FieldDef, action_for
from app.db.models import (
    BankDetailsRecord,
    EmergencyContactRecord,
    OnboardingTaskRecord,
    TaskDocumentRecord,
    TaskProgressRecord,
    UserRecord,
)
from app.schemas.onboarding import TaskStatus
from app.schemas.task_actions import (
    ChecklistItemOut,
    DocumentRequirementOut,
    FieldOut,
    PolicyOut,
    QuizOut,
    QuizQuestionOut,
    QuizResultOut,
    SectionOut,
    TaskActionState,
    TaskActionSubmission,
    UploadedDocumentOut,
)
from app.data.policy_quizzes import quiz_for
from app.services.onboarding_repository import SqlAlchemyTaskRepository, incomplete_prerequisites, prerequisite_message, set_record_status
from app.services.policy_quiz import PolicyQuizService, find_published_policy
from app.services.uploads import DOCUMENT_TYPES, STORAGE_NAME, detect_type, safe_filename

logger = logging.getLogger(__name__)

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
# File signatures for accepted employee documents.
class TaskActionError(Exception):
    """A problem the employee can fix; ``fields`` maps form field names to messages."""

    def __init__(self, status_code: int, message: str, fields: dict[str, str] | None = None, code: str = "task_action_invalid") -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.fields = fields or {}
        self.code = code


@dataclass
class StoredFile:
    path: Path
    filename: str
    content_type: str


class TaskActionService:
    def __init__(self, session: Session, employee: UserRecord, settings: Settings, cipher: DataCipher) -> None:
        self._session = session
        self._employee = employee
        self._settings = settings
        self._cipher = cipher
        self._tasks = SqlAlchemyTaskRepository(session, employee.id)

    # ---- Public API --------------------------------------------------------------------------------------------

    def state(self, task_key: str, message: str | None = None) -> TaskActionState:
        record, action = self._task(task_key)
        progress = self._progress_data(record)
        task = self._tasks.schema(record)
        state = TaskActionState(
            task=task,
            action_type=action.type.value,
            kind=action.kind,
            instructions=action.instructions,
            completed=record.status == TaskStatus.COMPLETED,
            completed_at=task.completed_at,
            message=message,
        )
        if action.type == ActionType.FORM:
            state.fields = [self._field_out(f) for f in action.fields]
            state.values, state.masked_values = self._form_values(action, progress)
        elif action.type == ActionType.DOCUMENT_UPLOAD:
            uploaded = {d.document_type: d for d in self._documents(record)}
            state.documents = [
                DocumentRequirementOut(id=r.id, label=r.label, hint=r.hint, uploaded=self._document_out(uploaded[r.id]) if r.id in uploaded else None)
                for r in action.documents
            ]
        elif action.type == ActionType.CHECKLIST:
            checked = set(progress.get("checked", []))
            state.items = [ChecklistItemOut(id=i.id, label=i.label, help=i.help, checked=i.id in checked) for i in action.items]
        elif action.type == ActionType.POLICY_ACKNOWLEDGMENT:
            acknowledged = set(progress.get("acknowledged", []))
            state.policies = [self._policy_out(p.policy_id, p.title, p.policy_id in acknowledged) for p in action.policies]
            state.signature = progress.get("signature")
        if action.type == ActionType.TRAINING:
            done = set(progress.get("completed_sections", []))
            state.sections = [SectionOut(id=s.id, title=s.title, paragraphs=list(s.paragraphs), completed=s.id in done) for s in action.sections]
        if action.quiz is not None:
            quiz_progress = progress.get("quiz", {})
            state.quiz = QuizOut(
                pass_mark=action.quiz.pass_mark,
                questions=[QuizQuestionOut(id=q.id, question=q.question, options=list(q.options)) for q in action.quiz.questions],
                attempts=quiz_progress.get("attempts", 0),
                best_score=quiz_progress.get("best_score"),
                last_score=quiz_progress.get("last_score"),
                passed=quiz_progress.get("passed", False),
                last_results=[QuizResultOut(**r) for r in quiz_progress.get("last_results", [])],
            )
        return state

    def submit(self, task_key: str, submission: TaskActionSubmission) -> TaskActionState:
        record, action = self._task(task_key)
        self._require_prerequisites(record)
        handlers = {
            ActionType.FORM: self._submit_form,
            ActionType.CHECKLIST: self._submit_checklist,
            ActionType.DOCUMENT_UPLOAD: self._submit_documents,
            ActionType.POLICY_ACKNOWLEDGMENT: self._submit_policies,
            ActionType.TRAINING: self._submit_training,
            ActionType.QUIZ: self._submit_quiz,
        }
        message = handlers[action.type](record, action, submission)
        self._session.commit()
        return self.state(task_key, message)

    def upload_document(self, task_key: str, document_type: str, filename: str, content: bytes) -> TaskActionState:
        record, action = self._task(task_key)
        self._require_prerequisites(record)
        if action.type != ActionType.DOCUMENT_UPLOAD:
            raise TaskActionError(409, "This task doesn't take document uploads.")
        requirement = next((r for r in action.documents if r.id == document_type), None)
        if requirement is None:
            raise TaskActionError(422, "Choose which document you're uploading.", {"documentType": "Unknown document type."})
        if not content:
            raise TaskActionError(422, "The file is empty.")
        if len(content) > self._settings.employee_document_max_bytes:
            raise TaskActionError(413, f"Files can be at most {self._settings.employee_document_max_mb:g} MB.", code="file_too_large")
        detected = detect_type(content, DOCUMENT_TYPES)
        if detected is None:
            raise TaskActionError(415, "Upload a PDF, JPG or PNG file.", code="unsupported_file_type")
        content_type, extension = detected

        for old in [d for d in self._documents(record) if d.document_type == document_type]:  # replacing a document
            self._document_path(old.storage_name).unlink(missing_ok=True)
            self._session.delete(old)
        storage_name = f"{uuid.uuid4().hex}{extension}"
        path = self._document_path(storage_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "xb") as file:
            file.write(content)
        clean_name = safe_filename(filename, "document")
        self._session.add(
            TaskDocumentRecord(
                task_id=record.id, employee_id=self._employee.id, document_type=document_type, filename=clean_name,
                storage_name=storage_name, content_type=content_type, size_bytes=len(content), sha256=hashlib.sha256(content).hexdigest(),
            )  # fmt: skip
        )
        self._mark_started(record)
        self._session.commit()
        return self.state(task_key, f"{requirement.label} uploaded.")

    def delete_document(self, task_key: str, document_id: int) -> TaskActionState:
        record, _ = self._task(task_key)
        document = next((d for d in self._documents(record) if d.id == document_id), None)
        if document is None:
            raise TaskActionError(404, "Document not found.", code="not_found")
        if record.status == TaskStatus.COMPLETED:
            raise TaskActionError(409, "This task is complete. Reopen it to change its documents.")
        self._document_path(document.storage_name).unlink(missing_ok=True)
        self._session.delete(document)
        self._session.commit()
        return self.state(task_key, "Document removed.")

    def document_file(self, task_key: str, document_id: int) -> StoredFile:
        record, _ = self._task(task_key)
        document = next((d for d in self._documents(record) if d.id == document_id), None)
        if document is None or not self._document_path(document.storage_name).exists():
            raise TaskActionError(404, "Document not found.", code="not_found")
        return StoredFile(self._document_path(document.storage_name), document.filename, document.content_type)

    # ---- Handlers ----------------------------------------------------------------------------------------------

    def _submit_form(self, record: OnboardingTaskRecord, action: ActionDef, submission: TaskActionSubmission) -> str:
        if submission.values is None:
            raise TaskActionError(422, "Fill in the form.")
        values = self._validate_fields(action, submission.values)
        if action.kind == "profile":
            self._save_profile(values)
        elif action.kind == "bank_details":
            self._save_bank_details(values)
        elif action.kind == "emergency_contact":
            self._save_emergency_contact(values)
        stored = {f.name: values[f.name] for f in action.fields if not f.sensitive and f.name in values}
        self._save_progress(record, {"values": stored})
        self._complete(record)
        return "Saved. Task completed."

    def _submit_checklist(self, record: OnboardingTaskRecord, action: ActionDef, submission: TaskActionSubmission) -> str:
        valid = {i.id for i in action.items}
        checked = [item for item in dict.fromkeys(submission.checked_items or []) if item in valid]
        unknown = set(submission.checked_items or []) - valid
        if unknown:
            raise TaskActionError(422, "Some checklist items aren't part of this task.")
        self._save_progress(record, {"checked": checked})
        if submission.complete:
            missing = [i.label for i in action.items if i.id not in checked]
            if missing:
                raise TaskActionError(422, f"Tick every step before completing the task. Still to do: {', '.join(missing)}.")
            self._complete(record)
            return "All steps done. Task completed."
        self._mark_started(record)
        return "Progress saved."

    def _submit_documents(self, record: OnboardingTaskRecord, action: ActionDef, submission: TaskActionSubmission) -> str:
        if not submission.complete:
            raise TaskActionError(422, "Upload your documents, then submit them.")
        uploaded = {d.document_type for d in self._documents(record)}
        missing = [r.label for r in action.documents if r.id not in uploaded]
        if missing:
            raise TaskActionError(422, f"Upload every required document first. Missing: {', '.join(missing)}.")
        self._save_progress(record, {"submitted_documents": sorted(uploaded)})
        self._complete(record)
        return "Documents submitted. Task completed."

    def _submit_policies(self, record: OnboardingTaskRecord, action: ActionDef, submission: TaskActionSubmission) -> str:
        policies = [self._policy_out(p.policy_id, p.title, False) for p in action.policies]
        unavailable = [p.title for p in policies if not p.available]
        if unavailable:
            raise TaskActionError(409, f"{', '.join(unavailable)} hasn't been published yet, so it can't be acknowledged. Please contact HR.", code="policy_unavailable")
        acknowledged = set(submission.acknowledged_policies or [])
        missing = [p.title for p in policies if p.policy_id not in acknowledged]
        if missing:
            raise TaskActionError(422, f"Read and acknowledge every policy. Not yet acknowledged: {', '.join(missing)}.")
        signature = re.sub(r"\s+", " ", submission.signature or "").strip()
        if signature.lower() != re.sub(r"\s+", " ", self._employee.full_name).strip().lower():
            raise TaskActionError(422, "Sign with your full name exactly as it appears on your account.", {"signature": f"Type “{self._employee.full_name}”."})
        self._save_progress(
            record, {"acknowledged": [p.policy_id for p in policies], "signature": signature, "acknowledged_at": datetime.now(timezone.utc).isoformat()}
        )
        quizzes_left = [p.title for p in self._policy_quiz_status(action) if p.quiz_available and not p.quiz_passed]
        if quizzes_left:
            self._mark_started(record)
            return f"Policies acknowledged. Now pass the understanding quiz for the {' and the '.join(quizzes_left)} to finish this task."
        self._complete(record)
        return "Policies acknowledged and understood. Task completed."

    def complete_ready_policy_tasks(self) -> list[str]:
        """
        Completes policy tasks whose policies are all acknowledged and whose understanding quizzes are all passed
        (called after a quiz is passed). Returns the IDs of the tasks it completed.
        """
        completed = []
        records = self._session.scalars(
            select(OnboardingTaskRecord).where(OnboardingTaskRecord.employee_id == self._employee.id, OnboardingTaskRecord.status != TaskStatus.COMPLETED)
        )
        for record in records:
            action = action_for(record.action_key)
            if action is None or action.type != ActionType.POLICY_ACKNOWLEDGMENT or incomplete_prerequisites(self._session, record):
                continue
            acknowledged = set(self._progress_data(record).get("acknowledged", []))
            if not all(p.policy_id in acknowledged for p in action.policies):
                continue
            if all(p.quiz_passed or not p.quiz_available for p in self._policy_quiz_status(action)):
                self._complete(record)
                completed.append(record.task_key)
        return completed

    def _submit_training(self, record: OnboardingTaskRecord, action: ActionDef, submission: TaskActionSubmission) -> str:
        progress = self._progress_data(record)
        done = list(progress.get("completed_sections", []))
        message = "Progress saved."
        if submission.completed_section is not None:
            if submission.completed_section not in {s.id for s in action.sections}:
                raise TaskActionError(422, "That module isn't part of this training.")
            if submission.completed_section not in done:
                done.append(submission.completed_section)
            message = "Module marked complete."
        all_read = all(s.id in done for s in action.sections)
        quiz_state = progress.get("quiz", {})
        if submission.answers is not None:
            if action.quiz is None:
                raise TaskActionError(422, "This training has no quiz.")
            if not all_read:
                raise TaskActionError(409, "Finish every module before taking the quiz.")
            quiz_state = self._grade(action, submission.answers, quiz_state)
            message = self._quiz_message(quiz_state, action.quiz.pass_mark)
        self._save_progress(record, {"completed_sections": done, "quiz": quiz_state})
        if all_read and (action.quiz is None or quiz_state.get("passed")):
            self._complete(record)
            return "Training completed." if action.quiz is None else message + " Training completed."
        self._mark_started(record)
        return message

    def _submit_quiz(self, record: OnboardingTaskRecord, action: ActionDef, submission: TaskActionSubmission) -> str:
        if submission.answers is None or action.quiz is None:
            raise TaskActionError(422, "Answer the questions, then submit.")
        quiz_state = self._grade(action, submission.answers, self._progress_data(record).get("quiz", {}))
        self._save_progress(record, {"quiz": quiz_state})
        if quiz_state["passed"]:
            self._complete(record)
        else:
            self._mark_started(record)
        return self._quiz_message(quiz_state, action.quiz.pass_mark)

    # ---- Validation & storage helpers --------------------------------------------------------------------------

    def _validate_fields(self, action: ActionDef, raw: dict[str, str | bool]) -> dict[str, Any]:
        known = {f.name for f in action.fields}
        unknown = set(raw) - known
        if unknown:
            raise TaskActionError(422, "The form contains unexpected fields.", {name: "Unexpected field." for name in unknown})
        errors: dict[str, str] = {}
        values: dict[str, Any] = {}
        for field in action.fields:
            value = raw.get(field.name)
            if field.fixed_value is not None:
                values[field.name] = field.fixed_value
                continue
            if field.type == "checkbox":
                if field.required and value is not True:
                    errors[field.name] = "Please confirm."
                values[field.name] = value is True
                continue
            text = str(value).strip() if isinstance(value, str) else ""
            if not text:
                if field.required:
                    errors[field.name] = f"{field.label} is required."
                continue
            if len(text) > field.max_length:
                errors[field.name] = f"Use at most {field.max_length} characters."
            elif len(text) < field.min_length:
                errors[field.name] = f"Use at least {field.min_length} characters."
            elif field.type == "email" and not _EMAIL.fullmatch(text):
                errors[field.name] = "Enter a valid email address."
            elif field.type == "select" and text not in field.options:
                errors[field.name] = "Choose one of the options."
            elif field.pattern and not re.fullmatch(field.pattern, text):
                errors[field.name] = field.pattern_message or "Invalid format."
            elif field.type == "date":
                try:
                    parsed = date.fromisoformat(text)
                except ValueError:
                    errors[field.name] = "Enter a valid date."
                else:
                    problem = self._date_problem(action, field, parsed)
                    if problem:
                        errors[field.name] = problem
            values[field.name] = text
        if action.kind == "bank_details" and not errors and values.get("account_number") != values.get("confirm_account_number"):
            errors["confirm_account_number"] = "Account numbers don't match."
        if errors:
            raise TaskActionError(422, "Please fix the highlighted fields.", errors, code="validation_failed")
        return values

    def _date_problem(self, action: ActionDef, field: FieldDef, value: date) -> str | None:
        today = self._settings.today()
        if action.kind == "profile" and field.name == "date_of_birth":
            age = today.year - value.year - ((today.month, today.day) < (value.month, value.day))
            if not 16 <= age <= 100:
                return "Enter your real date of birth."
        if action.kind == "meeting" and field.name == "met_on":
            if value > today:
                return "The meeting must already have taken place."
            if (today - value).days > 365:
                return "Enter a date within the last year."
        return None

    def _save_profile(self, values: dict[str, Any]) -> None:
        profile = self._employee.profile
        if profile is None:
            raise TaskActionError(409, "Your account has no employee profile. Please contact HR.")
        profile.phone = values["phone"]
        profile.personal_email = values["personal_email"].lower()
        profile.date_of_birth = date.fromisoformat(values["date_of_birth"])
        profile.address = values["address"]

    def _save_bank_details(self, values: dict[str, Any]) -> None:
        record = self._session.scalars(select(BankDetailsRecord).where(BankDetailsRecord.employee_id == self._employee.id)).first()
        if record is None:
            record = BankDetailsRecord(employee_id=self._employee.id)
            self._session.add(record)
        record.account_holder = values["account_holder"]
        record.bank_name = values["bank_name"]
        record.ifsc = values["ifsc"].upper()
        record.account_number_encrypted = self._cipher.encrypt(values["account_number"])
        record.account_last4 = values["account_number"][-4:]

    def _save_emergency_contact(self, values: dict[str, Any]) -> None:
        record = self._session.scalars(select(EmergencyContactRecord).where(EmergencyContactRecord.employee_id == self._employee.id)).first()
        if record is None:
            record = EmergencyContactRecord(employee_id=self._employee.id)
            self._session.add(record)
        record.name = values["name"]
        record.relationship = values["relationship"]
        record.phone = values["phone"]
        record.email = (values.get("email") or None) and values["email"].lower()

    def _form_values(self, action: ActionDef, progress: dict[str, Any]) -> tuple[dict[str, str | bool], dict[str, str]]:
        values: dict[str, str | bool] = dict(progress.get("values", {}))
        masked: dict[str, str] = {}
        if action.kind == "profile" and self._employee.profile is not None:
            p = self._employee.profile
            values.update({k: v for k, v in {
                "phone": p.phone, "personal_email": p.personal_email, "address": p.address,
                "date_of_birth": p.date_of_birth.isoformat() if p.date_of_birth else None,
            }.items() if v})  # fmt: skip
        elif action.kind == "bank_details":
            bank = self._session.scalars(select(BankDetailsRecord).where(BankDetailsRecord.employee_id == self._employee.id)).first()
            if bank is not None:
                values.update({"account_holder": bank.account_holder, "bank_name": bank.bank_name, "ifsc": bank.ifsc})
                masked["account_number"] = f"•••• {bank.account_last4}"
        elif action.kind == "emergency_contact":
            contact = self._session.scalars(select(EmergencyContactRecord).where(EmergencyContactRecord.employee_id == self._employee.id)).first()
            if contact is not None:
                values.update({"name": contact.name, "relationship": contact.relationship, "phone": contact.phone, **({"email": contact.email} if contact.email else {})})
        for field in action.fields:
            if field.sensitive:
                values.pop(field.name, None)
            if field.fixed_value is not None:
                values[field.name] = field.fixed_value
        return values, masked

    def _grade(self, action: ActionDef, answers: dict[str, int], previous: dict[str, Any]) -> dict[str, Any]:
        quiz = action.quiz
        assert quiz is not None
        missing = [q.id for q in quiz.questions if q.id not in answers]
        if missing:
            raise TaskActionError(422, "Answer every question before submitting.")
        results = [{"question_id": q.id, "correct": answers[q.id] == q.answer} for q in quiz.questions]
        score = round(100 * sum(r["correct"] for r in results) / len(results))
        best = max(score, previous.get("best_score") or 0)
        return {
            "attempts": previous.get("attempts", 0) + 1,
            "last_score": score,
            "best_score": best,
            "passed": previous.get("passed", False) or score >= quiz.pass_mark,
            "last_results": results,
        }

    @staticmethod
    def _quiz_message(quiz_state: dict[str, Any], pass_mark: int) -> str:
        if quiz_state["last_score"] >= pass_mark:
            return f"You scored {quiz_state['last_score']}% and passed."
        return f"You scored {quiz_state['last_score']}%. You need {pass_mark}% to pass. Review the material and try again."

    # ---- Records -----------------------------------------------------------------------------------------------

    def _task(self, task_key: str) -> tuple[OnboardingTaskRecord, ActionDef]:
        record = self._tasks.get_record(task_key)  # raises TaskNotFoundError for other employees' tasks too
        action = action_for(record.action_key)
        if action is None:
            raise TaskActionError(409, "This task has no action to complete.", code="no_action")
        return record, action

    def _progress_record(self, record: OnboardingTaskRecord) -> TaskProgressRecord | None:
        return self._session.scalars(select(TaskProgressRecord).where(TaskProgressRecord.task_id == record.id)).first()

    def _progress_data(self, record: OnboardingTaskRecord) -> dict[str, Any]:
        progress = self._progress_record(record)
        try:
            return json.loads(progress.data) if progress and progress.data else {}
        except ValueError:
            return {}

    def _save_progress(self, record: OnboardingTaskRecord, data: dict[str, Any]) -> None:
        progress = self._progress_record(record)
        merged = {**self._progress_data(record), **data}
        if progress is None:
            self._session.add(TaskProgressRecord(task_id=record.id, data=json.dumps(merged)))
        else:
            progress.data = json.dumps(merged)

    def _complete(self, record: OnboardingTaskRecord) -> None:
        set_record_status(record, TaskStatus.COMPLETED)
        self._session.flush()
        progress = self._progress_record(record)
        if progress is not None:
            progress.submitted_at = datetime.now(timezone.utc)

    @staticmethod
    def _mark_started(record: OnboardingTaskRecord) -> None:
        if record.status == TaskStatus.PENDING:
            set_record_status(record, TaskStatus.IN_PROGRESS)

    def _documents(self, record: OnboardingTaskRecord) -> list[TaskDocumentRecord]:
        return list(
            self._session.scalars(
                select(TaskDocumentRecord).where(TaskDocumentRecord.task_id == record.id, TaskDocumentRecord.employee_id == self._employee.id)
            )
        )

    def _document_path(self, storage_name: str) -> Path:
        if not STORAGE_NAME.fullmatch(storage_name):
            raise ValueError("invalid storage name")
        return self._settings.employee_documents_dir / str(self._employee.id) / storage_name

    @staticmethod
    def _document_out(document: TaskDocumentRecord) -> UploadedDocumentOut:
        uploaded_at = document.uploaded_at if document.uploaded_at.tzinfo else document.uploaded_at.replace(tzinfo=timezone.utc)
        return UploadedDocumentOut(id=document.id, filename=document.filename, content_type=document.content_type, size_bytes=document.size_bytes, uploaded_at=uploaded_at)

    def _policy_out(self, policy_id: str, title: str, acknowledged: bool) -> PolicyOut:
        document = find_published_policy(self._session, policy_id)
        quiz = quiz_for(policy_id)
        quizzes = PolicyQuizService(self._session, self._employee, self._settings.policy_quiz_pass_percent)
        quiz_fields = {}
        if quiz is not None:
            summary = quizzes.summary(policy_id)
            quiz_fields = {"quiz_available": True, "quiz_passed": summary.passed, "quiz_best_score": summary.best_score, "quiz_total": summary.question_count}
        if document is None:
            return PolicyOut(policy_id=policy_id, title=title, available=False, **quiz_fields)
        return PolicyOut(
            policy_id=policy_id, title=title, available=True, document_id=document.id, filename=document.filename,
            file_type=document.file_type.value, acknowledged=acknowledged, **quiz_fields,
        )  # fmt: skip

    def _policy_quiz_status(self, action: ActionDef) -> list[PolicyOut]:
        return [self._policy_out(p.policy_id, p.title, False) for p in action.policies]

    def _require_prerequisites(self, record: OnboardingTaskRecord) -> None:
        if record.status == TaskStatus.COMPLETED:
            return
        blocking = incomplete_prerequisites(self._session, record)
        if blocking:
            raise TaskActionError(409, prerequisite_message(blocking), code="prerequisite_incomplete")

    @staticmethod
    def _field_out(field: FieldDef) -> FieldOut:
        return FieldOut(
            name=field.name, label=field.label, type=field.type, required=field.required, max_length=field.max_length,
            min_length=field.min_length, pattern=field.pattern, pattern_message=field.pattern_message,
            options=list(field.options), help=field.help, fixed_value=field.fixed_value,
        )  # fmt: skip
