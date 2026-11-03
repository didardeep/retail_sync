"""Pydantic request/response models. Response shapes mirror models.py's
to_dict() methods exactly (see that file for context) — anything that
doesn't have a to_dict() there (DataImport, CashReconciliation,
CashDepositPickup, ExpiredInventory, StoreScore) is defined here to match
what routes.py used to serialise inline."""
from __future__ import annotations

import datetime as dt
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ORMBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
class LoginRequest(ORMBase):
    email: str = ""
    password: str = ""


class LoginResponse(ORMBase):
    token: str
    user: dict[str, Any]


# --------------------------------------------------------------------------
# Stores
# --------------------------------------------------------------------------
class BrandCreate(ORMBase):
    name: str
    code: str | None = None
    legal_name: str | None = None
    category: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    regions: list[str] = Field(default_factory=list)
    status: str = "Active"
    notes: str | None = None


class BrandUpdate(ORMBase):
    name: str | None = None
    code: str | None = None
    legal_name: str | None = None
    category: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    regions: list[str] | None = None
    status: str | None = None
    notes: str | None = None


class StorePersonLink(ORMBase):
    """Link an existing auditor or auditee to a store."""
    user_id: str


class StorePersonRemove(ORMBase):
    """Unlink a person from a store, and what to do with their open work there.
    Auditor: planned audits at the store go to `reassign_to`, or are left
    unassigned. Auditee: open issues at the store go to `move_issues_to`; with
    open issues and no one to move them to, the removal is refused."""
    reassign_to: str | None = None
    move_issues_to: str | None = None


class PersonCreate(ORMBase):
    """An audit manager adds an auditor or an auditee."""
    name: str
    email: str
    password: str
    designation: str | None = None
    region: str | None = None
    phone: str | None = None
    notify_email: str | None = None
    store_ids: list[str] = Field(default_factory=list)


class PersonUpdate(ORMBase):
    name: str | None = None
    designation: str | None = None
    region: str | None = None
    phone: str | None = None
    notify_email: str | None = None
    active: bool | None = None
    # Deactivating with open work: hand it to this person (same role).
    hand_over_to: str | None = None


class StoreCreate(ORMBase):
    id: str
    name: str
    brand_id: str | None = None       # blank means the Unassigned brand
    city: str | None = None
    region: str | None = None
    format: str | None = None
    type: str | None = None
    status: str = "Operating"
    manager_id: str | None = None
    contact: str | None = None
    email: str | None = None
    address: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class StoreUpdate(ORMBase):
    name: str | None = None
    brand_id: str | None = None       # move the store to another brand
    city: str | None = None
    region: str | None = None
    format: str | None = None
    type: str | None = None
    status: str | None = None
    manager_id: str | None = None
    contact: str | None = None
    email: str | None = None
    address: str | None = None


# --------------------------------------------------------------------------
# Questions
# --------------------------------------------------------------------------
class QuestionCreate(ORMBase):
    code: str | None = None
    text: str
    process: str | None = None
    sub_process: str | None = None
    audit_type: str | None = None
    weight: int = 1
    is_critical: bool = False
    meta: dict[str, Any] = Field(default_factory=dict)


class QuestionApprove(ORMBase):
    decision: str = "APPROVED"        # APPROVED | REJECTED
    reason: str = ""                  # required when REJECTED


class QuestionEdit(ORMBase):
    text: str | None = None
    process: str | None = None
    sub_process: str | None = None
    audit_type: str | None = None
    weight: int | None = None
    is_critical: bool | None = None
    active: bool | None = None
    meta: dict[str, Any] | None = None


# --------------------------------------------------------------------------
# Checklists
# --------------------------------------------------------------------------
class ChecklistCreate(ORMBase):
    name: str
    conditions: dict[str, Any] = Field(default_factory=dict)
    question_ids: list[str] = Field(default_factory=list)
    is_active: bool = True


# --------------------------------------------------------------------------
# Audits
# --------------------------------------------------------------------------
class AuditScheduleRequest(ORMBase):
    store_id: str
    scheduled_at: str
    due_at: str | None = None
    checklist_id: str | None = None
    auditor_id: str | None = None
    audit_type: str = "Checklist based Audit"
    notes: str | None = None
    # Also make the chosen auditor one of the store's auditors, so the next
    # audit there suggests them.
    assign_to_store: bool = False


class AnswerQuestionRequest(ORMBase):
    answer: str | None = None
    remarks: str | None = None
    risk: str | None = None
    evidence: list[Any] | None = None


class AuditStartRequest(ORMBase):
    store_id: str
    checklist_id: str


class AuditApproveRequest(ORMBase):
    score: float | None = None


class AuditRatingRequest(ORMBase):
    rating: int | None = None
    comment: str | None = None


# --------------------------------------------------------------------------
# Availability
# --------------------------------------------------------------------------
class AvailabilityCreate(ORMBase):
    auditor_id: str | None = None
    from_date: str
    to_date: str
    reason: str | None = None


# --------------------------------------------------------------------------
# Issues
# --------------------------------------------------------------------------
class IssueCreate(ORMBase):
    audit_id: str | None = None
    store_id: str | None = None
    title: str
    description: str | None = None
    process: str | None = None
    sub_process: str | None = None
    priority: str = "Medium"
    assignee_id: str | None = None
    due_date: str | None = None


class RaiseIssueRequest(ORMBase):
    """The auditor's choice to raise an issue on one answered question."""
    assignee_id: str
    description: str | None = None
    priority: str = "Medium"
    due_date: str | None = None


class ResponseReview(ORMBase):
    decision: str                     # approve | query
    note: str = ""
    # Optional label for a query: wrong_answer / missing_evidence / unclear_photo / other
    category: str | None = None


class AuditReassign(ORMBase):
    """Give a planned or ongoing audit to another auditor; None removes the auditor."""
    auditor_id: str | None = None
    reason: str = ""


class DecisionItem(ORMBase):
    response_id: str
    note: str = ""
    category: str | None = None       # wrong_answer / missing_evidence / unclear_photo / other


class AuditDecision(ORMBase):
    """The audit manager's verdict on a submitted audit."""
    decision: str                     # approve | return | reject
    reason: str = ""
    items: list[DecisionItem] = []    # the questions to check again (return only)


class AuditRequestChanges(ORMBase):
    """Send a reviewed audit back to the auditor to fix the queried questions."""
    note: str = ""


class IssueDecision(ORMBase):
    """The audit manager's call on the action taken: approve closes the issue,
    deny reopens it and needs a reason; evidence is optional."""
    decision: str                     # approve | deny
    reason: str = ""
    evidence: list[Any] = Field(default_factory=list)


class ResponseReply(ORMBase):
    note: str = ""


class IssueReview(ORMBase):
    decision: str                     # accept | send_back
    note: str = ""


class IssueUpdate(ORMBase):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    assignee_id: str | None = None
    action_taken: str | None = None
    evidence: list[Any] | None = None
    due_date: str | None = None


# --------------------------------------------------------------------------
# Observations
# --------------------------------------------------------------------------
class ObservationCreate(ORMBase):
    audit_id: str | None = None
    store_id: str | None = None
    sr_no: int | None = None
    observation: str
    risk: str = "Medium"
    action_plan: str | None = None
    person_responsible: str | None = None
    target: str | None = None
    status: str = "Open"


class ObservationUpdate(ORMBase):
    observation: str | None = None
    risk: str | None = None
    action_plan: str | None = None
    person_responsible: str | None = None
    target: str | None = None
    status: str | None = None


# --------------------------------------------------------------------------
# Structured data — response shapes (no to_dict() on these models)
# --------------------------------------------------------------------------
class DataImportOut(ORMBase):
    id: str
    file_name: str
    data_section: str
    column_headers: Any
    imported_at: str | None = None


class StoreScoreOut(ORMBase):
    id: str
    store_id: str | None
    store_code: str | None
    status: str | None
    q1: float | None
    q2: float | None
    q3: float | None
    q4: float | None


# --------------------------------------------------------------------------
# Chat / AI Assistant
# --------------------------------------------------------------------------
class ChatMessage(ORMBase):
    role: str   # "user" or "assistant"
    content: str


class ChatRequest(ORMBase):
    messages: list[ChatMessage]
    conversation_id: str | None = None


class ChartSpec(ORMBase):
    type: str               # bar | line | pie
    title: str
    x_key: str
    y_label: str = ""
    series: list[dict[str, Any]] = Field(default_factory=list)
    data: list[dict[str, Any]] = Field(default_factory=list)


class TableSpec(ORMBase):
    title: str
    columns: list[str]
    rows: list[list[Any]]


class CardsSpec(ORMBase):
    title: str
    items: list[dict[str, Any]] = Field(default_factory=list)


class DetailsSpec(ORMBase):
    title: str
    items: list[dict[str, Any]] = Field(default_factory=list)


class ChatResponse(ORMBase):
    reply: str
    charts: list[ChartSpec] = Field(default_factory=list)
    tables: list[TableSpec] = Field(default_factory=list)
    cards: list[CardsSpec] = Field(default_factory=list)
    details: list[DetailsSpec] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    conversation_id: str = ""


# ---------------------------------------------------------------------------
# Admin — user management
# ---------------------------------------------------------------------------

class UserCreate(ORMBase):
    name: str
    email: str
    password: str
    role: str                         # AUDIT_MANAGER | AUDITOR | STORE_MANAGER | AUDITEE | CLUSTER_HEAD | HO_OPERATIONS
    designation: str | None = None
    region: str | None = None
    notify_email: str | None = None
    store_id: str | None = None       # STORE_MANAGER only — assigns as store manager
    store_ids: list[str] = Field(default_factory=list)   # AUDITEE only — stores linked to


class UserUpdate(ORMBase):
    name: str | None = None
    email: str | None = None
    designation: str | None = None
    region: str | None = None
    notify_email: str | None = None
    store_id: str | None = None       # reassign store for STORE_MANAGER
    store_ids: list[str] | None = None  # replace the stores an AUDITEE is linked to
    active: bool | None = None
    password: str | None = None       # optional password reset


# --------------------------------------------------------------------------
# Audit rescheduling
# --------------------------------------------------------------------------
class AuditPatchRequest(ORMBase):
    status: str | None = None
    auditor_id: str | None = None
    scheduled_at: str | None = None
    due_at: str | None = None
    notes: str | None = None
