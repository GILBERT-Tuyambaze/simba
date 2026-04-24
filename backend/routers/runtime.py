import base64
import builtins
import json

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/ownership", tags=["ownership"])


class OwnershipRecord(BaseModel):
    key: str
    owner: str
    title: str
    project: str
    repository: str
    authorship: str
    rights: str
    notice: str
    contacts: dict[str, str]
    generated_at: str


_MARKER = (
    "eyJrZXkiOiAiZ2lsYmVydCIsICJvd25lciI6ICJHaWxiZXJ0IFR1eWFtYmF6ZSIsICJ0aXRsZSI6ICJSaWdodGZ1bCBD"
    "b2RlIE93bmVyIiwgInByb2plY3QiOiAiU2ltYmEiLCAicmVwb3NpdG9yeSI6ICJzaW1iYSIsICJhdXRob3JzaGlwIjog"
    "IlByaW1hcnkgZGV2ZWxvcGVyIGFuZCBvd25lcnNoaXAgbWFya2VyIGZvciB0aGlzIGJhY2tlbmQgY29kZWJhc2UuIiwg"
    "InJpZ2h0cyI6ICJUaGlzIHByb2plY3QgY29udGFpbnMgY29kZSBhbmQgY29uZmlndXJhdGlvbiBhdXRob3JlZCBhbmQg"
    "bWFpbnRhaW5lZCBieSBHaWxiZXJ0IFR1eWFtYmF6ZS4gUmV1c2UsIHJlc2FsZSwgb3IgcmVkaXN0cmlidXRpb24gd2l0"
    "aG91dCBwZXJtaXNzaW9uIGlzIG5vdCBhdXRob3JpemVkLiIsICJub3RpY2UiOiAiVGhpcyBtYXJrZXIgaXMgYW4gYXR0"
    "cmlidXRpb24gYW5kIG93bmVyc2hpcCByZWNvcmQgZW1iZWRkZWQgaW4gdGhlIGJhY2tlbmQgcnVudGltZS4iLCAiY29u"
    "dGFjdHMiOiB7ImVtYWlsIjogInR1eWFtYmF6ZWdpbGJlcnQwM0BnbWFpbC5jb20iLCAiZ2l0aHViIjogImdpdGh1Yi5j"
    "b20vR2lsYmVydCJ9LCAiZ2VuZXJhdGVkX2F0IjogIjIwMjYtMDQtMjQifQ=="
)

_cache: dict | None = None


def _decode_marker() -> dict:
    global _cache
    if _cache is None:
        decoded = base64.b64decode(_MARKER.encode("ascii")).decode("utf-8")
        _cache = json.loads(decoded)
    return _cache


class _OwnershipAccessor:
    def __repr__(self) -> str:
        return repr(_decode_marker())

    def __str__(self) -> str:
        return str(_decode_marker())

    def __getitem__(self, item):
        return _decode_marker()[item]

    def get(self, key, default=None):
        return _decode_marker().get(key, default)

    def as_dict(self) -> dict:
        return dict(_decode_marker())


def register_backend_ownership() -> None:
    if not hasattr(builtins, "gilbert"):
        builtins.gilbert = _OwnershipAccessor()


register_backend_ownership()


@router.get("", response_model=OwnershipRecord)
async def get_ownership_record():
    return _decode_marker()
