import base64
import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional, Union

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials

from core.config import settings

logger = logging.getLogger(__name__)


class FirebaseAuthError(Exception):
    """Raised when Firebase authentication cannot be completed."""

    def __init__(self, message: str, error_type: str = "firebase_auth_error"):
        self.message = message
        self.error_type = error_type
        super().__init__(self.message)


def _normalize_private_key(private_key: str) -> str:
    return private_key.replace("\\n", "\n").strip()


def _get_backend_dir() -> Path:
    return Path(__file__).resolve().parent.parent


def _resolve_service_account_path(path_value: str) -> str:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        return str(path)

    return str((_get_backend_dir() / path).resolve())


def _decode_unverified_token_payload(id_token: str) -> Dict[str, Any]:
    """Decode the JWT payload without verifying the signature for diagnostics only."""
    try:
        parts = id_token.split(".")
        if len(parts) != 3:
            return {}
        payload = parts[1]
        padding = "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding)
        data = json.loads(decoded.decode("utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _discover_local_service_account_file() -> Optional[str]:
    backend_dir = _get_backend_dir()
    candidates = sorted(
        list(backend_dir.glob("*firebase-adminsdk*.json"))
        + list(backend_dir.glob("*service-account*.json"))
    )
    for candidate in candidates:
        if candidate.is_file():
            logger.info("Using detected Firebase service account file: %s", candidate)
            return str(candidate)
    return None


@lru_cache(maxsize=1)
def _build_credential_source() -> Optional[Union[str, Dict[str, Any]]]:
    """Build a Firebase credential source from environment configuration."""
    service_account_path = getattr(settings, "firebase_service_account_path", "").strip()
    service_account_json = getattr(settings, "firebase_service_account_json", "").strip()
    firebase_project_id = getattr(settings, "firebase_project_id", "").strip()
    firebase_client_email = getattr(settings, "firebase_client_email", "").strip()
    firebase_private_key = getattr(settings, "firebase_private_key", "").strip()

    if service_account_path:
        resolved_path = _resolve_service_account_path(service_account_path)
        if Path(resolved_path).is_file():
            return resolved_path
        logger.warning(
            "Configured FIREBASE_SERVICE_ACCOUNT_PATH was not found: %s. Falling back to auto-discovery.",
            resolved_path,
        )

    discovered_path = _discover_local_service_account_file()
    if discovered_path:
        return discovered_path

    if service_account_json:
        try:
            return json.loads(service_account_json)
        except json.JSONDecodeError as exc:
            raise FirebaseAuthError("Invalid Firebase service account JSON", "invalid_service_account_json") from exc

    if firebase_project_id and firebase_client_email and firebase_private_key:
        return {
            "type": "service_account",
            "project_id": firebase_project_id,
            "client_email": firebase_client_email,
            "private_key": _normalize_private_key(firebase_private_key),
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": (
                "https://www.googleapis.com/robot/v1/metadata/x509/"
                + firebase_client_email.replace("@", "%40")
            ),
        }

    return None


def _get_expected_firebase_project_id() -> str:
    configured_project_id = getattr(settings, "firebase_project_id", "").strip()
    if configured_project_id:
        return configured_project_id

    credential_source = _build_credential_source()
    if isinstance(credential_source, dict):
        return str(credential_source.get("project_id") or "").strip()

    if isinstance(credential_source, str):
        try:
            payload = json.loads(Path(credential_source).read_text(encoding="utf-8"))
            return str(payload.get("project_id") or "").strip()
        except Exception:
            return ""

    return ""


def _build_invalid_token_error(id_token: str, reason: str = "") -> FirebaseAuthError:
    payload = _decode_unverified_token_payload(id_token)
    token_project_id = str(payload.get("aud") or "").strip()
    issuer = str(payload.get("iss") or "").strip()
    expected_project_id = _get_expected_firebase_project_id()

    if expected_project_id and token_project_id and token_project_id != expected_project_id:
        return FirebaseAuthError(
            (
                "Firebase token project mismatch. "
                f"Frontend token project is '{token_project_id}', but backend expects '{expected_project_id}'. "
                "Update the frontend and backend Firebase configuration so both use the same project."
            ),
            "project_mismatch",
        )

    expected_issuer = f"https://securetoken.google.com/{expected_project_id}" if expected_project_id else ""
    if expected_issuer and issuer and issuer != expected_issuer:
        return FirebaseAuthError(
            (
                "Firebase token issuer mismatch. "
                f"Frontend token issuer is '{issuer}', but backend expects '{expected_issuer}'. "
                "Update the frontend and backend Firebase configuration so both use the same project."
            ),
            "project_mismatch",
        )

    if token_project_id:
        message = (
            f"Invalid Firebase token for project '{token_project_id}'. "
            "Sign out and sign in again. If the error persists, check that the frontend and backend Firebase "
            "configuration both use the same project."
        )
    else:
        message = (
            "Invalid Firebase token. Sign out and sign in again. "
            "If the error persists, check that the frontend and backend Firebase configuration both use the same project."
        )

    if settings.debug and reason:
        message = f"{message} [Firebase Admin reason: {reason}]"

    return FirebaseAuthError(message, "invalid_token")


def get_firebase_app():
    """Return the singleton Firebase app, creating it on first use."""
    try:
        return firebase_admin.get_app()
    except ValueError:
        credential_source = _build_credential_source()
        if not credential_source:
            raise FirebaseAuthError(
                "Firebase authentication is not configured",
                "not_configured",
            )

        try:
            credential = credentials.Certificate(credential_source)
            logger.info("Initializing Firebase Admin SDK")
            return firebase_admin.initialize_app(credential)
        except FileNotFoundError as exc:
            raise FirebaseAuthError(
                "Firebase service account file was not found",
                "missing_service_account_file",
            ) from exc
        except ValueError as exc:
            if isinstance(credential_source, str):
                message = (
                    "Firebase service account file is invalid. "
                    "Set FIREBASE_SERVICE_ACCOUNT_PATH to the downloaded Firebase service-account JSON file."
                )
            else:
                message = (
                    "Firebase service account JSON is invalid or incomplete. "
                    "Use FIREBASE_SERVICE_ACCOUNT_PATH with the downloaded Firebase service-account JSON file."
                )
            raise FirebaseAuthError(
                message,
                "invalid_service_account",
            ) from exc


def verify_firebase_id_token(id_token: str) -> Dict[str, Any]:
    """Validate a Firebase ID token and return its decoded claims."""
    try:
        get_firebase_app()
    except FirebaseAuthError:
        raise
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.exception("Unexpected error while initializing Firebase Admin SDK")
        raise FirebaseAuthError("Unable to initialize Firebase authentication", "initialization_failed") from exc

    try:
        return firebase_auth.verify_id_token(id_token, check_revoked=True)
    except firebase_auth.ExpiredIdTokenError as exc:
        raise FirebaseAuthError("Firebase token has expired", "token_expired") from exc
    except firebase_auth.RevokedIdTokenError as exc:
        raise FirebaseAuthError("Firebase token has been revoked", "token_revoked") from exc
    except firebase_auth.InvalidIdTokenError as exc:
        logger.warning("Firebase Admin rejected ID token: %s", exc)
        raise _build_invalid_token_error(id_token, str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.exception("Unexpected error while verifying Firebase token")
        raise FirebaseAuthError("Unable to verify Firebase token", "verification_failed") from exc
