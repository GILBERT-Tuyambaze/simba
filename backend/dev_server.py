from pathlib import Path

from dotenv import load_dotenv


backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env", override=False)

from core.config import settings  # noqa: E402
import uvicorn  # noqa: E402


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=int(settings.port),
        reload=True,
        reload_dirs=[str(backend_dir)],
        app_dir=str(backend_dir),
    )
