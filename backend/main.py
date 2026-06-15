"""FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from typing import Annotated, Literal, Optional

from billing.stripe_routes import router as billing_router
from config import get_settings
from database import SavedPeerGroup, get_db, init_db
from sqlalchemy.orm import Session
from middleware import AuthContext, check_parse_access, get_auth_context, require_auth
from filing_parser import ParseRequest, ParseResponse, SectionHtmlResponse, get_section_html, parse_filings, parse_filings_stream
from sec.client import fetch_ticker_map
from sec.xbrl_client import fetch_ticker_financials

settings = get_settings()


class GZipExceptStreamMiddleware:
    """GZip responses except NDJSON streaming (compression buffers the whole stream)."""

    def __init__(self, app: ASGIApp, minimum_size: int = 1000) -> None:
        self.app = app
        self.gzip = GZipMiddleware(app, minimum_size=minimum_size)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("path") == "/parse/stream":
            await self.app(scope, receive, send)
            return
        await self.gzip(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
    except Exception as exc:
        print(f"[WARN] Database not available: {exc}")
        print("[WARN] SEC parsing will work; auth/billing need PostgreSQL.")
    try:
        await fetch_ticker_map()
    except Exception as exc:
        print(f"[WARN] Ticker map pre-warm failed: {exc}")
    yield
    from sec.client import close_http_client
    await close_http_client()


app = FastAPI(
    title="FilingGrid API",
    description="Stateless SEC filing comparison backend",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(GZipExceptStreamMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(billing_router)


@app.post("/webhooks/stripe")
async def stripe_webhook_root(request: Request, db: Session = Depends(get_db)):
    """Top-level webhook endpoint for Stripe Dashboard configuration."""
    from billing.stripe_routes import stripe_webhook
    return await stripe_webhook(request, db)


class AuthMeResponse(BaseModel):
    email: Optional[str] = None
    tier: str = "free"
    is_authenticated: bool = False
    limits: dict
    organization_id: Optional[str] = None


class TickerSearchResult(BaseModel):
    ticker: str
    company_name: str


class SavedPeerGroupRequest(BaseModel):
    group_name: str
    tickers_list: list[str]


class SavedPeerGroupResponse(BaseModel):
    id: str
    group_name: str
    tickers_list: list[str]


@app.get("/health")
async def health():
    return {"status": "ok", "service": "filinggrid-api"}


@app.get("/auth/me", response_model=AuthMeResponse)
async def auth_me(auth: Annotated[AuthContext, Depends(get_auth_context)]):
    return AuthMeResponse(
        email=auth.user.email if auth.user else None,
        tier=auth.tier,
        is_authenticated=auth.is_authenticated,
        limits=auth.limits,
        organization_id=auth.organization.id if auth.organization else None,
    )


@app.get("/tickers/search")
async def search_tickers(q: str = "", limit: int = 10):
    ticker_map = await fetch_ticker_map()
    q = q.upper().strip()
    results = []
    for ticker, info in ticker_map.items():
        if q and q not in ticker and q not in info["title"].upper():
            continue
        results.append(TickerSearchResult(ticker=ticker, company_name=info["title"]))
        if len(results) >= limit:
            break
    results.sort(key=lambda r: (not r.ticker.startswith(q), r.ticker))
    return results[:limit]


@app.post("/parse", response_model=ParseResponse)
async def parse_endpoint(
    request: ParseRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
):
    check_parse_access(auth, len(request.tickers), request.fiscal_year)
    return await parse_filings(request)


@app.post("/parse/stream")
async def parse_stream_endpoint(
    request: ParseRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
):
    check_parse_access(auth, len(request.tickers), request.fiscal_year)

    async def event_stream():
        async for line in parse_filings_stream(request):
            yield line

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/filings/{ticker}/financials")
async def filing_financials_endpoint(
    ticker: str,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    fiscal_year: int | None = Query(None),
):
    check_parse_access(auth, 1, fiscal_year)
    return await fetch_ticker_financials(ticker, fiscal_year=fiscal_year)


@app.get("/parse/section", response_model=SectionHtmlResponse)
async def parse_section_endpoint(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    ticker: str = Query(..., min_length=1, max_length=10),
    section_id: str = Query(..., min_length=1, max_length=64),
    fiscal_year: int | None = Query(None),
    format: Literal["html", "text"] = Query("html", alias="format"),
):
    check_parse_access(auth, 1, fiscal_year)
    try:
        return await get_section_html(ticker, section_id, fiscal_year, content_format=format)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/peer-groups", response_model=list[SavedPeerGroupResponse])
async def list_peer_groups(
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: Session = Depends(get_db),
):
    from middleware import check_professional_access

    check_professional_access(auth)
    db.info["current_org_id"] = auth.organization.id
    groups = db.query(SavedPeerGroup).filter(
        SavedPeerGroup.organization_id == auth.organization.id
    ).all()
    return [
        SavedPeerGroupResponse(id=g.id, group_name=g.group_name, tickers_list=g.tickers_list or [])
        for g in groups
    ]


@app.post("/peer-groups", response_model=SavedPeerGroupResponse)
async def create_peer_group(
    body: SavedPeerGroupRequest,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: Session = Depends(get_db),
):
    from middleware import check_professional_access

    check_professional_access(auth)
    db.info["current_org_id"] = auth.organization.id
    group = SavedPeerGroup(
        organization_id=auth.organization.id,
        group_name=body.group_name,
        tickers_list=[t.upper() for t in body.tickers_list],
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return SavedPeerGroupResponse(
        id=group.id, group_name=group.group_name, tickers_list=group.tickers_list
    )


@app.delete("/peer-groups/{group_id}")
async def delete_peer_group(
    group_id: str,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: Session = Depends(get_db),
):
    from middleware import check_professional_access

    check_professional_access(auth)
    db.info["current_org_id"] = auth.organization.id
    group = db.query(SavedPeerGroup).filter(
        SavedPeerGroup.id == group_id,
        SavedPeerGroup.organization_id == auth.organization.id,
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Peer group not found")
    db.delete(group)
    db.commit()
    return {"status": "deleted"}
