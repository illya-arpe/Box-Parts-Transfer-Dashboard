from fastapi import FastAPI

from app.database import Base, engine
from app.models import ReplenishmentRow, Sku, Snapshot, Warehouse  # noqa: F401
from app.routers.health import router as health_router

app = FastAPI(title="Yellow Box Replenishment API", version="0.1.0")
app.include_router(health_router)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
