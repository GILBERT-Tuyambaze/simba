from __future__ import annotations

from typing import Optional, Set

StoreRole = str

ROLE_ALIASES = {
    "admin": "super_admin",
    "super_admin": "super_admin",
    "superadmin": "super_admin",
    "manager": "branch_manager",
    "branch_manager": "branch_manager",
    "branchmanager": "branch_manager",
    "staff": "branch_staff",
    "branch_staff": "branch_staff",
    "branchstaff": "branch_staff",
    "delivery": "delivery_agent",
    "delivery_agent": "delivery_agent",
    "deliveryagent": "delivery_agent",
    "courier": "delivery_agent",
    "user": "customer",
    "customer": "customer",
}

PRODUCT_MANAGER_ROLES: Set[StoreRole] = {"super_admin", "branch_manager", "branch_staff"}
DASHBOARD_ROLES: Set[StoreRole] = {"super_admin", "branch_manager", "branch_staff", "delivery_agent"}

ASSIGNABLE_ROLES: dict[StoreRole, Set[StoreRole]] = {
    "super_admin": {"super_admin", "branch_manager", "branch_staff", "delivery_agent", "customer"},
    "branch_manager": {"branch_staff", "delivery_agent", "customer"},
    "branch_staff": {"customer"},
    "delivery_agent": {"delivery_agent", "customer"},
    "customer": set(),
}


def normalize_store_role(role: Optional[str]) -> StoreRole:
    normalized = (role or "").strip().lower().replace("-", "_").replace(" ", "_")
    return ROLE_ALIASES.get(normalized, "customer")


def can_access_dashboard(role: Optional[str]) -> bool:
    return normalize_store_role(role) in DASHBOARD_ROLES


def can_manage_products(role: Optional[str]) -> bool:
    return normalize_store_role(role) in PRODUCT_MANAGER_ROLES


def can_invite_role(actor_role: Optional[str], target_role: Optional[str]) -> bool:
    actor = normalize_store_role(actor_role)
    target = normalize_store_role(target_role)
    return target in ASSIGNABLE_ROLES.get(actor, set())


def can_update_existing_roles(actor_role: Optional[str]) -> bool:
    return normalize_store_role(actor_role) == "super_admin"


def is_branch_scoped(role: Optional[str]) -> bool:
    return normalize_store_role(role) in {"branch_manager", "branch_staff", "delivery_agent"}


def is_customer_role(role: Optional[str]) -> bool:
    return normalize_store_role(role) == "customer"

