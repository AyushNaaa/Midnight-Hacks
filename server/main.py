"""ZK-Guard server — FastAPI entry point."""
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.ingest import router as ingest_router
from api.rest_ingest import router as rest_router
from api.dashboard_ws import router as dashboard_router
from api.simulation_control import router as sim_router

app = FastAPI(
    title="ZK-Guard",
    description="Server-side AI anticheat — zero invasion, privacy-proven on Midnight.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router)
app.include_router(rest_router)
app.include_router(dashboard_router)
app.include_router(sim_router)


@app.get("/")
async def root():
    return {"service": "ZK-Guard", "status": "running", "version": "0.1.0"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
