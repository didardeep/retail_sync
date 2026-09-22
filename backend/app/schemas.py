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
class StoreCreate(ORMBase):
    id: str
    name: str
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
    decision: str = "APPROVED"


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


# --------------------------------------------------------------------------
# Audits
# --------------------------------------------------------------------------
class AuditScheduleRequest(ORMBase):
    store_id: str
    scheduled_at: str
    checklist_id: str | None = None
    auditor_id: str | None = None
    audit_type: str = "Checklist based Audit"
    notes: str | None = None


class AnswerQuestionRequest(ORMBase):
    answer: str | None = None
    remarks: str | None = None
    risk: str | None = None
    evidence: list[Any] | None = None


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


class CashReconciliationOut(ORMBase):
    id: str
    store_id: str | None
    cash_at_tills: float | None
    cash_in_safe: float | None
    cash_other_locations: float | None
    physical_cash_total: float | None
    cash_sales_as_per_report: float | None
    float_or_imprest_amount: float | None
    book_cash_total: float | None
    difference: float | None
    remarks: str | None
    raw_data: Any


class CashDepositPickupOut(ORMBase):
    id: str
    store_id: str | None
    sales_date: str | None
    cash_sales: float | None
    cash_deposited: float | None
    difference: float | None
    cms_pickup_date: str | None
    handover_delay_days: int | None
    remarks: str | None


class ExpiredInventoryOut(ORMBase):
    id: str
    store_id: str | None
    article_code: str | None
    article_description: str | None
    expiry_date: str | None
    review_date: str | None
    quantity: float | None
    mrp: float | None


class StoreScoreOut(ORMBase):
    id: str
    store_id: str | None
    store_code: str | None
    status: str | None
    q1: float | None
    q2: float | None
    q3: float | None
    q4: float | None
