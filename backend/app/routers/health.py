from fastapi import APIRouter

from app.schemas import HealthRead

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthRead)
def health_check() -> HealthRead:
    return HealthRead(status="ok")
