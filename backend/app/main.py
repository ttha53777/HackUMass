"""FastAPI entry point: `uvicorn app.main:app --port 8000 --env-file .env`."""

from fastapi import FastAPI

from app.api.routes import router

app = FastAPI(title="Community Resource Navigator API", version="0.1.0")
app.include_router(router)
