"""Policy understanding quizzes: serve questions (without answers), grade attempts on the server, keep history."""

import json
import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data.policy_quizzes import POLICY_QUIZZES, PolicyQuiz, quiz_for
from app.services.policy_quiz_generator import QuizUnavailableError, build_answer_quiz
from app.db.models import PolicyDocumentRecord, PolicyQuizAttemptRecord, UserRecord
from app.schemas.policies import DocumentStatus
from app.schemas.policy_quiz import (
    PolicyQuizAttemptOut,
    PolicyQuizOut,
    PolicyQuizQuestionOut,
    PolicyQuizQuestionResult,
    PolicyQuizResult,
    PolicyQuizSource,
    PolicyQuizSummary,
    AnswerQuizOut,
)

CORRECT_FEEDBACK = "Great! You understood this concept."
REREAD_MESSAGE = "You may want to read the policy again before attempting the quiz."


class PolicyQuizError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def find_published_policy(session: Session, policy_id: str) -> PolicyDocumentRecord | None:
    """The newest ready document whose filename carries the policy ID (e.g. OIQ-HR-COC-007_Code-of-Conduct.pdf)."""
    return session.scalars(
        select(PolicyDocumentRecord)
        .where(PolicyDocumentRecord.status == DocumentStatus.READY, PolicyDocumentRecord.filename.ilike(f"%{policy_id}%"))
        .order_by(PolicyDocumentRecord.uploaded_at.desc())
    ).first()


def pass_score(total: int, pass_percent: int) -> int:
    """Correct answers needed to pass, rounded up (80% of 5 questions = 4)."""
    return max(1, math.ceil(total * pass_percent / 100))


def result_message(score: int, total: int, needed: int) -> str:
    if score == total:
        return f"Your Score: {score}/{total}. Excellent — you answered every question correctly!"
    if score >= needed:
        return f"Your Score: {score}/{total}. Well done, you passed. Review the explanations for the question you missed."
    if score == 0:
        return f"Your Score: {score}/{total}. {REREAD_MESSAGE}"
    return f"Your Score: {score}/{total}. You need {needed}/{total} to pass. Review the policy, then retake the quiz."


class PolicyQuizService:
    def __init__(self, session: Session, user: UserRecord, pass_percent: int) -> None:
        self._session = session
        self._user = user
        self._pass_percent = pass_percent

    def has_passed(self, policy_id: str) -> bool:
        return (
            self._session.scalar(
                select(PolicyQuizAttemptRecord.id).where(
                    PolicyQuizAttemptRecord.user_id == self._user.id,
                    PolicyQuizAttemptRecord.policy_id == policy_id,
                    PolicyQuizAttemptRecord.passed.is_(True),
                )
            )
            is not None
        )

    def summary(self, policy_id: str) -> PolicyQuizSummary:
        return self._summary(self._quiz(policy_id))

    def list_quizzes(self) -> list[PolicyQuizSummary]:
        return [self._summary(quiz) for quiz in POLICY_QUIZZES.values()]

    def get_quiz(self, policy_id: str) -> PolicyQuizOut:
        quiz = self._quiz(policy_id)
        summary = self._summary(quiz)
        return PolicyQuizOut(
            **summary.model_dump(),
            pass_percent=self._pass_percent,
            questions=[PolicyQuizQuestionOut(id=q.id, question=q.question, options=list(q.options)) for q in quiz.questions],
            history=self._history(policy_id),
        )

    def grade(self, policy_id: str, answers: dict[str, int]) -> PolicyQuizResult:
        quiz = self._quiz(policy_id)
        if find_published_policy(self._session, policy_id) is None:
            raise PolicyQuizError(409, f"The {quiz.title} hasn't been published yet, so its quiz isn't available. Please contact HR.")
        return self._grade(quiz, answers, attempt_key=policy_id)

    # ---- Quizzes built from a Policy Assistant answer ----

    def answer_quiz(self, chunk_ids: list[int]) -> AnswerQuizOut:
        """Five questions from the answer's cited passages. The correct options stay on the server."""
        generated = self._build(chunk_ids)
        quiz = generated.quiz
        return AnswerQuizOut(
            quiz_key=generated.attempt_key, title=quiz.title, chunk_ids=generated.chunk_ids, question_count=len(quiz.questions),
            pass_score=pass_score(len(quiz.questions), self._pass_percent),
            questions=[PolicyQuizQuestionOut(id=q.id, question=q.question, options=list(q.options)) for q in quiz.questions],
            history=self._history(generated.attempt_key),
        )  # fmt: skip

    def grade_answer_quiz(self, chunk_ids: list[int], answers: dict[str, int]) -> PolicyQuizResult:
        """Rebuilds the same quiz from the same passages and grades it with the curated quizzes' scoring."""
        generated = self._build(chunk_ids)
        return self._grade(generated.quiz, answers, attempt_key=generated.attempt_key)

    def _build(self, chunk_ids: list[int]):  # noqa: ANN202 - GeneratedQuiz
        try:
            return build_answer_quiz(self._session, chunk_ids)
        except QuizUnavailableError as error:
            raise PolicyQuizError(error.status_code, error.message) from error

    # ---- Grading (shared) ----

    def _grade(self, quiz: PolicyQuiz, answers: dict[str, int], *, attempt_key: str) -> PolicyQuizResult:
        policy_id = attempt_key
        expected = {q.id for q in quiz.questions}
        if set(answers) != expected:
            raise PolicyQuizError(422, "Answer every question before submitting.")
        if any(not 0 <= answers[q.id] < len(q.options) for q in quiz.questions):
            raise PolicyQuizError(422, "One of the answers isn't a valid option.")

        results = []
        for q in quiz.questions:
            correct = answers[q.id] == q.answer
            results.append(
                PolicyQuizQuestionResult(
                    id=q.id, question=q.question, options=list(q.options), chosen=answers[q.id], correct_option=q.answer,
                    correct=correct, feedback=CORRECT_FEEDBACK if correct else f"The correct answer is: {q.options[q.answer]}.",
                    explanation=q.explanation,
                    source=PolicyQuizSource(**q.source.__dict__) if q.source else None,
                )  # fmt: skip
            )
        score = sum(r.correct for r in results)
        total = len(results)
        needed = pass_score(total, self._pass_percent)
        passed = score >= needed
        self._session.add(
            PolicyQuizAttemptRecord(user_id=self._user.id, policy_id=policy_id, score=score, total=total, passed=passed, answers=json.dumps(answers))
        )
        self._session.flush()
        return PolicyQuizResult(
            policy_id=policy_id, title=quiz.title, score=score, total=total, pass_score=needed, passed=passed,
            message=result_message(score, total, needed), results=results, history=self._history(policy_id),
        )  # fmt: skip

    # ---- helpers ----

    def _quiz(self, policy_id: str) -> PolicyQuiz:
        quiz = quiz_for(policy_id)
        if quiz is None:
            raise PolicyQuizError(404, "There's no understanding quiz for this policy.")
        return quiz

    def _attempts(self, policy_id: str) -> list[PolicyQuizAttemptRecord]:
        return list(
            self._session.scalars(
                select(PolicyQuizAttemptRecord)
                .where(PolicyQuizAttemptRecord.user_id == self._user.id, PolicyQuizAttemptRecord.policy_id == policy_id)
                .order_by(PolicyQuizAttemptRecord.id)
            )
        )

    def _history(self, policy_id: str) -> list[PolicyQuizAttemptOut]:
        return [
            PolicyQuizAttemptOut(id=a.id, score=a.score, total=a.total, passed=a.passed, created_at=a.created_at) for a in self._attempts(policy_id)
        ]

    def _summary(self, quiz: PolicyQuiz) -> PolicyQuizSummary:
        attempts = self._attempts(quiz.policy_id)
        document = find_published_policy(self._session, quiz.policy_id)
        return PolicyQuizSummary(
            policy_id=quiz.policy_id, title=quiz.title, question_count=len(quiz.questions),
            pass_score=pass_score(len(quiz.questions), self._pass_percent), attempts=len(attempts),
            best_score=max((a.score for a in attempts), default=None), passed=any(a.passed for a in attempts),
            document_id=document.id if document else None,
        )  # fmt: skip
