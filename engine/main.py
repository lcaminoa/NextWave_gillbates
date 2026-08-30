"""FastAPI entrypoint for the frozen Control Tower backend routes."""

from __future__ import annotations

import asyncio
import os
import secrets
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from contracts.schemas import ChaosSpec, IncidentReport
from engine.api import (
    ChaosRandomRequest,
    ChaosRevealRequest,
    ControlTowerService,
    IncidentDetail,
)
from engine.api.models import HealthResponse
from engine.investigator import run_audited_openai_investigation
from engine.investigator.memory import SQLiteIncidentMemory
from engine.investigator.openai_config import (
    DEFAULT_OPENAI_REQUEST_TIMEOUT_SECONDS,
    validate_request_timeout,
)


def _runtime_from_environment() -> ControlTowerService:
    # Tests and one-off local runs use ephemeral memory.  The checked-in .env.example opts
    # into a project-local SQLite file so the demo remembers recovered incidents across restarts.
    memory_path = os.getenv("CONTROL_TOWER_MEMORY_DB", ":memory:").strip() or ":memory:"
    incident_memory = SQLiteIncidentMemory(memory_path)
    mode = os.getenv("CONTROL_TOWER_INVESTIGATOR_MODE", "deterministic").strip().lower()
    if mode == "deterministic":
        return ControlTowerService(incident_memory=incident_memory)
    if mode != "audited_openai":
        raise RuntimeError(
            "CONTROL_TOWER_INVESTIGATOR_MODE must be deterministic or audited_openai"
        )

    model = os.getenv("OPENAI_MODEL", "").strip()
    if not model:
        raise RuntimeError("audited_openai mode requires OPENAI_MODEL")
    if not os.getenv("OPENAI_API_KEY", "").strip():
        raise RuntimeError("audited_openai mode requires OPENAI_API_KEY")
    auditor_model = os.getenv("OPENAI_AUDITOR_MODEL", "").strip() or model
    raw_timeout = os.getenv(
        "OPENAI_REQUEST_TIMEOUT_SECONDS",
        str(DEFAULT_OPENAI_REQUEST_TIMEOUT_SECONDS),
    )
    try:
        request_timeout_seconds = validate_request_timeout(float(raw_timeout))
    except ValueError as exc:
        raise RuntimeError(
            "OPENAI_REQUEST_TIMEOUT_SECONDS must be a positive number"
        ) from exc

    def audited_investigator(anomaly, candidates, evidence):
        return run_audited_openai_investigation(
            anomaly,
            tuple(candidates),
            tuple(evidence),
            model=model,
            auditor_model=auditor_model,
            request_timeout_seconds=request_timeout_seconds,
        )

    return ControlTowerService(
        audited_investigator=audited_investigator,
        incident_memory=incident_memory,
    )


def _sse_transaction(transaction_json: str, transaction_id: str) -> str:
    return f"id: {transaction_id}\nevent: transaction\ndata: {transaction_json}\n\n"


def create_app(
    service: ControlTowerService | None = None,
    *,
    start_background: bool = True,
    judge_token: str | None = None,
    public_mode: bool | None = None,
) -> FastAPI:
    runtime = service or _runtime_from_environment()
    configured_token = judge_token if judge_token is not None else os.getenv(
        "CONTROL_TOWER_JUDGE_TOKEN"
    )
    required_judge_token = configured_token.strip() if configured_token else None
    is_public = public_mode if public_mode is not None else os.getenv(
        "CONTROL_TOWER_PUBLIC_MODE", "false"
    ).lower() in {"1", "true", "yes"}
    if is_public and (
        required_judge_token is None or len(required_judge_token) < 16
    ):
        raise RuntimeError(
            "public mode requires CONTROL_TOWER_JUDGE_TOKEN with at least 16 characters"
        )

    async def require_judge_access(
        supplied_token: str | None = Header(
            default=None,
            alias="X-Control-Tower-Judge-Key",
        ),
    ) -> None:
        if required_judge_token is not None and not secrets.compare_digest(
            supplied_token or "",
            required_judge_token,
        ):
            raise HTTPException(status_code=403, detail="judge access required")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if start_background:
            await runtime.start()
        try:
            yield
        finally:
            if start_background:
                await runtime.stop()

    application = FastAPI(title="Control Tower API", lifespan=lifespan)
    application.state.control_tower = runtime

    @application.get("/api/health", response_model=HealthResponse)
    async def health(response: Response) -> HealthResponse:
        if runtime.health_status != "ok":
            response.status_code = 503
        return HealthResponse(status=runtime.health_status)

    @application.get("/api/stream")
    async def stream(
        request: Request,
        last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    ) -> StreamingResponse:
        async def events() -> AsyncIterator[str]:
            queue = runtime.broker.subscribe(after_transaction_id=last_event_id)
            try:
                while True:
                    if await request.is_disconnected():
                        return
                    try:
                        transaction = await asyncio.wait_for(queue.get(), timeout=15.0)
                    except asyncio.TimeoutError:
                        yield ": keepalive\n\n"
                        continue
                    if transaction is None:
                        return
                    yield _sse_transaction(
                        transaction.model_dump_json(exclude_none=True),
                        transaction.transaction_id,
                    )
            finally:
                runtime.broker.unsubscribe(queue)

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    @application.get("/api/incidents", response_model=list[IncidentReport])
    async def incidents() -> list[IncidentReport]:
        return runtime.list_reports()

    @application.get("/api/incidents/{incident_id}", response_model=IncidentDetail)
    async def incident_detail(incident_id: str) -> IncidentDetail:
        detail = runtime.get_incident(incident_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="incident not found")
        return detail

    @application.post(
        "/api/chaos/inject",
        response_model=ChaosSpec,
        dependencies=[Depends(require_judge_access)],
    )
    async def inject_chaos(spec: ChaosSpec) -> ChaosSpec:
        try:
            return runtime.inject_manual(spec)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @application.post(
        "/api/chaos/random",
        response_model=ChaosSpec,
        dependencies=[Depends(require_judge_access)],
    )
    async def random_chaos(payload: ChaosRandomRequest) -> ChaosSpec:
        try:
            return runtime.inject_random(
                severity_pp=payload.severity_pp,
                duration_minutes=payload.duration_minutes,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @application.post(
        "/api/chaos/reveal",
        response_model=ChaosSpec,
        dependencies=[Depends(require_judge_access)],
    )
    async def reveal_chaos(payload: ChaosRevealRequest | None = None) -> ChaosSpec:
        revealed = runtime.reveal_chaos(payload.chaos_id if payload else None)
        if revealed is None:
            raise HTTPException(status_code=404, detail="chaos not found")
        return revealed

    return application


app = create_app()
