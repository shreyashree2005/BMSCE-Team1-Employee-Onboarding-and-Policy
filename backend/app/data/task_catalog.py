"""Onboarding task catalog: what each task asks the employee to do, and which tasks each job role receives.

Every task has an *action* that completes it (a form, document uploads, a checklist, policy acknowledgments,
training, or a quiz). Tasks become "completed" only when the server has validated that action. Quiz answers live
here, server-side, and are never sent to the browser.

Content is fictional demonstration material consistent with the OnboardIQ Technologies demo policies.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from enum import Enum

from app.data.job_roles import JobRole
from app.schemas.onboarding import OnboardingStage as Stage
from app.schemas.onboarding import OnboardingTask, TaskCategory as Category, TaskPriority as Priority, TaskStatus
from app.services.work_calendar import WorkCalendar


class ActionType(str, Enum):
    FORM = "form"
    DOCUMENT_UPLOAD = "document_upload"
    CHECKLIST = "checklist"
    POLICY_ACKNOWLEDGMENT = "policy_acknowledgment"
    TRAINING = "training"
    QUIZ = "quiz"


# ---- Building blocks ---------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class FieldDef:
    name: str
    label: str
    type: str = "text"  # text | email | tel | date | textarea | select | number | checkbox
    required: bool = True
    max_length: int = 200
    min_length: int = 0
    pattern: str | None = None
    pattern_message: str | None = None
    options: tuple[str, ...] = ()
    help: str | None = None
    sensitive: bool = False  # never echoed back to the browser
    fixed_value: str | None = None  # shown read-only and always stored as this value


@dataclass(frozen=True)
class DocumentRequirement:
    id: str
    label: str
    hint: str


@dataclass(frozen=True)
class ChecklistItem:
    id: str
    label: str
    help: str = ""


@dataclass(frozen=True)
class PolicyRef:
    policy_id: str  # matched against uploaded policy file names, e.g. "OIQ-HR-COC-007"
    title: str


@dataclass(frozen=True)
class TrainingSection:
    id: str
    title: str
    paragraphs: tuple[str, ...]


@dataclass(frozen=True)
class QuizQuestion:
    id: str
    question: str
    options: tuple[str, ...]
    answer: int  # index into options; server-side only


@dataclass(frozen=True)
class Quiz:
    questions: tuple[QuizQuestion, ...]
    pass_mark: int = 80  # percent


@dataclass(frozen=True)
class ActionDef:
    key: str
    type: ActionType
    instructions: str
    kind: str | None = None  # form kind: profile, bank_details, emergency_contact, access_request, meeting, goals, ...
    fields: tuple[FieldDef, ...] = ()
    documents: tuple[DocumentRequirement, ...] = ()
    items: tuple[ChecklistItem, ...] = ()
    policies: tuple[PolicyRef, ...] = ()
    sections: tuple[TrainingSection, ...] = ()
    quiz: Quiz | None = None


@dataclass(frozen=True)
class TaskTemplate:
    key: str
    title: str
    description: str
    stage: Stage
    category: Category
    priority: Priority
    due_offset_days: int  # relative to the employee's start date
    action_key: str


# ---- Reusable form fields ------------------------------------------------------------------------------------------

_PHONE = r"^\+?[0-9][0-9 ()-]{6,18}[0-9]$"
_PHONE_MESSAGE = "Enter a valid phone number (digits, spaces, +, - or brackets)."


def _access_request(key: str, system: str, levels: tuple[str, ...], instructions: str) -> ActionDef:
    return ActionDef(
        key=key,
        type=ActionType.FORM,
        kind="access_request",
        instructions=instructions,
        fields=(
            FieldDef("system", "System", fixed_value=system),
            FieldDef("access_level", "Access needed", type="select", options=levels),
            FieldDef("justification", "Why you need it", type="textarea", min_length=20, max_length=600, help="Describe the project or work this access is for (at least 20 characters)."),
            FieldDef("manager_name", "Approving manager", max_length=120),
        ),
    )


def _meeting(key: str, instructions: str, attendees_label: str) -> ActionDef:
    return ActionDef(
        key=key,
        type=ActionType.FORM,
        kind="meeting",
        instructions=instructions,
        fields=(
            FieldDef("met_on", "Date of the meeting", type="date", help="The meeting must already have taken place."),
            FieldDef("attendees", attendees_label, max_length=300),
            FieldDef("notes", "What you discussed or learned", type="textarea", min_length=20, max_length=1500),
        ),
    )


# ---- Action catalog ------------------------------------------------------------------------------------------------

_ACTIONS: list[ActionDef] = [
    ActionDef(
        key="profile",
        type=ActionType.FORM,
        kind="profile",
        instructions="Add your personal contact details. They are saved to your employee record and visible only to you and People Operations.",
        fields=(
            FieldDef("phone", "Mobile phone", type="tel", max_length=32, pattern=_PHONE, pattern_message=_PHONE_MESSAGE),
            FieldDef("personal_email", "Personal email", type="email", max_length=254),
            FieldDef("date_of_birth", "Date of birth", type="date"),
            FieldDef("address", "Current address", type="textarea", min_length=10, max_length=400),
        ),
    ),
    ActionDef(
        key="documents",
        type=ActionType.DOCUMENT_UPLOAD,
        instructions="Upload a clear scan or photo of each document (PDF, JPG or PNG, up to 5 MB). Submit once every document is uploaded.",
        documents=(
            DocumentRequirement("id_proof", "Government photo ID", "Passport, national ID card or driving licence."),
            DocumentRequirement("address_proof", "Proof of address", "Utility bill, rental agreement or bank statement from the last 3 months."),
            DocumentRequirement("education_certificate", "Highest education certificate", "Degree or diploma certificate."),
        ),
    ),
    ActionDef(
        key="identity_documents",
        type=ActionType.DOCUMENT_UPLOAD,
        instructions="Upload your identity documents (PDF, JPG or PNG, up to 5 MB each), then submit.",
        documents=(
            DocumentRequirement("id_proof", "Government photo ID", "Passport, national ID card or driving licence."),
            DocumentRequirement("address_proof", "Proof of address", "Utility bill, rental agreement or bank statement from the last 3 months."),
        ),
    ),
    ActionDef(
        key="offer_nda",
        type=ActionType.DOCUMENT_UPLOAD,
        instructions="Upload your signed offer letter and signed non-disclosure agreement (PDF, JPG or PNG, up to 5 MB each), then submit.",
        documents=(
            DocumentRequirement("signed_offer_letter", "Signed offer letter", "Every page signed and dated."),
            DocumentRequirement("signed_nda", "Signed NDA", "The non-disclosure agreement sent with your offer."),
        ),
    ),
    ActionDef(
        key="bank_details",
        type=ActionType.FORM,
        kind="bank_details",
        instructions="Your salary is paid to this account on the last working day of each month. The account number is encrypted and only its last 4 digits are shown afterwards.",
        fields=(
            FieldDef("account_holder", "Account holder name", max_length=200),
            FieldDef("bank_name", "Bank name", max_length=150),
            FieldDef("ifsc", "IFSC code", max_length=11, pattern=r"^[A-Za-z]{4}0[A-Za-z0-9]{6}$", pattern_message="Enter a valid 11-character IFSC code, e.g. HDFC0001234."),
            FieldDef("account_number", "Account number", max_length=18, pattern=r"^[0-9]{9,18}$", pattern_message="Enter 9 to 18 digits.", sensitive=True),
            FieldDef("confirm_account_number", "Confirm account number", max_length=18, sensitive=True),
        ),
    ),
    ActionDef(
        key="emergency_contact",
        type=ActionType.FORM,
        kind="emergency_contact",
        instructions="Who should we contact in an emergency? This is used only by People Operations.",
        fields=(
            FieldDef("name", "Contact name", max_length=200),
            FieldDef("relationship", "Relationship", type="select", options=("Spouse or partner", "Parent", "Sibling", "Child", "Friend", "Other")),
            FieldDef("phone", "Phone number", type="tel", max_length=32, pattern=_PHONE, pattern_message=_PHONE_MESSAGE),
            FieldDef("email", "Email (optional)", type="email", required=False, max_length=254),
        ),
    ),
    ActionDef(
        key="it_setup",
        type=ActionType.CHECKLIST,
        instructions="Work through each step with your new laptop. Tick a step once it's done; the task completes when every step is ticked.",
        items=(
            ChecklistItem("collect_laptop", "Collect your laptop and ID badge", "From the IT service desk on your first day."),
            ChecklistItem("change_password", "Sign in and change your temporary password", "Use at least 14 characters (IT and Information Security Policy)."),
            ChecklistItem("enable_mfa", "Enable multi-factor authentication", "Enrol the authenticator app on your phone for email, VPN and business apps."),
            ChecklistItem("install_vpn", "Install and test the company VPN", "Always connect through the VPN when working remotely."),
            ChecklistItem("password_manager", "Set up the company password manager", "Store work passwords only in the company password manager."),
            ChecklistItem("encryption_check", "Confirm disk encryption and 5-minute screen lock", "Both are required on company laptops."),
        ),
    ),
    ActionDef(
        key="vpn_mfa",
        type=ActionType.CHECKLIST,
        instructions="Set up secure remote access. Tick each step once it's done.",
        items=(
            ChecklistItem("install_vpn", "Install the VPN client", "Download it from the company software portal."),
            ChecklistItem("enable_mfa", "Enrol your phone for multi-factor authentication", "Required for email, VPN and all business applications."),
            ChecklistItem("test_connection", "Connect to the VPN and sign in with MFA once", "Confirms both are working."),
        ),
    ),
    ActionDef(
        key="company_policies",
        type=ActionType.POLICY_ACKNOWLEDGMENT,
        instructions="Read each policy, tick to acknowledge it, then sign with your full name.",
        policies=(PolicyRef("OIQ-HR-COC-007", "Code of Conduct Policy"), PolicyRef("OIQ-IT-SEC-006", "IT and Information Security Policy")),
    ),
    ActionDef(
        key="leave_policy_ack",
        type=ActionType.POLICY_ACKNOWLEDGMENT,
        instructions="Read the Leave and Attendance Policy, tick to acknowledge it, then sign with your full name.",
        policies=(PolicyRef("OIQ-HR-LEA-001", "Leave and Attendance Policy"),),
    ),
    ActionDef(
        key="security_training",
        type=ActionType.TRAINING,
        instructions="Read each module and mark it complete, then pass the short quiz (80% to pass).",
        sections=(
            TrainingSection("passwords", "Passwords and multi-factor authentication", (
                "Passwords must be at least fourteen (14) characters long and must never be reused across systems or shared with anyone, including IT staff.",
                "Use the company-provided password manager to generate and store passwords. Multi-factor authentication is mandatory for email, VPN and all business applications.",
            )),
            TrainingSection("devices", "Using company devices", (
                "Company laptops use full-disk encryption and lock automatically after five (5) minutes of inactivity. Install operating system updates within seven (7) days.",
                "Install software only from the company software portal, and never use personal USB storage devices on company laptops.",
            )),
            TrainingSection("phishing", "Spotting phishing", (
                "Don't click links or open attachments in unexpected emails, even if they appear to come from a colleague.",
                "Report suspicious messages with the Report Phishing button in your mail client. If you entered your password on a suspicious site, change it immediately and contact the IT help desk.",
            )),
            TrainingSection("incidents", "Reporting security incidents", (
                "Report any suspected security incident (a lost device, malware, data sent to the wrong person) within one (1) hour to security@onboardiq-demo.example or IT help desk extension 4357.",
                "Don't try to investigate the incident yourself and don't delete evidence.",
            )),
        ),
        quiz=Quiz(questions=(
            QuizQuestion("q1", "What is the minimum password length?", ("8 characters", "10 characters", "14 characters", "20 characters"), 2),
            QuizQuestion("q2", "How quickly must you report a suspected security incident?", ("Within 1 hour", "By the end of the day", "Within 1 week", "Only if data was lost"), 0),
            QuizQuestion("q3", "What should you do with an unexpected email asking you to sign in?", ("Click the link to check it", "Forward it to colleagues", "Report it with the Report Phishing button", "Reply and ask who sent it"), 2),
            QuizQuestion("q4", "Can you plug a personal USB storage device into your company laptop?", ("Yes, if it's virus-scanned", "No, it isn't permitted", "Only for presentations", "Yes, with manager approval"), 1),
            QuizQuestion("q5", "After how many minutes of inactivity must your screen lock?", ("1", "5", "15", "30"), 1),
        )),
    ),
    ActionDef(
        key="hr_orientation",
        type=ActionType.TRAINING,
        instructions="Work through the orientation modules and mark each one complete.",
        sections=(
            TrainingSection("welcome", "Welcome to OnboardIQ Technologies", (
                "OnboardIQ Technologies is a fictional company used for this demo. These modules introduce how we work and where to find help.",
            )),
            TrainingSection("ways_of_working", "How we work", (
                "Core collaboration hours are 10:00 AM to 4:00 PM on working days. After your first thirty (30) days you may work remotely up to two (2) days per week with your manager's approval.",
            )),
            TrainingSection("help", "Where to get help", (
                "Use the Policy Assistant for policy questions, the HR portal for leave and payroll, and people.ops@onboardiq-demo.example for anything else.",
            )),
        ),
    ),
    ActionDef(
        key="posh_training",
        type=ActionType.TRAINING,
        instructions="Read the module, then pass the quiz (80% to pass).",
        sections=(
            TrainingSection("zero_tolerance", "Zero tolerance for harassment", (
                "OnboardIQ Technologies has zero tolerance for harassment, including sexual harassment, bullying and intimidation, in the office, remotely or at company events.",
            )),
            TrainingSection("raising_concerns", "Raising a concern", (
                "Complaints of sexual harassment go to the Internal Committee in writing within three (3) months of the incident, at ic@onboardiq-demo.example. The committee completes its inquiry within ninety (90) days and keeps complaints confidential.",
                "Retaliation against anyone who raises a concern in good faith is itself a serious breach of the Code of Conduct.",
            )),
        ),
        quiz=Quiz(questions=(
            QuizQuestion("q1", "Within how long should a sexual harassment complaint be made to the Internal Committee?", ("1 week", "3 months", "1 year", "There is no limit"), 1),
            QuizQuestion("q2", "Is retaliation against someone who raised a concern allowed?", ("Yes, if the concern was wrong", "No, it is a serious breach", "Only by managers", "Only after the inquiry"), 1),
        )),
    ),
    ActionDef(
        key="goals",
        type=ActionType.FORM,
        kind="goals",
        instructions="Agree your first goals with your manager and record them here.",
        fields=(
            FieldDef("goal_1", "Goal 1", type="textarea", min_length=10, max_length=500),
            FieldDef("goal_2", "Goal 2", type="textarea", min_length=10, max_length=500),
            FieldDef("goal_3", "Goal 3 (optional)", type="textarea", required=False, max_length=500),
            FieldDef("manager_name", "Agreed with (manager)", max_length=120),
        ),
    ),
    ActionDef(
        key="tax_declaration",
        type=ActionType.FORM,
        kind="tax_declaration",
        instructions="Choose your income tax regime and declare planned tax-saving investments for this financial year.",
        fields=(
            FieldDef("tax_regime", "Tax regime", type="select", options=("New regime", "Old regime")),
            FieldDef("declared_investments", "Planned tax-saving investments (INR)", type="number", max_length=12, pattern=r"^[0-9]{1,10}$", pattern_message="Enter a whole amount in rupees."),
            FieldDef("declaration", "I confirm this declaration is accurate", type="checkbox"),
        ),
    ),
    ActionDef(
        key="benefits_enrollment",
        type=ActionType.FORM,
        kind="benefits_enrollment",
        instructions="Enroll in the group health insurance plan within ten (10) days of joining (Employee Benefits Policy).",
        fields=(
            FieldDef("coverage", "Coverage", type="select", options=("Employee only", "Employee and spouse/partner", "Employee, spouse/partner and children")),
            FieldDef("parents_top_up", "Add parents top-up (paid by you)", type="select", options=("No", "Yes")),
            FieldDef("dependants", "Dependants' names (optional)", type="textarea", required=False, max_length=500),
            FieldDef("consent", "I confirm the information is accurate", type="checkbox"),
        ),
    ),
    ActionDef(
        key="code_review",
        type=ActionType.CHECKLIST,
        instructions="Complete your first code review cycle and tick each step.",
        items=(
            ChecklistItem("pick_issue", "Pick a starter issue with your buddy"),
            ChecklistItem("open_pr", "Open a pull request with tests"),
            ChecklistItem("address_feedback", "Address reviewer feedback"),
            ChecklistItem("merge", "Get the pull request approved and merged"),
        ),
    ),
    ActionDef(
        key="self_assessment",
        type=ActionType.FORM,
        kind="self_assessment",
        instructions="Reflect on your probation period. Your manager reviews this within ten (10) working days.",
        fields=(
            FieldDef("achievements", "What went well", type="textarea", min_length=20, max_length=1500),
            FieldDef("challenges", "Challenges you faced", type="textarea", min_length=20, max_length=1500),
            FieldDef("support_needed", "Support you'd like next (optional)", type="textarea", required=False, max_length=1000),
        ),
    ),
    _meeting("meet_buddy", "Meet your onboarding buddy and record the conversation.", "Buddy's name"),
    _meeting("meet_engineering_team", "Meet the engineering team (stand-up or intro call) and note what you learned.", "Who you met"),
    _meeting("meet_sales_team", "Shadow a sales team call or meeting and note what you learned.", "Who you met"),
    _meeting("meet_marketing_team", "Meet the marketing team and note current campaigns and priorities.", "Who you met"),
    _meeting("meet_mentor", "Have your first session with your intern mentor.", "Mentor's name"),
    _meeting("meet_team", "Meet your team and note your main contacts and priorities.", "Who you met"),
    # Software development
    ActionDef(
        key="dev_environment",
        type=ActionType.CHECKLIST,
        instructions="Set up your development environment. Tick each step once it works on your laptop.",
        items=(
            ChecklistItem("install_git", "Install Git and configure your name and work email"),
            ChecklistItem("ssh_key", "Create an SSH key and add it to your Git account", "Protect the key with a passphrase."),
            ChecklistItem("runtime", "Install the language runtimes and package managers your team uses"),
            ChecklistItem("clone_build", "Clone your team's main repository and run the build and tests locally"),
        ),
    ),
    ActionDef(
        key="ide_setup",
        type=ActionType.CHECKLIST,
        instructions="Set up your IDE with the team defaults.",
        items=(
            ChecklistItem("install_ide", "Install the team's IDE from the company software portal"),
            ChecklistItem("extensions", "Install the recommended extensions (linting, formatting, tests)"),
            ChecklistItem("format_on_save", "Enable format-on-save with the repository's settings"),
        ),
    ),
    _access_request("git_access", "Git (GitLab)", ("Read only", "Developer", "Maintainer"), "Request access to the company Git server. IT reviews requests within one (1) working day."),
    ActionDef(
        key="technical_onboarding",
        type=ActionType.QUIZ,
        instructions="Check your understanding of how the engineering team ships code (80% to pass).",
        quiz=Quiz(questions=(
            QuizQuestion("q1", "Where must work passwords and secrets be stored?", ("In the repository", "In the company password manager", "In a text file on your desktop", "In chat messages"), 1),
            QuizQuestion("q2", "What must every change have before it is merged?", ("An approved pull request review", "A manager's email", "Nothing, merge directly", "A deployment"), 0),
            QuizQuestion("q3", "Where can you install software on your company laptop from?", ("Any website", "The company software portal", "A personal USB drive", "Colleagues' laptops"), 1),
        )),
    ),
    # AI/ML
    ActionDef(
        key="python_environment",
        type=ActionType.CHECKLIST,
        instructions="Set up your Python environment for ML work.",
        items=(
            ChecklistItem("python", "Install the team's Python version"),
            ChecklistItem("venv", "Create a virtual environment for each project"),
            ChecklistItem("libraries", "Install the core libraries (NumPy, pandas, scikit-learn, PyTorch)"),
            ChecklistItem("notebook", "Run the team's starter notebook end to end"),
        ),
    ),
    _access_request("ml_platform_access", "GPU / ML platform", ("Notebook (CPU)", "Training (single GPU)", "Training (multi-GPU)"), "Request access to the GPU cluster and ML platform. Access is granted per project."),
    ActionDef(
        key="ml_project_docs",
        type=ActionType.TRAINING,
        instructions="Read the AI/ML project documentation modules and mark each complete.",
        sections=(
            TrainingSection("data_handling", "Handling training data", (
                "Customer data is classified as Confidential. Use only approved, access-controlled datasets, never copy them to personal devices, and never paste them into public AI tools.",
            )),
            TrainingSection("experiments", "Experiments and reproducibility", (
                "Track every experiment with its data version, code commit and parameters so results can be reproduced and reviewed.",
            )),
            TrainingSection("model_review", "Model review before release", (
                "Models are reviewed for accuracy, bias and privacy risks before release. Document known limitations with every model.",
            )),
        ),
    ),
    ActionDef(
        key="technical_onboarding_ml",
        type=ActionType.QUIZ,
        instructions="Check your understanding of responsible ML practice (80% to pass).",
        quiz=Quiz(questions=(
            QuizQuestion("q1", "Can confidential customer data be pasted into a public AI tool?", ("Yes, if anonymised by hand", "No, never", "Only for testing", "Yes, with a colleague's approval"), 1),
            QuizQuestion("q2", "What should every experiment record?", ("Only the final accuracy", "Data version, code commit and parameters", "Nothing", "The GPU used"), 1),
            QuizQuestion("q3", "When are models reviewed for bias and privacy risks?", ("Never", "After customers complain", "Before release", "Once a year"), 2),
        )),
    ),
    # Data analysis
    _access_request("analytics_access", "Analytics tools (BI dashboards and data warehouse)", ("Viewer", "Analyst (query access)", "Editor"), "Request access to the BI tool and the data warehouse."),
    ActionDef(
        key="sql_environment",
        type=ActionType.CHECKLIST,
        instructions="Set up your SQL environment.",
        items=(
            ChecklistItem("sql_client", "Install the approved SQL client"),
            ChecklistItem("connect", "Connect to the read-only analytics warehouse with your own credentials"),
            ChecklistItem("first_query", "Run the starter query from the analytics handbook"),
        ),
    ),
    ActionDef(
        key="data_governance",
        type=ActionType.TRAINING,
        instructions="Read the data governance modules, then pass the quiz (80% to pass).",
        sections=(
            TrainingSection("classification", "Data classification", (
                "Company information is Public, Internal, Confidential or Restricted. Customer data and salaries are Confidential: need-to-know access only, and encrypted.",
            )),
            TrainingSection("sharing", "Sharing data safely", (
                "Share aggregated results rather than raw records, never store confidential data on personal devices or personal cloud storage, and never paste it into public AI tools.",
            )),
        ),
        quiz=Quiz(questions=(
            QuizQuestion("q1", "How is customer data classified?", ("Public", "Internal", "Confidential", "Unclassified"), 2),
            QuizQuestion("q2", "Can confidential data be stored on personal cloud storage?", ("Yes", "No", "Only if zipped", "Only for one day"), 1),
        )),
    ),
    ActionDef(
        key="analyst_training",
        type=ActionType.TRAINING,
        instructions="Complete the role-specific analytics modules.",
        sections=(
            TrainingSection("metrics", "Our core metrics", ("Learn the definitions of the team's core business metrics in the analytics handbook before building reports.",)),
            TrainingSection("dashboards", "Building dashboards", ("Use the shared dashboard templates and document data sources and refresh schedules on every dashboard.",)),
        ),
    ),
    # HR
    ActionDef(
        key="hr_system_training",
        type=ActionType.TRAINING,
        instructions="Learn the HR system, then pass the quiz (80% to pass).",
        sections=(
            TrainingSection("records", "Employee records", ("Employee records are Confidential. Access only the records you need for your work, and never export them to personal devices.",)),
            TrainingSection("leave_payroll", "Leave and payroll processing", ("Managers respond to leave requests within two (2) working days; unanswered requests escalate to the skip-level manager. The payroll cut-off is the 20th of each month.",)),
        ),
        quiz=Quiz(questions=(
            QuizQuestion("q1", "What is the monthly payroll cut-off date?", ("The 1st", "The 15th", "The 20th", "The last working day"), 2),
            QuizQuestion("q2", "Within how many working days should managers respond to leave requests?", ("1", "2", "5", "10"), 1),
        )),
    ),
    ActionDef(
        key="employee_management",
        type=ActionType.TRAINING,
        instructions="Review the employee management processes and mark each module complete.",
        sections=(
            TrainingSection("onboarding", "Onboarding new hires", ("New hires complete a role-based checklist in OnboardIQ. Monitor progress on the HR dashboard and follow up on overdue tasks.",)),
            TrainingSection("probation", "Probation reviews", ("Probation lasts ninety (90) days. Managers complete probation reviews within ten (10) working days of the employee's self-assessment.",)),
            TrainingSection("conduct", "Conduct and discipline", ("Disciplinary stages are a verbal warning, a written warning, a final written warning, then suspension or termination. Employees may appeal within seven (7) working days.",)),
        ),
    ),
    # Finance
    _access_request("erp_access", "Finance ERP", ("Viewer", "Accounts payable", "Accounts receivable", "General ledger"), "Request access to the finance ERP for your team."),
    ActionDef(
        key="finance_processes",
        type=ActionType.TRAINING,
        instructions="Learn the core finance processes, then pass the quiz (80% to pass).",
        sections=(
            TrainingSection("expenses", "Expenses and reimbursements", ("Approved business expenses submitted by the 15th of the month are reimbursed with that month's salary.",)),
            TrainingSection("payroll_calendar", "Payroll calendar", ("Salaries are paid on the last working day of each month; payslips are available two (2) working days before.",)),
        ),
        quiz=Quiz(questions=(
            QuizQuestion("q1", "By which date must expenses be submitted to be paid with that month's salary?", ("The 5th", "The 15th", "The 25th", "The last day"), 1),
            QuizQuestion("q2", "When are salaries paid?", ("The 1st of each month", "The last working day of each month", "Every two weeks", "The 15th"), 1),
        )),
    ),
    # Sales
    _access_request("crm_access", "CRM", ("Sales representative", "Sales manager"), "Request access to the CRM to manage your accounts and pipeline."),
    ActionDef(
        key="sales_training",
        type=ActionType.TRAINING,
        instructions="Complete the sales onboarding modules, then pass the quiz (80% to pass).",
        sections=(
            TrainingSection("product", "Our product", ("Learn the product overview deck and the three main customer use cases before your first customer call.",)),
            TrainingSection("ethics", "Selling ethically", ("Gifts and hospitality from customers may be accepted only up to INR 2,000 per occasion; declare anything above that to People Operations.",)),
        ),
        quiz=Quiz(questions=(
            QuizQuestion("q1", "What is the maximum value of a gift you can accept from a customer?", ("INR 500", "INR 2,000", "INR 10,000", "Any value"), 1),
        )),
    ),
    # Marketing
    _access_request("marketing_tools_access", "Marketing tools (CMS and analytics)", ("Viewer", "Editor", "Publisher"), "Request access to the website CMS and marketing analytics."),
    ActionDef(
        key="brand_guidelines",
        type=ActionType.TRAINING,
        instructions="Read the brand guidelines, then pass the quiz (80% to pass).",
        sections=(
            TrainingSection("voice", "Brand voice", ("Write clearly, simply and politely. Avoid jargon and make every claim accurate.",)),
            TrainingSection("public", "Speaking publicly", ("Don't speak on behalf of the company publicly or share confidential information on social media unless the Communications team has authorised it.",)),
        ),
        quiz=Quiz(questions=(
            QuizQuestion("q1", "Who must authorise speaking publicly on behalf of the company?", ("Anyone in marketing", "The Communications team", "Your buddy", "No one"), 1),
        )),
    ),
    # Interns and other roles
    ActionDef(
        key="intern_orientation",
        type=ActionType.TRAINING,
        instructions="Complete the intern orientation modules.",
        sections=(
            TrainingSection("program", "Your internship", ("Your mentor sets weekly goals with you. Share progress in your weekly check-in.",)),
            TrainingSection("conduct", "Professional conduct", ("Reply to internal emails within one (1) working day and follow the Code of Conduct, like every employee.",)),
        ),
    ),
    ActionDef(
        key="role_orientation",
        type=ActionType.TRAINING,
        instructions="Complete the role orientation modules.",
        sections=(
            TrainingSection("team", "Your team", ("Your manager introduces your team's goals, tools and weekly rhythm in your first week.",)),
            TrainingSection("tools", "Tools and access", ("Request any extra system access through the IT service desk; requests are usually handled within one (1) working day.",)),
        ),
    ),
]

ACTIONS: dict[str, ActionDef] = {action.key: action for action in _ACTIONS}

# ---- Checklists per job role -------------------------------------------------------------------------------------

_COMMON: list[TaskTemplate] = [
    TaskTemplate("profile", "Complete employee profile", "Add your personal contact details to your employee record.", Stage.DOCUMENTATION, Category.HR_FORMS, Priority.HIGH, -3, "profile"),
    TaskTemplate("documents", "Upload required documents", "Upload your photo ID, proof of address and highest education certificate.", Stage.DOCUMENTATION, Category.DOCUMENTS, Priority.HIGH, -3, "documents"),
    TaskTemplate("bank_details", "Set up salary bank details", "Add the bank account your salary is paid into.", Stage.PAYROLL_BENEFITS, Category.PAYROLL, Priority.HIGH, -1, "bank_details"),
    TaskTemplate("it_setup", "Complete IT setup", "Set up your laptop, password, multi-factor authentication and VPN.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 0, "it_setup"),
    TaskTemplate("emergency_contact", "Submit emergency contact details", "Tell us who to contact in an emergency.", Stage.DOCUMENTATION, Category.HR_FORMS, Priority.MEDIUM, 3, "emergency_contact"),
    TaskTemplate("company_policies", "Read company policies", "Read and acknowledge the Code of Conduct and the IT and Information Security Policy.", Stage.TRAINING, Category.COMPLIANCE, Priority.MEDIUM, 3, "company_policies"),
    TaskTemplate("security_training", "Complete security training", "Learn the security basics and pass the security quiz.", Stage.TRAINING, Category.LEARNING, Priority.HIGH, 7, "security_training"),
    TaskTemplate("goals", "Set 30-day goals with your manager", "Agree and record your first goals with your manager.", Stage.READY_TO_GO, Category.TEAM, Priority.LOW, 18, "goals"),
]

_ROLE_SPECIFIC: dict[JobRole, list[TaskTemplate]] = {
    JobRole.SOFTWARE_DEVELOPER: [
        TaskTemplate("dev_environment", "Set up development environment", "Install Git, your SSH key and runtimes, and build the main repository.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 1, "dev_environment"),
        TaskTemplate("git_access", "Request Git access", "Request access to the company Git server.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 1, "git_access"),
        TaskTemplate("ide_setup", "Set up IDE", "Install the team IDE with the recommended extensions.", Stage.WELCOME, Category.IT_SETUP, Priority.MEDIUM, 2, "ide_setup"),
        TaskTemplate("meet_engineering_team", "Meet the engineering team", "Join a stand-up or intro call with the engineering team.", Stage.WELCOME, Category.TEAM, Priority.MEDIUM, 3, "meet_engineering_team"),
        TaskTemplate("technical_onboarding", "Complete technical onboarding", "Pass the engineering practices quiz.", Stage.READY_TO_GO, Category.LEARNING, Priority.MEDIUM, 10, "technical_onboarding"),
    ],
    JobRole.AI_ML_ENGINEER: [
        TaskTemplate("python_environment", "Set up Python environment", "Install Python, a virtual environment and the core ML libraries.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 1, "python_environment"),
        TaskTemplate("ml_platform_access", "Request GPU / ML platform access", "Request access to the GPU cluster and ML platform.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 1, "ml_platform_access"),
        TaskTemplate("git_access", "Set up Git access", "Request access to the company Git server.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 1, "git_access"),
        TaskTemplate("ml_project_docs", "Review AI/ML project documentation", "Read the data handling, experiment and model review guidelines.", Stage.TRAINING, Category.LEARNING, Priority.MEDIUM, 5, "ml_project_docs"),
        TaskTemplate("technical_onboarding", "Complete technical onboarding", "Pass the responsible ML practice quiz.", Stage.READY_TO_GO, Category.LEARNING, Priority.MEDIUM, 10, "technical_onboarding_ml"),
    ],
    JobRole.DATA_ANALYST: [
        TaskTemplate("analytics_access", "Request analytics tool access", "Request access to the BI tool and the data warehouse.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 1, "analytics_access"),
        TaskTemplate("sql_environment", "Set up SQL environment", "Install the SQL client and run your first query.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 2, "sql_environment"),
        TaskTemplate("data_governance", "Review data governance policies", "Learn how data is classified and shared, then pass the quiz.", Stage.TRAINING, Category.COMPLIANCE, Priority.HIGH, 5, "data_governance"),
        TaskTemplate("role_training", "Complete role-specific training", "Learn the core metrics and dashboard standards.", Stage.READY_TO_GO, Category.LEARNING, Priority.MEDIUM, 10, "analyst_training"),
    ],
    JobRole.HR: [
        TaskTemplate("hr_system_training", "Complete HR system training", "Learn the HR system and pass the quiz.", Stage.TRAINING, Category.LEARNING, Priority.HIGH, 5, "hr_system_training"),
        TaskTemplate("employee_management", "Review employee management processes", "Review onboarding, probation and conduct processes.", Stage.READY_TO_GO, Category.LEARNING, Priority.MEDIUM, 10, "employee_management"),
    ],
    JobRole.FINANCE: [
        TaskTemplate("erp_access", "Request finance ERP access", "Request access to the finance ERP.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 1, "erp_access"),
        TaskTemplate("finance_processes", "Complete finance process training", "Learn the expense and payroll calendar and pass the quiz.", Stage.TRAINING, Category.LEARNING, Priority.HIGH, 5, "finance_processes"),
    ],
    JobRole.SALES: [
        TaskTemplate("crm_access", "Request CRM access", "Request access to the CRM.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 1, "crm_access"),
        TaskTemplate("sales_training", "Complete sales onboarding", "Learn the product and selling ethics, then pass the quiz.", Stage.TRAINING, Category.LEARNING, Priority.HIGH, 5, "sales_training"),
        TaskTemplate("meet_sales_team", "Shadow a sales call", "Shadow a sales team call and note what you learned.", Stage.READY_TO_GO, Category.TEAM, Priority.MEDIUM, 8, "meet_sales_team"),
    ],
    JobRole.MARKETING: [
        TaskTemplate("marketing_tools_access", "Request marketing tools access", "Request access to the CMS and marketing analytics.", Stage.WELCOME, Category.IT_SETUP, Priority.HIGH, 1, "marketing_tools_access"),
        TaskTemplate("brand_guidelines", "Learn the brand guidelines", "Read the brand guidelines and pass the quiz.", Stage.TRAINING, Category.LEARNING, Priority.MEDIUM, 5, "brand_guidelines"),
        TaskTemplate("meet_marketing_team", "Meet the marketing team", "Meet the team and note current campaigns.", Stage.READY_TO_GO, Category.TEAM, Priority.MEDIUM, 8, "meet_marketing_team"),
    ],
    JobRole.INTERN: [
        TaskTemplate("intern_orientation", "Complete intern orientation", "Learn how your internship works.", Stage.TRAINING, Category.ORIENTATION, Priority.HIGH, 2, "intern_orientation"),
        TaskTemplate("meet_mentor", "Meet your mentor", "Have your first session with your mentor.", Stage.READY_TO_GO, Category.TEAM, Priority.MEDIUM, 4, "meet_mentor"),
    ],
    JobRole.OTHER: [
        TaskTemplate("role_orientation", "Complete role orientation", "Learn your team's goals, tools and rhythm.", Stage.TRAINING, Category.ORIENTATION, Priority.MEDIUM, 4, "role_orientation"),
        TaskTemplate("meet_team", "Meet your team", "Meet your team and note your main contacts.", Stage.READY_TO_GO, Category.TEAM, Priority.MEDIUM, 4, "meet_team"),
    ],
}

# Prerequisites, by action key: a task can't be started or completed until these are done (when the employee's
# checklist contains them). They follow the natural order of onboarding: personal details before payroll,
# IT setup before tool access, access before environment setup, reading before the related assessment.
DEPENDENCIES: dict[str, tuple[str, ...]] = {
    "documents": ("profile",),
    "identity_documents": ("profile",),
    "bank_details": ("profile",),
    "emergency_contact": ("profile",),
    "tax_declaration": ("bank_details",),
    "benefits_enrollment": ("bank_details",),
    "vpn_mfa": ("it_setup",),
    "security_training": ("it_setup",),
    "goals": ("profile",),
    "self_assessment": ("goals",),
    "git_access": ("it_setup",),
    "dev_environment": ("git_access",),
    "ide_setup": ("dev_environment",),
    "technical_onboarding": ("dev_environment",),
    "python_environment": ("it_setup",),
    "ml_platform_access": ("it_setup",),
    "technical_onboarding_ml": ("ml_project_docs",),
    "analytics_access": ("it_setup",),
    "sql_environment": ("analytics_access",),
    "analyst_training": ("data_governance",),
    "erp_access": ("it_setup",),
    "crm_access": ("it_setup",),
    "marketing_tools_access": ("it_setup",),
}


def sequence_for(action_key: str | None) -> int:
    """Catalog position of an action: common tasks in their listed order, then role-specific, then legacy-only ones."""
    return _SEQUENCE.get(action_key or "", len(_SEQUENCE))


def prerequisites_for(action_key: str | None) -> tuple[str, ...]:
    return DEPENDENCIES.get(action_key or "", ())


# Action for each task of the original fixed 18-task checklist, so existing employees' tasks are actionable too.
LEGACY_ACTION_KEYS: dict[str, str] = {
    "t1": "hr_orientation", "t2": "it_setup", "t3": "vpn_mfa", "t4": "meet_buddy", "t5": "offer_nda", "t6": "profile",
    "t7": "identity_documents", "t8": "company_policies", "t9": "emergency_contact", "t10": "bank_details",
    "t11": "tax_declaration", "t12": "benefits_enrollment", "t13": "security_training", "t14": "leave_policy_ack",
    "t15": "posh_training", "t16": "goals", "t17": "code_review", "t18": "self_assessment",
}  # fmt: skip


@dataclass
class GeneratedTask:
    task: OnboardingTask
    action_key: str


def templates_for(job_role: JobRole) -> list[TaskTemplate]:
    """Common tasks plus the role's own tasks; the count depends on the role."""
    return [*_COMMON, *_ROLE_SPECIFIC[job_role]]


def build_role_checklist(
    job_role: JobRole, start_date: date, *, clamp_to_start: bool = True, calendar: WorkCalendar | None = None
) -> list[GeneratedTask]:
    """
    The checklist for a job role, all pending. Due dates are relative to the start date; with ``clamp_to_start``,
    pre-boarding tasks (due before day one) are due on the start date so a new sign-up doesn't begin overdue.
    With a ``calendar``, a due date that falls on a weekly day off or company holiday moves to the next working day.
    """
    tasks = []
    for template in templates_for(job_role):
        due = start_date + timedelta(days=template.due_offset_days)
        if clamp_to_start:
            due = max(due, start_date)
        if calendar is not None:
            due = calendar.on_or_after(due)
        tasks.append(
            GeneratedTask(
                OnboardingTask(
                    id=template.key, stage=template.stage, title=template.title, description=template.description,
                    category=template.category, due_date=due, priority=template.priority, status=TaskStatus.PENDING,
                ),  # fmt: skip
                template.action_key,
            )
        )
    return tasks


def action_for(action_key: str | None) -> ActionDef | None:
    return ACTIONS.get(action_key) if action_key else None


def _check_catalog() -> None:
    """Fails fast at import if a template or legacy task points at a missing action."""
    referenced = {t.action_key for t in _COMMON} | {t.action_key for ts in _ROLE_SPECIFIC.values() for t in ts} | set(LEGACY_ACTION_KEYS.values())
    missing = (referenced | set(DEPENDENCIES) | {p for ps in DEPENDENCIES.values() for p in ps}) - ACTIONS.keys()
    if missing:
        raise RuntimeError(f"Task catalog references unknown actions: {sorted(missing)}")
    assert set(_ROLE_SPECIFIC) == set(JobRole), "every job role needs a checklist"


_SEQUENCE: dict[str, int] = {}
for _template in [*_COMMON, *(t for ts in _ROLE_SPECIFIC.values() for t in ts)]:
    _SEQUENCE.setdefault(_template.action_key, len(_SEQUENCE))
for _legacy_action in LEGACY_ACTION_KEYS.values():
    _SEQUENCE.setdefault(_legacy_action, len(_SEQUENCE))

_check_catalog()
