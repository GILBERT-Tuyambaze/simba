import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.products import Products
from services.products import ProductsService

logger = logging.getLogger(__name__)

DEFAULT_RESULT_LIMIT = 8
MAX_CONTEXT_PRODUCTS = 160
DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
INTENT_HINTS: dict[str, tuple[str, ...]] = {
    "breakfast": ("milk", "bread", "eggs", "tea", "coffee", "cereal", "oats", "juice", "jam", "butter"),
    "fresh milk": ("milk", "dairy", "yogurt"),
    "tea": ("tea", "milk", "sugar", "biscuits"),
    "coffee": ("coffee", "milk", "sugar", "biscuits"),
    "snack": ("biscuits", "crisps", "juice", "soda", "chocolate"),
}
STOP_WORDS = {
    "a",
    "an",
    "any",
    "do",
    "for",
    "have",
    "i",
    "i'm",
    "im",
    "me",
    "need",
    "show",
    "something",
    "the",
    "want",
    "with",
    "you",
}


def _safe_json_loads(value: Any) -> Any:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def _parse_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        parsed = _safe_json_loads(value)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _expand_query_terms(query: str) -> list[str]:
    normalized = query.strip().lower()
    terms = [
        term
        for term in normalized.split()
        if term and len(term) > 2 and term not in STOP_WORDS
    ]
    expanded = list(terms)

    for phrase, hints in INTENT_HINTS.items():
        if phrase in normalized:
            expanded.extend(hints)

    seen: set[str] = set()
    ordered_terms: list[str] = []
    for term in expanded:
        if term and term not in seen:
            ordered_terms.append(term)
            seen.add(term)
    return ordered_terms


def _build_product_haystack(product: Products) -> str:
    fields = [
        _clean_text(product.name),
        _clean_text(product.category),
        _clean_text(product.brand),
        _clean_text(product.description),
        " ".join(_parse_string_list(product.tags)),
        " ".join(_parse_string_list(product.options)),
        " ".join(_parse_string_list(product.addons)),
        " ".join(_parse_string_list(product.modifiers)),
    ]
    return " ".join(part for part in fields if part).lower()


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _score_product(query: str, product: Products) -> int:
    haystack = _build_product_haystack(product)
    if not haystack:
        return 0

    score = 0
    normalized_query = query.strip().lower()
    terms = _expand_query_terms(query)
    tokens = _tokenize(haystack)

    if normalized_query and normalized_query in haystack:
        score += 7

    for term in terms:
        if term in tokens:
            score += 2

    if getattr(product, "in_stock", False) and not getattr(product, "out_of_stock", False):
        score += 2
    if (getattr(product, "rating", 0) or 0) >= 4.5:
        score += 1
    if (getattr(product, "discount", 0) or 0) > 0:
        score += 1
    if getattr(product, "best_seller", False):
        score += 1

    return score


def _strip_code_fences(raw: str) -> str:
    content = raw.strip()
    if content.startswith("```"):
        lines = content.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines).strip()
    return content


def _extract_json_object(raw: str) -> dict[str, Any]:
    content = _strip_code_fences(raw)
    try:
        parsed = json.loads(content)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return {}
        try:
            parsed = json.loads(content[start : end + 1])
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}


class CatalogAssistantService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.products_service = ProductsService(db)
        self.model = (settings.groq_model or DEFAULT_GROQ_MODEL).strip() or DEFAULT_GROQ_MODEL
        groq_key = settings.groq_api_key.strip()
        groq_base_url = (settings.groq_base_url or DEFAULT_GROQ_BASE_URL).rstrip("/")
        self.client = AsyncOpenAI(api_key=groq_key, base_url=groq_base_url) if groq_key else None

    async def search(self, query: str, limit: int = DEFAULT_RESULT_LIMIT) -> dict[str, Any]:
        normalized_query = query.strip()
        if not normalized_query:
            return {"message": "Tell me what you need and I will suggest matching Simba products.", "product_ids": [], "source": "local"}

        product_list = await self.products_service.get_list(skip=0, limit=1000, sort="-id")
        catalog = [
            product
            for product in product_list["items"]
            if getattr(product, "name", None) and not getattr(product, "discontinued", False)
        ]

        local_matches = self._build_local_matches(normalized_query, catalog, limit)
        if not self.client:
            return self._build_local_response(normalized_query, local_matches)

        try:
            ai_response = await self._search_with_groq(normalized_query, catalog, local_matches, limit)
            if ai_response["product_ids"]:
                return ai_response
        except Exception as exc:
            logger.warning("Groq catalog assistant request failed, using local fallback: %s", exc)

        return self._build_local_response(normalized_query, local_matches)

    def _build_local_matches(self, query: str, catalog: list[Products], limit: int) -> list[Products]:
        ranked = [
            (product, _score_product(query, product))
            for product in catalog
        ]
        ranked = [entry for entry in ranked if entry[1] > 0]
        ranked.sort(
            key=lambda entry: (
                entry[1],
                1 if getattr(entry[0], "in_stock", False) else 0,
                getattr(entry[0], "rating", 0) or 0,
                getattr(entry[0], "discount", 0) or 0,
            ),
            reverse=True,
        )
        return [product for product, _score in ranked[:limit]]

    def _build_local_response(self, query: str, matches: list[Products]) -> dict[str, Any]:
        if matches:
            return {
                "message": f"I found {len(matches)} Simba products related to \"{query}\".",
                "product_ids": [product.id for product in matches],
                "source": "local",
            }

        return {
            "message": f"I could not find a strong Simba match for \"{query}\" yet. Try a more specific product or meal idea.",
            "product_ids": [],
            "source": "local",
        }

    def _build_catalog_context(self, catalog: list[Products]) -> str:
        lines: list[str] = []
        for product in catalog[:MAX_CONTEXT_PRODUCTS]:
            tags = ", ".join(_parse_string_list(product.tags)[:5]) or "-"
            description = _clean_text(product.description)[:140] or "-"
            stock_label = "in stock" if getattr(product, "in_stock", False) else "out of stock"
            price = int(getattr(product, "price", 0) or 0)
            lines.append(
                f'{product.id} | {product.name} | category: {_clean_text(product.category) or "-"} | '
                f'brand: {_clean_text(product.brand) or "Simba"} | price: RWF {price} | '
                f'status: {stock_label} | tags: {tags} | description: {description}'
            )
        return "\n".join(lines)

    async def _search_with_groq(
        self,
        query: str,
        catalog: list[Products],
        local_matches: list[Products],
        limit: int,
    ) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("Groq client is not configured")

        local_ids = [product.id for product in local_matches]
        system_prompt = (
            "You are Simba supermarket's product search assistant. "
            "Return JSON only with this shape: "
            '{"reply":"short natural language answer","product_ids":[1,2,3]}. '
            f"Select up to {limit} products from the catalog. "
            "Only include product IDs that appear in the catalog. "
            "Prefer in-stock items. "
            "For broad requests, choose a practical basket of products."
        )
        user_prompt = (
            f'Customer query: "{query}"\n'
            f"Helpful local matches: {local_ids or 'none'}\n\n"
            f"Catalog:\n{self._build_catalog_context(catalog)}"
        )

        response = await self.client.chat.completions.create(
            model=self.model,
            temperature=0.2,
            max_tokens=300,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        content = response.choices[0].message.content or ""
        payload = _extract_json_object(content)
        reply = _clean_text(payload.get("reply"))
        raw_ids = payload.get("product_ids")
        catalog_ids = {product.id for product in catalog}

        parsed_ids: list[int] = []
        if isinstance(raw_ids, list):
            for item in raw_ids:
                try:
                    product_id = int(item)
                except (TypeError, ValueError):
                    continue
                if product_id in catalog_ids and product_id not in parsed_ids:
                    parsed_ids.append(product_id)

        for local_id in local_ids:
            if local_id not in parsed_ids:
                parsed_ids.append(local_id)

        parsed_ids = parsed_ids[:limit]
        if not reply:
            if parsed_ids:
                reply = f"I found {len(parsed_ids)} Simba products that fit \"{query}\"."
            else:
                reply = f"I could not find a strong Simba match for \"{query}\" yet."

        return {
            "message": reply,
            "product_ids": parsed_ids,
            "source": "groq",
        }
