"""Generate the Northwind Desk knowledge-base PDFs into backend/kb/.

Placeholder policy documents encoding the rules the agents must follow
(see CLAUDE.md). Run once: uv run python backend/scripts/generate_kb.py
"""

from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

KB_DIR = Path(__file__).resolve().parents[1] / "kb"

DOCS = {
    "support_faq.pdf": (
        "Northwind Desk — Support FAQ",
        [
            ("How do I reset my password?",
             "Go to the sign-in page and click 'Forgot password'. Enter the email address "
             "on your account and we will send a reset link within a few minutes. The link "
             "expires after 60 minutes. If you do not receive it, check your spam folder or "
             "ask support to trigger a manual reset. Support agents may send password-reset "
             "instructions without additional approval; agents must never set a password on "
             "a customer's behalf."),
            ("I was double-charged. Can I get a refund?",
             "If you see a duplicate charge, contact support with the invoice numbers. "
             "Verified duplicate charges are always refunded in full. Refunds of 50 USD or "
             "less can be issued directly by a support agent. Any refund above 50 USD "
             "requires approval by a human supervisor before it is processed. Refunds are "
             "returned to the original payment method within 5-7 business days."),
            ("How do I cancel my plan?",
             "You can request cancellation from Settings, or by contacting support. "
             "Plan cancellations are account-level changes and always require human "
             "supervisor approval before they take effect. Annual plans cancelled within "
             "30 days of purchase receive a full refund; after 30 days the plan remains "
             "active until the end of the paid term. Monthly plans are not refundable; "
             "cancellation stops the next renewal."),
            ("How do I close my account entirely?",
             "Account closure is permanent and requires human supervisor approval. After "
             "closure, all customer data is permanently deleted 30 days later. During those "
             "30 days you may reopen the account and recover your data."),
            ("What are your support hours?",
             "Chat and email support are available 24/7. Phone support for Enterprise "
             "customers is available Monday through Friday, 9am to 6pm US Eastern."),
        ],
    ),
    "pricing_and_plans.pdf": (
        "Northwind Desk — Pricing and Plans",
        [
            ("Plan tiers",
             "Northwind Desk offers three plans. Starter: 9 USD per user per month, includes "
             "ticketing, a shared inbox, and email support. Pro: 29 USD per user per month, "
             "adds automations, reporting, and integrations. Enterprise: 79 USD per user per "
             "month, adds SSO, audit logs, a dedicated success manager, and phone support."),
            ("Integrations by plan",
             "Integrations (including Slack, Microsoft Teams, Zapier, and the REST API) are "
             "available on the Pro and Enterprise plans only. The Starter plan does not "
             "include any integrations. Customers on Starter who ask about Slack or API "
             "access should be offered an upgrade to Pro."),
            ("Billing cycles",
             "Plans are billed monthly or annually. Annual billing includes a discount of "
             "two months. Invoices are issued to the billing email on file and are payable "
             "by card or, for Enterprise, by bank transfer."),
            ("Refund policy",
             "Annual plans are refundable in full within 30 days of purchase. After 30 days, "
             "annual plans are not refundable but remain active until the end of the term. "
             "Monthly plans are not refundable under any circumstances; cancelling a monthly "
             "plan stops future renewals. Duplicate or erroneous charges are always refunded "
             "in full once verified. Refunds above 50 USD require supervisor approval."),
            ("Plan changes",
             "Upgrades take effect immediately and are prorated. Downgrades take effect at "
             "the next renewal date. Moving from annual to monthly billing takes effect at "
             "the end of the current annual term."),
        ],
    ),
    "security_policy.pdf": (
        "Northwind Desk — Security and Data Policy",
        [
            ("Data retention and deletion",
             "When an account is closed, all customer data — tickets, contacts, attachments, "
             "and analytics — is permanently deleted 30 days after the closure date. This "
             "deletion is irreversible. Within the 30-day window the account can be reopened "
             "and data fully restored. Any action that deletes or modifies stored customer "
             "data requires human supervisor approval before execution."),
            ("Authentication",
             "Passwords must be at least 12 characters. Password reset links are valid for "
             "60 minutes and single-use. Two-factor authentication is available on all plans "
             "and required for Enterprise administrator accounts. Support staff can trigger "
             "a password-reset email but can never view or set a customer password."),
            ("Data access by support staff",
             "Support agents may view account metadata and ticket contents to resolve "
             "issues. Access to stored payment details is restricted to the billing system; "
             "agents see only the last four digits of a card. All support access is logged "
             "in the audit trail."),
            ("Compliance",
             "Northwind Desk is SOC 2 Type II certified and GDPR compliant. Data is "
             "encrypted in transit (TLS 1.2+) and at rest (AES-256). Data export requests "
             "are fulfilled within 30 days."),
        ],
    ),
    "product_guide.pdf": (
        "Northwind Desk — Product Guide",
        [
            ("Getting started",
             "Northwind Desk is a customer-support helpdesk. Create an inbox, connect your "
             "support email address, and invite teammates. Incoming emails become tickets "
             "that can be assigned, tagged, and resolved."),
            ("Ticketing",
             "Tickets have a status (open, pending, resolved), an assignee, tags, and a "
             "full conversation history. Internal notes are visible only to teammates. "
             "Merging combines duplicate tickets from the same customer."),
            ("Automations (Pro and Enterprise)",
             "Automations route tickets by keyword, set priorities, and send auto-replies "
             "outside business hours. Automations are available starting on the Pro plan."),
            ("Integrations (Pro and Enterprise)",
             "The Slack integration posts new tickets and replies into a Slack channel and "
             "lets agents respond without leaving Slack. The REST API and Zapier connector "
             "support custom workflows. Integrations require the Pro plan or higher; the "
             "Starter plan does not include integrations."),
            ("Reporting",
             "Dashboards track first-response time, resolution time, and CSAT. Reports can "
             "be exported as CSV on Pro and Enterprise."),
        ],
    ),
    "employee_handbook.pdf": (
        "Northwind Desk — Support Employee Handbook",
        [
            ("Tone and principles",
             "Be direct, warm, and accurate. Never promise what policy does not allow. "
             "Always cite the relevant policy when denying a request, and offer the nearest "
             "allowed alternative."),
            ("Approval matrix",
             "Safe actions a support agent may execute autonomously: answering questions, "
             "sending informational replies, sending password-reset instructions, and "
             "issuing refunds of 50 USD or less. Actions that require human supervisor "
             "approval before execution: refunds above 50 USD, plan cancellations, account "
             "closure or deletion, and any action that touches stored customer data. When "
             "in doubt, escalate to a supervisor."),
            ("Refund handling procedure",
             "Verify the charge in the billing system, confirm eligibility against the "
             "refund policy (annual within 30 days: full refund; monthly: no refund; "
             "verified duplicate charge: always refundable), then issue the refund or "
             "submit it for supervisor approval if it exceeds 50 USD. Record the invoice "
             "number and reason on the ticket."),
            ("Escalation",
             "Escalate to a human supervisor when a request is out of policy, when a "
             "customer disputes a policy decision twice, or when an approval is rejected "
             "and no compliant alternative exists. Escalated tickets must carry the full "
             "context: the request, the policy citations, and every draft considered."),
        ],
    ),
}


def build_pdf(path: Path, title: str, sections: list[tuple[str, str]]) -> None:
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("DocTitle", parent=styles["Title"], spaceAfter=18)
    h2 = ParagraphStyle("Section", parent=styles["Heading2"], spaceBefore=14, spaceAfter=6)
    body = ParagraphStyle("Body", parent=styles["BodyText"], leading=15)

    doc = SimpleDocTemplate(str(path), pagesize=LETTER,
                            topMargin=inch, bottomMargin=inch)
    flow = [Paragraph(title, h1), Spacer(1, 6)]
    for heading, text in sections:
        flow.append(Paragraph(heading, h2))
        flow.append(Paragraph(text, body))
    doc.build(flow)


def main() -> None:
    KB_DIR.mkdir(parents=True, exist_ok=True)
    for filename, (title, sections) in DOCS.items():
        path = KB_DIR / filename
        build_pdf(path, title, sections)
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
