import json
from typing import Any

DEFAULT_BRANCHES = [
    "Simba Supermarket Remera",
    "Simba Supermarket Kimironko",
    "Simba Supermarket Kacyiru",
    "Simba Supermarket Nyamirambo",
    "Simba Supermarket Gikondo",
    "Simba Supermarket Kanombe",
    "Simba Supermarket Kinyinya",
    "Simba Supermarket Kibagabaga",
    "Simba Supermarket Nyanza",
]
DEFAULT_BRANCH_STOCK = 25


def normalize_branch_stock(value: Any) -> dict[str, int]:
    if not value:
        return {}

    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            return {}
    else:
        parsed = value

    if not isinstance(parsed, dict):
        return {}

    return {
        str(branch): max(int(count or 0), 0)
        for branch, count in parsed.items()
        if str(branch).strip()
    }


def build_default_branch_stock(
    *,
    in_stock: bool | None,
    stock_count: int | None,
    branch: str | None,
) -> dict[str, int]:
    per_branch_stock = max(int(stock_count or 0), 0)
    if per_branch_stock <= 0 and in_stock:
        per_branch_stock = DEFAULT_BRANCH_STOCK

    if per_branch_stock <= 0:
        return {}

    if branch:
        return {str(branch): per_branch_stock}

    return {branch_name: per_branch_stock for branch_name in DEFAULT_BRANCHES}


def ensure_product_inventory(product: Any) -> dict[str, int]:
    branch_stock = normalize_branch_stock(getattr(product, "branch_stock", None))
    if not branch_stock:
        branch_stock = build_default_branch_stock(
            in_stock=bool(getattr(product, "in_stock", False)),
            stock_count=getattr(product, "stock_count", None),
            branch=getattr(product, "branch", None),
        )

    total_stock = sum(branch_stock.values())
    product.branch_stock = json.dumps(branch_stock)
    product.stock_count = total_stock
    product.in_stock = total_stock > 0
    return branch_stock


def get_available_stock(product: Any, branch: str) -> int:
    branch_stock = ensure_product_inventory(product)
    if branch in branch_stock:
        return branch_stock[branch]
    return 0
