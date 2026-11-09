"""Generates the fictional OnboardIQ Technologies policy PDFs used for demos.

FICTIONAL DEMONSTRATION CONTENT: OnboardIQ Technologies is not a real company and none of this is real company
policy. Figures match docs/sample-policies (e.g. 18 days of annual leave) and the app's onboarding checklist so
the Policy Assistant's answers stay consistent across the demo.

Usage (from the project root, with the backend virtual environment):
    backend/.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
    backend/.venv/Scripts/python docs/demo-policies/generate_demo_policies.py
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import KeepTogether, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUTPUT_DIR = Path(__file__).resolve().parent
COMPANY = "OnboardIQ Technologies"
NAVY = colors.HexColor("#142B4A")
BLUE = colors.HexColor("#346FE7")
LINE = colors.HexColor("#D3DCE9")
SOFT = colors.HexColor("#EEF3FD")
NOTICE = (
    "FICTIONAL DEMONSTRATION POLICY. This document was created for the OnboardIQ college project demo. "
    "OnboardIQ Technologies is a fictional company; this is not a real company policy and must not be relied on."
)

# A section body is a list of blocks: a string is a paragraph, a list of strings is a bulleted list,
# and a tuple ("table", rows) is a table whose first row is the header.
Block = str | list[str] | tuple[str, list[list[str]]]


@dataclass
class Section:
    heading: str
    blocks: list[Block]


@dataclass
class Policy:
    filename: str
    title: str
    policy_id: str
    version: str
    effective: str
    owner: str
    applies_to: str
    next_review: str
    purpose: str
    sections: list[Section] = field(default_factory=list)


# ---------------------------------------------------------------------------------------------------------------
# Policy content (fictional)
# ---------------------------------------------------------------------------------------------------------------

LEAVE = Policy(
    filename="OIQ-HR-LEA-001_Leave-and-Attendance-Policy.pdf",
    title="Leave and Attendance Policy",
    policy_id="OIQ-HR-LEA-001",
    version="3.1",
    effective="January 1, 2026",
    owner="People Operations",
    applies_to="All full-time employees in India",
    next_review="December 2026",
    purpose=(
        "This policy explains how much paid leave employees of OnboardIQ Technologies receive, how to apply for leave, "
        "and the attendance rules that apply on working days."
    ),
    sections=[
        Section("1. Annual paid leave", [
            "Full-time employees receive eighteen (18) days of paid annual leave per calendar year (January to December).",
            "Annual leave accrues monthly at 1.5 days per month of service, starting from the date of joining. "
            "Employees who join during the year receive a pro-rated entitlement.",
            "New joiners can start using accrued annual leave after completing their first thirty (30) days of service.",
            "Up to ten (10) unused annual leave days may be carried forward into the next calendar year. "
            "Carried forward days must be used by March 31, after which they expire.",
            "Annual leave cannot be encashed, except for unused days paid out at the end of employment as required by local law.",
        ]),
        Section("2. Sick leave", [
            "Employees are entitled to eight (8) days of paid sick leave per calendar year. Sick leave does not carry forward.",
            "Sick leave can be recorded on the day of absence. Inform your manager by 10:00 AM on the first day of absence.",
            "A medical certificate from a registered doctor is required for sick leave longer than three (3) consecutive days.",
        ]),
        Section("3. Casual leave", [
            "Employees receive six (6) days of paid casual leave per calendar year for personal matters such as family events or urgent errands.",
            "Casual leave can be taken for at most two (2) consecutive days at a time and cannot be combined with annual leave.",
            "Apply for casual leave at least one working day in advance. In an emergency, it may be applied for on the same day before 10:00 AM.",
            "Unused casual leave lapses on December 31 and cannot be carried forward or encashed.",
        ]),
        Section("4. Public holidays", [
            "OnboardIQ Technologies observes ten (10) public holidays each year. The holiday list for the year is published in the HR portal every January.",
            "Employees asked to work on a public holiday receive one compensatory day off, to be used within sixty (60) days.",
        ]),
        Section("5. Summary of leave types", [
            ("table", [
                ["Leave type", "Days per year", "Carry forward", "Notice required"],
                ["Annual leave", "18", "Up to 10 days (use by March 31)", "3 working days"],
                ["Sick leave", "8", "No", "Same day, by 10:00 AM"],
                ["Casual leave", "6", "No", "1 working day (same day in emergencies)"],
                ["Public holidays", "10", "Not applicable", "Published every January"],
            ]),
        ]),
        Section("6. Leave application and approval process", [
            [
                "Step 1: Apply in the HR portal under Leave, choosing the leave type and dates.",
                "Step 2: Annual leave requests must be submitted at least three (3) working days in advance; requests of five or more consecutive days need two weeks' notice.",
                "Step 3: Your manager approves or declines the request within two (2) working days.",
                "Step 4: If your manager has not responded within two working days, the request is escalated automatically to the skip-level manager.",
                "Step 5: Approved leave appears on the team calendar. Cancel unused approved leave in the HR portal before it starts.",
            ],
        ]),
        Section("7. Attendance rules", [
            "Standard working hours are 9:00 AM to 6:00 PM, Monday to Friday, including a one-hour lunch break.",
            "Core collaboration hours are 10:00 AM to 4:00 PM on working days. All employees must be available during core hours.",
            "If you will start later than 10:30 AM, inform your manager in advance.",
            "Absence without notice for three (3) consecutive working days is treated as unauthorised absence and may lead to disciplinary action under the Code of Conduct Policy (OIQ-HR-COC-007).",
            "Questions about leave or attendance can be raised with People Operations through the HR portal or at people.ops@onboardiq-demo.example.",
        ]),
    ],
)

BENEFITS = Policy(
    filename="OIQ-HR-BEN-002_Employee-Benefits-Policy.pdf",
    title="Employee Benefits Policy",
    policy_id="OIQ-HR-BEN-002",
    version="2.0",
    effective="January 1, 2026",
    owner="People Operations (Total Rewards)",
    applies_to="All employees, as described under Eligibility",
    next_review="December 2026",
    purpose="This policy describes the health, insurance and wellness benefits that OnboardIQ Technologies provides, who is eligible, and how to enroll.",
    sections=[
        Section("1. Eligibility requirements", [
            "Full-time permanent employees are eligible for all benefits in this policy from their date of joining.",
            "Fixed-term employees with a contract of six (6) months or longer are eligible for health insurance and wellness benefits.",
            "Interns and consultants are not eligible for health insurance, but may use the Employee Assistance Program.",
            "Benefits end on the last working day of employment.",
        ]),
        Section("2. Health insurance", [
            "Eligible employees are covered by the company group health insurance plan, provided by CareShield Health (a fictional insurer).",
            "The plan covers the employee, their spouse or partner, and up to two (2) children.",
            "The sum insured is INR 5,00,000 per family per policy year, and the full premium for this cover is paid by the company.",
            "Parents or parents-in-law can be added as an optional top-up. The top-up premium is paid by the employee through monthly salary deductions.",
            "Cashless treatment is available at network hospitals listed in the CareShield app. For other hospitals, submit reimbursement claims within thirty (30) days of discharge.",
            "Group term life insurance of three times (3x) annual fixed pay and personal accident cover of five times (5x) annual fixed pay are provided at no cost to the employee.",
        ]),
        Section("3. Benefits enrollment process", [
            [
                "New employees must enroll in the health insurance plan within ten (10) calendar days of their date of joining, using the Benefits section of the HR portal.",
                "Add dependants' names, dates of birth and relationship, and upload one identity document for each dependant.",
                "Coverage starts from the date of joining once enrollment is completed within the ten-day window.",
                "Employees who miss the enrollment window are covered for themselves only until the next annual open enrollment, which runs from January 1 to January 15.",
                "Changes after a life event (marriage, birth or adoption of a child) can be made within thirty (30) days of the event.",
            ],
        ]),
        Section("4. Employee wellness benefits", [
            "Every eligible employee receives an annual wellness allowance of INR 12,000 per calendar year for gym memberships, fitness classes, sports equipment or wellness apps.",
            "Claim the wellness allowance in the expense portal with receipts. Claims submitted by the 15th of a month are paid with that month's salary.",
            "A free annual health check-up is available once per calendar year at partner diagnostic centres.",
            "The Employee Assistance Program (EAP) offers six (6) free, confidential counselling sessions per year and a 24x7 support helpline for employees and their immediate family.",
        ]),
        Section("5. Benefits at a glance", [
            ("table", [
                ["Benefit", "Value", "Who pays"],
                ["Group health insurance", "INR 5,00,000 per family per year", "Company"],
                ["Parents top-up", "Optional", "Employee (salary deduction)"],
                ["Term life insurance", "3x annual fixed pay", "Company"],
                ["Personal accident cover", "5x annual fixed pay", "Company"],
                ["Wellness allowance", "INR 12,000 per year", "Company (reimbursed)"],
                ["Counselling (EAP)", "6 sessions per year", "Company"],
            ]),
        ]),
        Section("6. Questions", [
            "Benefits questions can be raised in the HR portal under Benefits, or emailed to benefits@onboardiq-demo.example. The Total Rewards team responds within two (2) working days.",
        ]),
    ],
)

PAYROLL = Policy(
    filename="OIQ-FIN-PAY-003_Payroll-and-Salary-Policy.pdf",
    title="Payroll and Salary Policy",
    policy_id="OIQ-FIN-PAY-003",
    version="2.2",
    effective="April 1, 2026",
    owner="Finance (Payroll)",
    applies_to="All employees on the OnboardIQ Technologies payroll",
    next_review="March 2027",
    purpose="This policy explains when and how salaries are paid, what appears on payslips, which deductions apply, and how to raise payroll questions.",
    sections=[
        Section("1. Monthly salary payment date", [
            "Salaries are paid monthly, by bank transfer, on the last working day of each month.",
            "If the last working day is a public holiday, salaries are paid on the previous working day.",
        ]),
        Section("2. Payroll processing", [
            "The monthly payroll cut-off date is the 20th of each month. Attendance, leave, new joiner details and approved changes received by the 20th are included in that month's salary.",
            "Employees who join on or before the 20th day of a month are paid for that partial month in the same payroll cycle.",
            "Employees who join after the 20th receive their first pro-rated salary in the following month's payroll.",
            "Submit your salary bank account details and tax declaration during onboarding. Missing details can delay your first salary payment.",
            "Approved business expense reimbursements submitted by the 15th of the month are paid with that month's salary.",
            "Salaries are reviewed once a year, and revised salaries take effect from April 1.",
        ]),
        Section("3. Payslips", [
            "Payslips are available in the HR portal under Payroll, two (2) working days before the payment date.",
            "Each payslip shows gross pay, each deduction, reimbursements and net pay for the month.",
            "Payslips for the last 24 months can be downloaded from the HR portal at any time. Annual tax statements (Form 16) are issued by June 15 each year.",
        ]),
        Section("4. Salary deductions", [
            "The following deductions may apply each month:",
            [
                "Income tax deducted at source (TDS), based on the tax declaration you submit.",
                "Provident Fund (PF) employee contribution of 12% of basic salary. The company contributes a matching 12%.",
                "Professional tax, as required by the state where you work.",
                "Optional health insurance top-up premiums for parents, if you enrolled them.",
                "Loss of pay for unapproved or unpaid leave, calculated as monthly gross salary divided by the number of calendar days in that month, for each day of unpaid leave.",
            ],
            "Proof of tax-saving investments must be submitted in the HR portal by January 31. Without proofs, tax is recalculated and the difference is deducted from the February to March salaries.",
        ]),
        Section("5. Payroll-related queries", [
            [
                "Raise payroll questions as a ticket in the HR portal, under the Payroll category.",
                "The payroll team responds within two (2) working days.",
                "Confirmed payroll errors are corrected in the next payroll cycle.",
                "If an error reduces your net pay by more than 10%, an off-cycle correction is paid within five (5) working days.",
                "Urgent payroll issues can be emailed to payroll@onboardiq-demo.example.",
            ],
        ]),
    ],
)

ONBOARDING = Policy(
    filename="OIQ-HR-ONB-004_Employee-Onboarding-Policy.pdf",
    title="Employee Onboarding Policy",
    policy_id="OIQ-HR-ONB-004",
    version="1.4",
    effective="January 1, 2026",
    owner="People Operations",
    applies_to="All new employees, their managers and onboarding buddies",
    next_review="December 2026",
    purpose=(
        "This policy describes what new employees need to do before and after joining OnboardIQ Technologies. "
        "Each step matches a task in the new hire's OnboardIQ onboarding checklist."
    ),
    sections=[
        Section("1. Before your first day: required documents", [
            "Sign your offer letter and non-disclosure agreement (NDA) at least five (5) days before your start date.",
            "At least three (3) days before your start date, upload the following in the HR portal:",
            [
                "A government-issued photo identity document (such as a passport or national ID card).",
                "Proof of current address.",
                "Highest education certificate.",
                "Relieving letter or experience letter from your previous employer, if applicable.",
            ],
            "Also complete your personal information form and submit your tax declaration form at least three (3) days before you start, and set up your payroll (salary bank account) information at least one (1) day before you start.",
        ]),
        Section("2. First-day checklist", [
            [
                "Report to the reception desk at 9:30 AM on your first day. Your manager or onboarding buddy will meet you.",
                "Collect your ID badge and company laptop.",
                "Complete IT setup on day one: sign in to your laptop, email and chat with the IT service desk.",
                "Meet your manager to review your role and your first week.",
            ],
        ]),
        Section("3. Orientation schedule", [
            ("table", [
                ["When", "Activity"],
                ["Day 1", "Welcome, IT setup, badge and laptop collection"],
                ["Day 2", "HR orientation (4 hours): company overview, policies, benefits and payroll"],
                ["Day 2", "Configure VPN and multi-factor authentication"],
                ["Day 3", "Meet your onboarding buddy"],
                ["Within 3 days", "Review company policies and submit emergency contact details"],
                ["Within 7 days", "Complete Information Security training"],
                ["Within 8 days", "Enroll in the health insurance plan"],
                ["Within 9 days", "Acknowledge the Leave and Attendance Policy"],
                ["Within 12 days", "Complete the POSH (anti-sexual harassment) awareness module"],
                ["Within 18 days", "Set 30-day goals with your manager"],
            ]),
            "Every new employee is assigned an onboarding buddy from their team for the first ninety (90) days.",
        ]),
        Section("4. IT access", [
            "Your email, chat and HR portal accounts are created before your first day. Your temporary password is shared by SMS and must be changed at first sign-in.",
            "Multi-factor authentication and VPN must be configured by the end of day two (2). Access to business applications is granted only after this is done.",
            "Additional system access is requested by your manager through the IT service desk and is usually granted within one (1) working day.",
            "Administrator rights on laptops are not granted by default. See the IT and Information Security Policy (OIQ-IT-SEC-006) for password and device rules.",
        ]),
        Section("5. Training requirements", [
            [
                "Information Security training: mandatory, about 90 minutes, to be completed within the first seven (7) days. The pass mark for the final quiz is 80%.",
                "POSH awareness module: mandatory, to be completed within the first twelve (12) days.",
                "Role-specific training is assigned by your manager in the learning portal during your first month.",
                "Engineering employees complete their first code review cycle within about six weeks of joining.",
            ],
        ]),
        Section("6. Probation", [
            "New employees serve a probation period of ninety (90) days. Submit your probation self-assessment in the HR portal at the end of the probation period.",
            "Your manager completes the probation review within ten (10) working days of the self-assessment, and People Operations issues a confirmation letter once probation is completed successfully.",
        ]),
    ],
)

HYBRID = Policy(
    filename="OIQ-HR-HYB-005_Hybrid-Work-Policy.pdf",
    title="Hybrid Work Policy",
    policy_id="OIQ-HR-HYB-005",
    version="2.1",
    effective="January 1, 2026",
    owner="People Operations",
    applies_to="All employees whose roles can be performed remotely",
    next_review="December 2026",
    purpose="This policy explains who can work from home, how often employees are expected in the office, and what is expected when working remotely.",
    sections=[
        Section("1. Work-from-home eligibility", [
            "Employees who have completed their first thirty (30) days of service may work remotely up to two (2) days per week, with their manager's approval.",
            "During the first thirty days, new hires are expected to work from the office so they can settle in with their team.",
            "Roles that require on-site equipment or customer presence may not be eligible for remote work. Managers confirm eligibility in writing.",
            "Working remotely from another city for more than five (5) consecutive working days requires approval from your manager and People Operations. Working from outside India is not permitted.",
        ]),
        Section("2. Office attendance requirements", [
            "Eligible employees work from the office at least three (3) days per week.",
            "Each team sets one common in-office anchor day per week for collaboration. Attendance on the anchor day is expected.",
            "Remote days must be agreed with your manager and recorded in the HR portal by Friday for the following week.",
        ]),
        Section("3. Working hours", [
            "Standard working hours are 9:00 AM to 6:00 PM, Monday to Friday, including a one-hour lunch break.",
            "Employees may start between 8:00 AM and 10:00 AM, provided they are available during core collaboration hours of 10:00 AM to 4:00 PM.",
        ]),
        Section("4. Remote work expectations", [
            [
                "Be reachable on chat and phone during core collaboration hours, and reply to messages within thirty (30) minutes during those hours.",
                "Keep your calendar up to date and join video meetings with your camera on where possible.",
                "Work from a quiet, private space. Always connect through the company VPN, and do not use public Wi-Fi without the VPN.",
                "Follow the IT and Information Security Policy (OIQ-IT-SEC-006) for devices and confidential data.",
            ],
        ]),
        Section("5. Equipment and allowance", [
            "The company provides a laptop and a headset to every employee.",
            "A one-time home office allowance of up to INR 10,000 is available after ninety (90) days of service, for a desk, chair or monitor. Claim it in the expense portal with receipts.",
        ]),
    ],
)

SECURITY = Policy(
    filename="OIQ-IT-SEC-006_IT-and-Information-Security-Policy.pdf",
    title="IT and Information Security Policy",
    policy_id="OIQ-IT-SEC-006",
    version="4.0",
    effective="February 1, 2026",
    owner="IT Security",
    applies_to="All employees, contractors and interns with access to company systems",
    next_review="January 2027",
    purpose="This policy explains how everyone at OnboardIQ Technologies protects company information, systems and devices.",
    sections=[
        Section("1. Password requirements", [
            [
                "Passwords must be at least fourteen (14) characters long.",
                "Passwords must not be reused across systems or shared with anyone, including IT staff.",
                "Use the company-provided password manager to generate and store passwords.",
                "Multi-factor authentication (MFA) is mandatory for email, VPN and all business applications.",
                "If you suspect a password is compromised, change it immediately and contact the IT help desk.",
            ],
        ]),
        Section("2. Device usage", [
            [
                "Company laptops must use full-disk encryption and lock the screen automatically after five (5) minutes of inactivity.",
                "Install operating system and security updates within seven (7) days of release.",
                "Install software only from the company software portal. Personal USB storage devices must not be used on company laptops.",
                "Report a lost or stolen device to the IT service desk within one (1) hour of noticing.",
            ],
        ]),
        Section("3. Data confidentiality", [
            "Company information is classified into four levels:",
            ("table", [
                ["Classification", "Examples", "Handling"],
                ["Public", "Published marketing content", "May be shared externally"],
                ["Internal", "Policies, team plans", "Employees only"],
                ["Confidential", "Customer data, salaries", "Need-to-know; encrypted"],
                ["Restricted", "Credentials, security keys", "Named people only"],
            ]),
            "Confidential data must not be stored on personal devices or personal cloud storage, and must not be pasted into public AI tools.",
            "Lock your screen when you leave your desk, and do not discuss confidential information in public places.",
        ]),
        Section("4. Phishing awareness", [
            "Do not click links or open attachments in unexpected emails, even if they appear to come from a colleague.",
            "Report suspected phishing using the Report Phishing button in your mail client, or forward the message to the IT security team.",
            "If you entered your password on a suspicious site, change it immediately and contact the IT help desk.",
            "IT Security runs a phishing simulation every quarter. Employees who click a simulated phishing link complete a short refresher course within seven (7) days.",
        ]),
        Section("5. Reporting security incidents", [
            [
                "Report any suspected security incident (lost device, malware, data sent to the wrong person, suspicious account activity) within one (1) hour of discovery.",
                "Report to security@onboardiq-demo.example or call the IT help desk on extension 4357.",
                "Do not try to investigate or fix the incident yourself, and do not delete evidence.",
                "IT Security acknowledges reports within thirty (30) minutes during working hours.",
            ],
            "All employees complete Information Security training when they join and a refresher course every year.",
        ]),
    ],
)

CONDUCT = Policy(
    filename="OIQ-HR-COC-007_Code-of-Conduct-Policy.pdf",
    title="Code of Conduct Policy",
    policy_id="OIQ-HR-COC-007",
    version="3.0",
    effective="January 1, 2026",
    owner="People Operations and Legal",
    applies_to="All employees, interns and contractors",
    next_review="December 2026",
    purpose="This policy sets out the behaviour expected of everyone at OnboardIQ Technologies and explains how concerns and breaches are handled.",
    sections=[
        Section("1. Workplace behaviour", [
            "Treat colleagues, customers and partners with respect and courtesy. Discrimination based on gender, religion, caste, age, disability, sexual orientation or any other protected characteristic is not tolerated.",
            "Arrive prepared for meetings, keep commitments, and use company resources responsibly.",
            "Alcohol and illegal substances are not permitted at the workplace, except alcohol at company events where it is formally approved.",
        ]),
        Section("2. Professional communication", [
            "Communicate clearly, politely and honestly in person, by email and on chat.",
            "Reply to internal emails within one (1) working day, even if only to acknowledge them.",
            "Do not share confidential company information on social media, and do not speak on behalf of the company publicly unless authorised by the Communications team.",
        ]),
        Section("3. Anti-harassment", [
            "OnboardIQ Technologies has zero tolerance for harassment, including sexual harassment, bullying and intimidation, whether in the office, remotely or at company events.",
            "Complaints of sexual harassment are handled by the Internal Committee (IC) under the POSH policy. Complaints should be made in writing within three (3) months of the incident to ic@onboardiq-demo.example.",
            "The Internal Committee completes its inquiry within ninety (90) days of receiving a complaint. All complaints are kept confidential.",
            "Retaliation against anyone who raises a concern in good faith is itself a serious breach of this policy.",
        ]),
        Section("4. Ethics", [
            [
                "Gifts and hospitality from customers or suppliers may be accepted only up to a value of INR 2,000 per occasion. Gifts above this value must be declined or declared to People Operations.",
                "Declare any actual or potential conflict of interest to your manager and People Operations within seven (7) days of becoming aware of it.",
                "Do not trade in shares based on confidential information you learn through your work.",
                "Report suspected fraud or unethical conduct to the confidential ethics line at ethics@onboardiq-demo.example. Reports can be made anonymously.",
            ],
        ]),
        Section("5. Disciplinary procedures", [
            "Breaches of this policy are handled fairly and consistently. Depending on how serious the breach is, actions include:",
            ("table", [
                ["Stage", "Action", "Typical use"],
                ["1", "Verbal warning", "Minor first breach"],
                ["2", "Written warning", "Repeated or more serious breach"],
                ["3", "Final written warning", "Continued breach after a written warning"],
                ["4", "Suspension or termination", "Gross misconduct (e.g. harassment, fraud, violence)"],
            ]),
            "Written warnings remain on file for twelve (12) months. Gross misconduct can lead directly to termination.",
            "Before any written action, the employee is told the concern in writing and given a chance to respond at a meeting, where they may bring a colleague.",
            "Employees can appeal a disciplinary decision in writing to the Head of People Operations within seven (7) working days of the decision.",
        ]),
    ],
)

POLICIES = [LEAVE, BENEFITS, PAYROLL, ONBOARDING, HYBRID, SECURITY, CONDUCT]


# ---------------------------------------------------------------------------------------------------------------
# PDF rendering
# ---------------------------------------------------------------------------------------------------------------


class NumberedCanvas(rl_canvas.Canvas):
    """Adds "Page X of Y" and the fictional-content header/footer to every page."""

    def __init__(self, *args, policy: Policy, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._policy = policy
        self._saved_pages: list[dict] = []

    def showPage(self) -> None:  # noqa: N802 (reportlab API)
        self._saved_pages.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._saved_pages)
        for state in self._saved_pages:
            self.__dict__.update(state)
            self._decorate(total)
            super().showPage()
        super().save()

    def _decorate(self, total: int) -> None:
        width, height = A4
        policy = self._policy
        self.setFillColor(NAVY)
        self.rect(0, height - 14 * mm, width, 14 * mm, stroke=0, fill=1)
        self.setFillColor(colors.white)
        self.setFont("Helvetica-Bold", 9.5)
        self.drawString(18 * mm, height - 8.8 * mm, f"{COMPANY} (fictional)")
        self.setFont("Helvetica", 8.5)
        self.drawRightString(width - 18 * mm, height - 8.8 * mm, "FICTIONAL DEMONSTRATION POLICY")

        self.setStrokeColor(LINE)
        self.line(18 * mm, 15 * mm, width - 18 * mm, 15 * mm)
        self.setFillColor(colors.HexColor("#5B6B82"))
        self.setFont("Helvetica", 8)
        self.drawString(18 * mm, 10 * mm, f"{policy.policy_id} · {policy.title} · Version {policy.version} · Effective {policy.effective}")
        self.drawRightString(width - 18 * mm, 10 * mm, f"Page {self._pageNumber} of {total}")
        self.drawCentredString(width / 2, 5.5 * mm, "Fictional content for the OnboardIQ demo. Not real company policy.")


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=21, leading=26, textColor=NAVY, alignment=TA_LEFT, spaceAfter=2),
        "subtitle": ParagraphStyle("subtitle", parent=base["Normal"], fontSize=10.5, textColor=BLUE, spaceAfter=10),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=NAVY, spaceBefore=12, spaceAfter=5),
        "body": ParagraphStyle("body", parent=base["Normal"], fontName="Helvetica", fontSize=10, leading=14.5, textColor=colors.HexColor("#1F2A3C"), spaceAfter=5),
        "cell": ParagraphStyle("cell", parent=base["Normal"], fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#1F2A3C")),
        "cellhead": ParagraphStyle("cellhead", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=colors.white),
        "notice": ParagraphStyle("notice", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=13, textColor=colors.HexColor("#8A5A00")),
    }


def _table(rows: list[list[str]], styles: dict[str, ParagraphStyle], widths: list[float] | None = None) -> Table:
    data = [[Paragraph(cell, styles["cellhead"] if r == 0 else styles["cell"]) for cell in row] for r, row in enumerate(rows)]
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
            ("GRID", (0, 0), (-1, -1), 0.5, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ])
    )
    return table


def build_pdf(policy: Policy, output_dir: Path = OUTPUT_DIR) -> Path:
    styles = _styles()
    path = output_dir / policy.filename
    doc = SimpleDocTemplate(
        str(path), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=22 * mm, bottomMargin=22 * mm,
        title=f"{policy.title} ({policy.policy_id}) - fictional demo", author=f"{COMPANY} (fictional)",
        subject="Fictional demonstration policy for the OnboardIQ project", creator="OnboardIQ demo generator",
    )  # fmt: skip
    content_width = A4[0] - 36 * mm
    story: list = [
        Paragraph(policy.title, styles["title"]),
        Paragraph(f"{COMPANY} · Policy {policy.policy_id}", styles["subtitle"]),
        _table(
            [
                ["Document control", ""],
                ["Policy ID", policy.policy_id],
                ["Version", policy.version],
                ["Effective date", policy.effective],
                ["Policy owner", policy.owner],
                ["Applies to", policy.applies_to],
                ["Next review", policy.next_review],
            ],
            styles,
            [40 * mm, content_width - 40 * mm],
        ),
        Spacer(1, 6),
    ]
    notice = Table([[Paragraph(NOTICE, styles["notice"])]], colWidths=[content_width])
    notice.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF6E0")), ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#E8C36A")), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story += [notice, Paragraph("Purpose", styles["h2"]), Paragraph(policy.purpose, styles["body"])]

    for section in policy.sections:
        flow: list = [Paragraph(section.heading, styles["h2"])]
        for block in section.blocks:
            if isinstance(block, str):
                flow.append(Paragraph(block, styles["body"]))
            elif isinstance(block, list):
                flow.append(
                    ListFlowable(
                        [ListItem(Paragraph(item, styles["body"]), leftIndent=12) for item in block],
                        bulletType="bullet", start="•", leftIndent=12, bulletColor=BLUE,
                    )  # fmt: skip
                )
            else:
                rows = block[1]
                columns = len(rows[0])
                widths = [45 * mm, content_width - 45 * mm] if columns == 2 else [content_width / columns] * columns
                flow.append(_table(rows, styles, widths))
                flow.append(Spacer(1, 6))
        # Keep each section on one page: text is extracted per page and passages never span pages, so a section
        # split across a page break would separate related facts (e.g. a leave type's allowance from its rules).
        story.append(KeepTogether(flow))

    doc.build(story, canvasmaker=lambda *a, **k: NumberedCanvas(*a, policy=policy, **k))
    return path


def main() -> None:
    for policy in POLICIES:
        path = build_pdf(policy)
        print(f"created {path.relative_to(OUTPUT_DIR.parents[1])}")


if __name__ == "__main__":
    main()
