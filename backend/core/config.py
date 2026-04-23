import logging
import os
from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load local backend environment variables before Settings is instantiated so
# required values like DATABASE_URL are available during app startup.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)


class Settings(BaseSettings):
    # Application
    app_name: str = "FastAPI Modular Template"
    debug: bool = False
    version: str = "1.0.0"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Application services
    database_url: str = ""
    frontend_url: str = "http://localhost:3000"
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60

    # Firebase auth
    firebase_project_id: str = ""
    firebase_service_account_path: str = ""
    firebase_service_account_json: str = ""
    firebase_client_email: str = ""
    firebase_private_key: str = ""
    admin_user_id: str = ""
    admin_user_email: str = ""
    stripe_secret_key: str = ""
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    app_ai_base_url: str = ""
    app_ai_key: str = ""
    oss_service_url: str = ""
    oss_api_key: str = ""

    # AWS Lambda Configuration
    is_lambda: bool = False
    lambda_function_name: str = "fastapi-backend"
    aws_region: str = "us-east-1"

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug_value(cls, value: Any) -> bool:
        """Accept common deployment-style debug values."""
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug", "development", "dev"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "production", "prod"}:
                return False
        return bool(value)

    @property
    def backend_url(self) -> str:
        """Generate backend URL from host and port."""
        if self.is_lambda:
            # In Lambda environment, return the API Gateway URL
            return os.environ.get(
                "PYTHON_BACKEND_URL", f"https://{self.lambda_function_name}.execute-api.{self.aws_region}.amazonaws.com"
            )
        else:
            # Use localhost for external callbacks instead of 0.0.0.0
            display_host = "127.0.0.1" if self.host == "0.0.0.0" else self.host
            return os.environ.get("PYTHON_BACKEND_URL", f"http://{display_host}:{self.port}")

    class Config:
        case_sensitive = False
        extra = "ignore"

    def __getattr__(self, name: str) -> Any:
        """
        Dynamically read attributes from environment variables.
        For example: settings.opapi_key reads from OPAPI_KEY environment variable.

        Args:
            name: Attribute name (e.g., 'opapi_key')

        Returns:
            Value from environment variable

        Raises:
            AttributeError: If attribute doesn't exist and not found in environment variables
        """
        # Convert attribute name to environment variable name (snake_case -> UPPER_CASE)
        env_var_name = name.upper()

        # Check if environment variable exists
        if env_var_name in os.environ:
            value = os.environ[env_var_name]
            # Cache the value in instance dict to avoid repeated lookups
            self.__dict__[name] = value
            logger.debug(f"Read dynamic attribute {name} from environment variable {env_var_name}")
            return value

        # If not found, raise AttributeError to maintain normal Python behavior
        raise AttributeError(f"'{self.__class__.__name__}' object has no attribute '{name}'")


# Global settings instance
settings = Settings()
