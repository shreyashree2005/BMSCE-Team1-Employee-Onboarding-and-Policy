"""Policy understanding quiz schemas. Correct answers appear only in graded results, never in the quiz itself."""

from datetime import datetime

from pydantic import ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.schemas.onboarding import CamelModel


class PolicyQuizQuestionOut(CamelModel):
    id: str
    question: str
    options: list[str]


class PolicyQuizAttemptOut(CamelModel):
    id: int
    score: int
    total: int
    passed: bool
    created_at: datetime


class PolicyQuizSummary(CamelModel):
    policy_id: str
    title: str
    question_count: int
    pass_score: int
    attempts: int
    best_score: int | None = None
    passed: bool = False
    # The published policy document to read first (null if HR hasn't uploaded it yet).
    document_id: str | None = None


class PolicyQuizOut(PolicyQuizSummary):
    pass_percent: int
    questions: list[PolicyQuizQuestionOut]
    history: list[PolicyQuizAttemptOut]


class PolicyQuizSubmission(CamelModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    answers: dict[str, int] = Field(max_length=20)


class PolicyQuizSource(CamelModel):
    """The policy passage a question comes from (same shape as a Policy Assistant citation)."""

    chunk_id: int
    document_id: str
    document_name: str
    page_number: int | None
    section: str | None
    excerpt: str


class PolicyQuizQuestionResult(CamelModel):
    id: str
    question: str
    options: list[str]
    chosen: int
    correct_option: int
    correct: bool
    feedback: str
    explanation: str
    # Set for quizzes built from a Policy Assistant answer (revealed only after grading, like the answers).
    source: PolicyQuizSource | None = None


class PolicyQuizResult(CamelModel):
    policy_id: str
    title: str
    score: int
    total: int
    pass_score: int
    passed: bool
    message: str
    results: list[PolicyQuizQuestionResult]
    history: list[PolicyQuizAttemptOut]
    # Onboarding tasks this attempt completed (e.g. "Read company policies" once every quiz in it is passed).
    completed_task_ids: list[str] = Field(default_factory=list)


class AnswerQuizRequest(CamelModel):
    """Build a quiz from a Policy Assistant answer: the chunk IDs of its citations, in the order they were cited."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    chunk_ids: list[int] = Field(min_length=1, max_length=10)


class AnswerQuizOut(CamelModel):
    # Where attempts are recorded, e.g. "chat:OIQ-HR-LEA-001" (separate from the curated quizzes' policy IDs).
    quiz_key: str
    title: str
    chunk_ids: list[int]
    question_count: int
    pass_score: int
    questions: list[PolicyQuizQuestionOut]
    history: list[PolicyQuizAttemptOut]


class AnswerQuizSubmission(AnswerQuizRequest):
    answers: dict[str, int] = Field(max_length=20)
