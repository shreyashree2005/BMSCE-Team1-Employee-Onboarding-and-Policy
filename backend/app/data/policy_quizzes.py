"""Policy understanding quizzes: a curated question bank linked to the published demo policies.

Every question is written from the text of the policy it belongs to (see docs/demo-policies/generate_demo_policies.py)
and cites the section it comes from in its explanation. Correct answers stay on the server: the API sends only the
questions and options, and reveals answers and explanations after an attempt is graded.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class QuestionSource:
    """The policy passage a question was built from (questions generated from Policy Assistant answers)."""

    chunk_id: int
    document_id: str
    document_name: str
    page_number: int | None
    section: str | None
    excerpt: str


@dataclass(frozen=True)
class PolicyQuestion:
    id: str
    question: str
    options: tuple[str, str, str, str]
    answer: int  # index into options
    explanation: str
    source: QuestionSource | None = None


@dataclass(frozen=True)
class PolicyQuiz:
    policy_id: str
    title: str
    questions: tuple[PolicyQuestion, ...]


POLICY_QUIZZES: dict[str, PolicyQuiz] = {
    quiz.policy_id: quiz
    for quiz in (
        PolicyQuiz(
            "OIQ-HR-COC-007",
            "Code of Conduct Policy",
            (
                PolicyQuestion(
                    "coc-gifts",
                    "A supplier offers you a gift. Up to what value per occasion may you accept it?",
                    ("INR 500", "INR 2,000", "INR 5,000", "Any value, if you declare it later"),
                    1,
                    "Section 4 (Ethics): gifts and hospitality may be accepted only up to INR 2,000 per occasion. Anything above that must be declined or declared to People Operations.",
                ),
                PolicyQuestion(
                    "coc-email",
                    "How quickly should you reply to an internal email?",
                    ("Within one hour", "Within one working day, even if only to acknowledge it", "Within three working days", "Only when you have a full answer"),
                    1,
                    "Section 2 (Professional communication): reply to internal emails within one working day, even if only to acknowledge them.",
                ),
                PolicyQuestion(
                    "coc-posh",
                    "Within what time should a sexual harassment complaint be made to the Internal Committee?",
                    ("Within 7 days", "Within 30 days", "Within 3 months of the incident", "There is no time limit"),
                    2,
                    "Section 3 (Anti-harassment): complaints should be made in writing within three months of the incident to the Internal Committee (IC) under the POSH policy.",
                ),
                PolicyQuestion(
                    "coc-conflict",
                    "You become aware of a potential conflict of interest. What does the policy require?",
                    (
                        "Declare it to your manager and People Operations within 7 days",
                        "Mention it at your annual review",
                        "Nothing, unless it involves money",
                        "Report it anonymously to the ethics line only",
                    ),
                    0,
                    "Section 4 (Ethics): declare any actual or potential conflict of interest to your manager and People Operations within seven days of becoming aware of it.",
                ),
                PolicyQuestion(
                    "coc-appeal",
                    "How long do you have to appeal a disciplinary decision?",
                    ("24 hours", "7 working days, in writing to the Head of People Operations", "30 days, verbally to your manager", "Disciplinary decisions can't be appealed"),
                    1,
                    "Section 5 (Disciplinary procedures): you can appeal in writing to the Head of People Operations within seven working days of the decision.",
                ),
            ),
        ),
        PolicyQuiz(
            "OIQ-IT-SEC-006",
            "IT and Information Security Policy",
            (
                PolicyQuestion(
                    "sec-password-length",
                    "What is the minimum length for a password?",
                    ("8 characters", "10 characters", "12 characters", "14 characters"),
                    3,
                    "Section 1 (Password requirements): passwords must be at least fourteen (14) characters long, generated and stored with the company password manager.",
                ),
                PolicyQuestion(
                    "sec-lost-device",
                    "Your company laptop is stolen. When must you report it to the IT service desk?",
                    ("Within 1 hour of noticing", "By the end of the day", "Within 7 days", "Only if it contained confidential data"),
                    0,
                    "Section 2 (Device usage) and Section 5: report a lost or stolen device, or any suspected security incident, within one hour.",
                ),
                PolicyQuestion(
                    "sec-salaries",
                    "Which classification applies to customer data and salaries?",
                    ("Public", "Internal", "Confidential", "Restricted"),
                    2,
                    "Section 3 (Data confidentiality): customer data and salaries are Confidential — need-to-know and encrypted. Credentials and security keys are Restricted.",
                ),
                PolicyQuestion(
                    "sec-phishing",
                    "You receive an unexpected email with a link from someone who looks like a colleague. What should you do?",
                    (
                        "Click the link to check whether it's genuine",
                        "Forward it to your whole team as a warning",
                        "Don't click it; report it with the Report Phishing button or forward it to IT security",
                        "Reply and ask the sender if it's real",
                    ),
                    2,
                    "Section 4 (Phishing awareness): don't click links or open attachments in unexpected emails, even from a colleague; report them with the Report Phishing button or forward them to the IT security team.",
                ),
                PolicyQuestion(
                    "sec-updates",
                    "How soon must operating system and security updates be installed?",
                    ("Within 24 hours", "Within 7 days of release", "Within 30 days", "Whenever it's convenient"),
                    1,
                    "Section 2 (Device usage): install operating system and security updates within seven days of release.",
                ),
            ),
        ),
        PolicyQuiz(
            "OIQ-HR-LEA-001",
            "Leave and Attendance Policy",
            (
                PolicyQuestion(
                    "lea-annual",
                    "How many days of paid annual leave do full-time employees receive per calendar year?",
                    ("12 days", "15 days", "18 days", "24 days"),
                    2,
                    "Section 1 (Annual paid leave): full-time employees receive eighteen (18) days of paid annual leave per calendar year, accruing at 1.5 days per month.",
                ),
                PolicyQuestion(
                    "lea-new-joiner",
                    "When can a new joiner start using accrued annual leave?",
                    ("From the first day", "After 30 days of service", "After 90 days of service", "After confirmation at 6 months"),
                    1,
                    "Section 1: new joiners can start using accrued annual leave after completing their first thirty (30) days of service.",
                ),
                PolicyQuestion(
                    "lea-medical",
                    "When is a medical certificate required for sick leave?",
                    ("For any sick leave", "For more than 1 day", "For more than 3 consecutive days", "Never"),
                    2,
                    "Section 2 (Sick leave): a medical certificate from a registered doctor is required for sick leave longer than three consecutive days.",
                ),
                PolicyQuestion(
                    "lea-notice",
                    "How much notice do annual leave requests need (for fewer than five days)?",
                    ("Same day", "At least 3 working days", "At least 2 weeks", "At least 1 month"),
                    1,
                    "Section 6 (Leave application): annual leave requests must be submitted at least three working days in advance; five or more consecutive days need two weeks' notice.",
                ),
                PolicyQuestion(
                    "lea-core-hours",
                    "What are the core collaboration hours when everyone must be available?",
                    ("9:00 AM – 6:00 PM", "10:00 AM – 4:00 PM", "11:00 AM – 3:00 PM", "There are no core hours"),
                    1,
                    "Section 7 (Attendance rules): core collaboration hours are 10:00 AM to 4:00 PM on working days.",
                ),
            ),
        ),
    )
}


def quiz_for(policy_id: str) -> PolicyQuiz | None:
    return POLICY_QUIZZES.get(policy_id)


def _check() -> None:
    for quiz in POLICY_QUIZZES.values():
        assert 3 <= len(quiz.questions) <= 5, f"{quiz.policy_id}: a quiz needs 3-5 questions"
        assert len({q.id for q in quiz.questions}) == len(quiz.questions), f"{quiz.policy_id}: duplicate question IDs"
        for question in quiz.questions:
            assert 0 <= question.answer < len(question.options), f"{question.id}: answer out of range"
            assert len(set(question.options)) == len(question.options), f"{question.id}: duplicate options"


_check()
