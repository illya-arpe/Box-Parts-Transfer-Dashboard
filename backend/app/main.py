from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.models import ReplenishmentRow, Sku, Snapshot, Warehouse  # noqa: F401
from app.routers.health import router as health_router
from app.routers.snapshots import router as snapshots_router
from app.routers.skus import router as skus_router

app = FastAPI(title="Yellow Box Replenishment API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(snapshots_router)
app.include_router(skus_router)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
