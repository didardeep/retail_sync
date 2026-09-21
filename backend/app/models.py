"""
Database models for Retail Sync — Store Audit & Analysis.

Design note: the audit question bank and the answers auditors give are
deliberately stored with a few stable columns plus a JSON blob for the
parts that vary by client (tags, extra metadata, evidence list). That
keeps the schema usable before the real client data has been received,
and avoids a migration every time a new question attribute appears.
"""
import datetime as dt
import uuid

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text,
)
from sqlalchemy.orm import relationship

from .db import Base

# JSON works on both SQLite and Postgres via SQLAlchemy's generic type.
from sqlalchemy.types import JSON


def _uid() -> str:
    return uuid.uuid4().hex[:12]


# --------------------------------------------------------------------------
# Roles
# --------------------------------------------------------------------------
ROLE_AUDIT_MANAGER = "AUDIT_MANAGER"
ROLE_AUDITOR = "AUDITOR"
ROLE_STORE_MANAGER = "STORE_MANAGER"
ROLES = (ROLE_AUDIT_MANAGER, ROLE_AUDITOR, ROLE_STORE_MANAGER)


class User(Base):
    __tablename__ = "users"

    id = Column(String(12), primary_key=True, default=_uid)
    name = Column(String(120), nullable=False)
    email = Column(String(200), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(20), nullable=False)          # one of ROLES
    designation = Column(String(120))                   # "Senior Field Auditor"
    region = Column(String(60))
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    audits = relationship("Audit", back_populates="auditor",
                          foreign_keys="Audit.auditor_id")

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "email": self.email,
            "role": self.role, "designation": self.designation,
            "region": self.region, "active": self.active,
        }


class AuditorAvailability(Base):
    """Blocks an auditor out — leave, training, long weekend."""
    __tablename__ = "auditor_availability"

    id = Column(String(12), primary_key=True, default=_uid)
    auditor_id = Column(String(12), ForeignKey("users.id"), nullable=False)
    from_date = Column(Date, nullable=False)
    to_date = Column(Date, nullable=False)
    reason = Column(String(200))

    def to_dict(self):
        return {
            "id": self.id, "auditor_id": self.auditor_id,
            "from_date": self.from_date.isoformat(),
            "to_date": self.to_date.isoformat(), "reason": self.reason,
        }


# --------------------------------------------------------------------------
# Stores
# --------------------------------------------------------------------------
class Store(Base):
    __tablename__ = "stores"

    id = Column(String(20), primary_key=True)           # ST001
    name = Column(String(160), nullable=False)
    city = Column(String(80))
    region = Column(String(60))
    store_format = Column(String(20))                   # COCO / COFO / FOCO / FOFO
    store_type = Column(String(40))                     # Flagship / Standard / ...
    status = Column(String(20), default="Operating")    # Operating / Dehired
    manager_id = Column(String(12), ForeignKey("users.id"))
    contact = Column(String(40))
    email = Column(String(200))
    address = Column(Text)
    store_code = Column(String(40), index=True)
    state = Column(String(80))
    district = Column(String(80))
    postal_code = Column(Text)
    deputy_manager = Column(String(120))
    operations_manager = Column(String(120))
    store_category = Column(String(80))
    meta = Column(JSON, default=dict)                   # historic scores etc.

    manager = relationship("User", foreign_keys=[manager_id])

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "city": self.city,
            "region": self.region, "format": self.store_format,
            "type": self.store_type, "status": self.status,
            "manager": self.manager.name if self.manager else None,
            "manager_id": self.manager_id, "contact": self.contact,
            "email": self.email, "address": self.address,
            "store_code": self.store_code, "state": self.state,
            "district": self.district, "postal_code": self.postal_code,
            "deputy_manager": self.deputy_manager,
            "operations_manager": self.operations_manager,
            "store_category": self.store_category,
            "meta": self.meta or {},
        }


# --------------------------------------------------------------------------
# Client file imports and audit evidence data
# --------------------------------------------------------------------------
class DataImport(Base):
    """Tracks a source file while retaining its original column headers."""
    __tablename__ = "data_imports"

    id = Column(String(12), primary_key=True, default=_uid)
    file_name = Column(String(240), nullable=False)
    data_section = Column(String(60), nullable=False)
    column_headers = Column(JSON, nullable=False, default=list)
    imported_at = Column(DateTime, default=dt.datetime.utcnow)
    meta = Column(JSON, default=dict)


class CashReconciliation(Base):
    __tablename__ = "cash_reconciliations"

    id = Column(String(12), primary_key=True, default=_uid)
    import_id = Column(String(12), ForeignKey("data_imports.id"))
    store_id = Column(String(20), ForeignKey("stores.id"), index=True)
    source_row_number = Column(Integer)
    cash_at_tills = Column(Float)
    cash_in_safe = Column(Float)
    cash_other_locations = Column(Float)
    physical_cash_total = Column(Float)
    cash_sales_as_per_report = Column(Float)
    float_or_imprest_amount = Column(Float)
    book_cash_total = Column(Float)
    difference = Column(Float)
    remarks = Column(Text)
    raw_data = Column(JSON, default=dict)


class CashDepositPickup(Base):
    __tablename__ = "cash_deposit_pickups"

    id = Column(String(12), primary_key=True, default=_uid)
    import_id = Column(String(12), ForeignKey("data_imports.id"))
    store_id = Column(String(20), ForeignKey("stores.id"), index=True)
    source_row_number = Column(Integer)
    sales_date = Column(Date)
    cash_sales = Column(Float)
    cash_deposited = Column(Float)
    difference = Column(Float)
    cms_pickup_date = Column(Date)
    handover_delay_days = Column(Integer)
    remarks = Column(Text)
    raw_data = Column(JSON, default=dict)


class ExpiredInventory(Base):
    __tablename__ = "expired_inventory"

    id = Column(String(12), primary_key=True, default=_uid)
    import_id = Column(String(12), ForeignKey("data_imports.id"))
    store_id = Column(String(20), ForeignKey("stores.id"), index=True)
    source_row_number = Column(Integer)
    article_code = Column(String(80), index=True)
    article_description = Column(String(240))
    expiry_date = Column(Date)
    review_date = Column(Date)
    quantity = Column(Float)
    mrp = Column(Float)
    raw_data = Column(JSON, default=dict)


class StoreScore(Base):
    __tablename__ = "store_scores"

    id = Column(String(12), primary_key=True, default=_uid)
    import_id = Column(String(12), ForeignKey("data_imports.id"))
    store_id = Column(String(20), ForeignKey("stores.id"), index=True)
    source_row_number = Column(Integer)
    store_code = Column(String(40), index=True)
    status = Column(String(40))
    q1 = Column(Float)
    q2 = Column(Float)
    q3 = Column(Float)
    q4 = Column(Float)
    raw_data = Column(JSON, default=dict)


# --------------------------------------------------------------------------
# Question bank + checklist versioning
# --------------------------------------------------------------------------
class Question(Base):
    """
    One row per question *version*. Editing a question creates a new row with
    version+1 and flips the old row's is_current to False, so historic audits
    keep pointing at the wording that was actually asked.
    """
    __tablename__ = "questions"

    id = Column(String(12), primary_key=True, default=_uid)
    code = Column(String(20), index=True, nullable=False)   # Q001 — stable across versions
    version = Column(Integer, default=1)
    is_current = Column(Boolean, default=True)

    text = Column(Text, nullable=False)
    process = Column(String(80))                # Cashiering, EHS & Compliance...
    sub_process = Column(String(120))
    audit_type = Column(String(60))             # Store Visit / Structured data/DA / Unstructured data
    weight = Column(Integer, default=1)
    is_critical = Column(Boolean, default=False)
    active = Column(Boolean, default=True)

    # Photo/Video and Data Analyst columns from the client checklist
    photo_video_enablement = Column(String(10), default="No")   # Yes / No
    data_analyst_enabled = Column(String(10), default="N")      # Y / N
    data_analyst_reference = Column(String(60))                 # Sheet 1, Sheet 2, Sheet 3...
    annex = Column(String(120))                                 # Annex reference

    # Auditor-proposed questions wait here until an Audit Manager approves.
    approval_status = Column(String(20), default="APPROVED")  # PENDING/APPROVED/REJECTED
    proposed_by_id = Column(String(12), ForeignKey("users.id"))
    approved_by_id = Column(String(12), ForeignKey("users.id"))

    meta = Column(JSON, default=dict)           # tags and anything client-specific
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "code": self.code, "version": self.version,
            "is_current": self.is_current, "text": self.text,
            "process": self.process, "sub_process": self.sub_process,
            "audit_type": self.audit_type, "weight": self.weight,
            "is_critical": self.is_critical, "active": self.active,
            "photo_video_enablement": self.photo_video_enablement,
            "data_analyst_enabled": self.data_analyst_enabled,
            "data_analyst_reference": self.data_analyst_reference,
            "annex": self.annex,
            "approval_status": self.approval_status,
            "proposed_by_id": self.proposed_by_id,
            "meta": self.meta or {},
        }


class Checklist(Base):
    """A named, versioned set of questions with applicability conditions."""
    __tablename__ = "checklists"

    id = Column(String(12), primary_key=True, default=_uid)
    name = Column(String(160), nullable=False)
    version = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    conditions = Column(JSON, default=dict)     # {"format": ["COCO"], "region": [...]}
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    items = relationship("ChecklistItem", back_populates="checklist",
                         cascade="all, delete-orphan")

    def to_dict(self, with_items=False):
        d = {
            "id": self.id, "name": self.name, "version": self.version,
            "is_active": self.is_active, "conditions": self.conditions or {},
            "question_count": len(self.items),
        }
        if with_items:
            d["questions"] = [i.question.to_dict() for i in self.items if i.question]
        return d


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(String(12), primary_key=True, default=_uid)
    checklist_id = Column(String(12), ForeignKey("checklists.id"))
    question_id = Column(String(12), ForeignKey("questions.id"))
    sort_order = Column(Integer, default=0)

    checklist = relationship("Checklist", back_populates="items")
    question = relationship("Question")


# --------------------------------------------------------------------------
# Scheduling + audits
# --------------------------------------------------------------------------
class Audit(Base):
    __tablename__ = "audits"

    id = Column(String(20), primary_key=True)           # AUD-1000
    store_id = Column(String(20), ForeignKey("stores.id"), nullable=False)
    checklist_id = Column(String(12), ForeignKey("checklists.id"))
    auditor_id = Column(String(12), ForeignKey("users.id"))
    created_by_id = Column(String(12), ForeignKey("users.id"))

    audit_type = Column(String(60), default="Checklist based Audit")
    scheduled_at = Column(DateTime)
    submitted_at = Column(DateTime)
    status = Column(String(20), default="Planned")      # Planned/Ongoing/Completed/Approved
    score = Column(Float)
    approved_by_id = Column(String(12), ForeignKey("users.id"))
    sm_rating = Column(Integer)                          # store manager's rating
    sm_comment = Column(Text)
    notes = Column(Text)

    store = relationship("Store")
    checklist = relationship("Checklist")
    auditor = relationship("User", foreign_keys=[auditor_id])
    responses = relationship("AuditResponse", back_populates="audit",
                             cascade="all, delete-orphan")

    def to_dict(self, with_responses=False):
        d = {
            "id": self.id, "store_id": self.store_id,
            "store": self.store.name if self.store else None,
            "city": self.store.city if self.store else None,
            "region": self.store.region if self.store else None,
            "checklist_id": self.checklist_id,
            "auditor_id": self.auditor_id,
            "auditor": self.auditor.name if self.auditor else None,
            "audit_type": self.audit_type,
            "scheduled_at": self.scheduled_at.isoformat() if self.scheduled_at else None,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "status": self.status, "score": self.score,
            "sm_rating": self.sm_rating, "sm_comment": self.sm_comment,
            "notes": self.notes,
        }
        if with_responses:
            d["responses"] = [r.to_dict() for r in self.responses]
        return d


class AuditResponse(Base):
    """One answer to one question version, inside one audit."""
    __tablename__ = "audit_responses"

    id = Column(String(12), primary_key=True, default=_uid)
    audit_id = Column(String(20), ForeignKey("audits.id"))
    question_id = Column(String(12), ForeignKey("questions.id"))

    answer = Column(String(20))                 # Yes / No / Partial / NA
    remarks = Column(Text)
    risk = Column(Text)                          # Risk description or level
    evidence = Column(JSON, default=list)       # [{"type":"photo","url":...}]
    answered_at = Column(DateTime, default=dt.datetime.utcnow)

    audit = relationship("Audit", back_populates="responses")
    question = relationship("Question")

    def to_dict(self):
        q = self.question
        return {
            "id": self.id, "audit_id": self.audit_id,
            "question_id": self.question_id,
            "question_code": q.code if q else None,
            "question_text": q.text if q else None,
            "weight": q.weight if q else None,
            "is_critical": q.is_critical if q else None,
            "process": q.process if q else None,
            "answer": self.answer, "remarks": self.remarks, "risk": self.risk,
            "evidence": self.evidence or [],
        }


# --------------------------------------------------------------------------
# Observations — audit-level findings with action plans
# --------------------------------------------------------------------------
class Observation(Base):
    """
    Maps to the Observations sheet from the client checklist.
    Columns: Sr No, Observation, Risk, Action Plan, Person Responsible, Target, Status
    """
    __tablename__ = "observations"

    id = Column(String(12), primary_key=True, default=_uid)
    audit_id = Column(String(20), ForeignKey("audits.id"), index=True)
    store_id = Column(String(20), ForeignKey("stores.id"), index=True)
    sr_no = Column(Integer, nullable=False)
    observation = Column(Text, nullable=False)
    risk = Column(Text)                          # Risk description or level
    action_plan = Column(Text)
    person_responsible = Column(String(160))
    target = Column(String(120))                # Target date or milestone
    status = Column(String(40), default="Open") # Open / In Progress / Closed / Overdue

    store = relationship("Store")
    audit = relationship("Audit")

    def to_dict(self):
        return {
            "id": self.id, "audit_id": self.audit_id,
            "store_id": self.store_id,
            "store": self.store.name if self.store else None,
            "sr_no": self.sr_no,
            "observation": self.observation, "risk": self.risk,
            "action_plan": self.action_plan,
            "person_responsible": self.person_responsible,
            "target": self.target, "status": self.status,
        }


# --------------------------------------------------------------------------
# Issues / actions
# --------------------------------------------------------------------------
class Issue(Base):
    __tablename__ = "issues"

    id = Column(String(20), primary_key=True, default=_uid)
    audit_id = Column(String(20), ForeignKey("audits.id"))
    store_id = Column(String(20), ForeignKey("stores.id"))
    response_id = Column(String(12), ForeignKey("audit_responses.id"))

    title = Column(String(240), nullable=False)
    description = Column(Text)
    process = Column(String(80))
    sub_process = Column(String(120))
    priority = Column(String(20), default="Medium")     # Critical/High/Medium/Low
    status = Column(String(20), default="Open")         # Open/In Progress/On Hold/Closed
    assignee_id = Column(String(12), ForeignKey("users.id"))
    raised_by_id = Column(String(12), ForeignKey("users.id"))
    due_date = Column(Date)
    closed_at = Column(DateTime)
    action_taken = Column(Text)
    evidence = Column(JSON, default=list)
    meta = Column(JSON, default=dict)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    store = relationship("Store")
    assignee = relationship("User", foreign_keys=[assignee_id])

    @property
    def is_overdue(self):
        if self.status == "Closed" or not self.due_date:
            return False
        return self.due_date < dt.date.today()

    def to_dict(self):
        return {
            "id": self.id, "audit_id": self.audit_id, "store_id": self.store_id,
            "store": self.store.name if self.store else None,
            "title": self.title, "description": self.description,
            "process": self.process, "sub_process": self.sub_process,
            "priority": self.priority, "status": self.status,
            "assignee_id": self.assignee_id,
            "assignee": self.assignee.name if self.assignee else None,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "action_taken": self.action_taken, "evidence": self.evidence or [],
            "overdue": self.is_overdue, "meta": self.meta or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
