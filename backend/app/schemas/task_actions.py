"""Task action schemas (camelCase JSON). Quiz answers and sensitive values (bank account numbers) never appear here."""

from datetime import datetime

from pydantic import ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.schemas.onboarding import CamelModel, OnboardingTask


class FieldOut(CamelModel):
    name: str
    label: str
    type: str
    required: bool
    max_length: int
    min_length: int
    pattern: str | None = None
    pattern_message: str | None = None
    options: list[str] = []
    help: str | None = None
    fixed_value: str | None = None


class UploadedDocumentOut(CamelModel):
    id: int
    filename: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime


class DocumentRequirementOut(CamelModel):
    id: str
    label: str
    hint: str
    uploaded: UploadedDocumentOut | None = None


class ChecklistItemOut(CamelModel):
    id: str
    label: str
    help: str
    checked: bool


class PolicyOut(CamelModel):
    policy_id: str
    title: str
    available: bool
    document_id: str | None = None
    filename: str | None = None
    file_type: str | None = None
    acknowledged: bool = False
    # Understanding quiz for this policy (when the question bank has one): it must be passed to finish the task.
    quiz_available: bool = False
    quiz_passed: bool = False
    quiz_best_score: int | None = None
    quiz_total: int | None = None


class SectionOut(CamelModel):
    id: str
    title: str
    paragraphs: list[str]
    completed: bool


class QuizQuestionOut(CamelModel):
    id: str
    question: str
    options: list[str]


class QuizResultOut(CamelModel):
    question_id: str
    correct: bool


class QuizOut(CamelModel):
    pass_mark: int
    questions: list[QuizQuestionOut]
    attempts: int = 0
    best_score: int | None = None
    last_score: int | None = None
    passed: bool = False
    last_results: list[QuizResultOut] = []


class TaskActionState(CamelModel):
    task: OnboardingTask
    action_type: str
    kind: str | None = None
    instructions: str
    completed: bool
    completed_at: datetime | None = None
    message: str | None = None
    fields: list[FieldOut] = []
    values: dict[str, str | bool] = {}
    masked_values: dict[str, str] = {}
    documents: list[DocumentRequirementOut] = []
    items: list[ChecklistItemOut] = []
    policies: list[PolicyOut] = []
    signature: str | None = None
    sections: list[SectionOut] = []
    quiz: QuizOut | None = None


class TaskActionSubmission(CamelModel):
    """What the employee submits for a task's action; which fields apply depends on the action type."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    values: dict[str, str | bool] | None = Field(default=None, description="form: field values")
    checked_items: list[str] | None = Field(default=None, description="checklist: IDs of completed items")
    acknowledged_policies: list[str] | None = Field(default=None, description="policy acknowledgment: policy IDs")
    signature: str | None = Field(default=None, max_length=200, description="policy acknowledgment: your full name")
    completed_section: str | None = Field(default=None, max_length=64, description="training: a module you finished")
    answers: dict[str, int] | None = Field(default=None, description="quiz: question ID -> chosen option index")
    complete: bool = Field(default=False, description="checklist / documents: submit for completion")
