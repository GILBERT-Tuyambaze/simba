from pathlib import Path
import platform

from dotenv import load_dotenv


backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env", override=False)

from core.config import settings  # noqa: E402
import uvicorn  # noqa: E402


if __name__ == "__main__":
    enable_reload = platform.system() != "Windows"
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=int(settings.port),
        reload=enable_reload,
        reload_dirs=[str(backend_dir)] if enable_reload else None,
        app_dir=str(backend_dir),
    )
