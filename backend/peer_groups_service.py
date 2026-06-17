"""Saved peer group CRUD with PostgreSQL and dev in-memory fallback."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import Session

from config import get_settings
from database import SavedPeerGroup

settings = get_settings()

DEV_PEER_ORG_ID = "00000000-0000-0000-0000-000000000001"

# org_id -> list[{id, group_name, tickers_list}]
_DEV_STORE: dict[str, list[dict[str, Any]]] = {}


class DevPeerOrganization:
    """Synthetic org for anonymous dev Pro QA (peer groups only)."""

    id = DEV_PEER_ORG_ID
    subscription_tier = "professional"


def is_dev_peer_org(org_id: str | None) -> bool:
    return org_id == DEV_PEER_ORG_ID


def _normalize_tickers(tickers: list[str]) -> list[str]:
    return [t.strip().upper() for t in tickers if t and t.strip()]


def _dev_list(org_id: str) -> list[SavedPeerGroupResponseDict]:
    return list(_DEV_STORE.get(org_id, []))


def _to_response(row: dict[str, Any] | SavedPeerGroup) -> dict[str, Any]:
    if isinstance(row, SavedPeerGroup):
        return {
            "id": row.id,
            "group_name": row.group_name,
            "tickers_list": row.tickers_list or [],
        }
    return {
        "id": row["id"],
        "group_name": row["group_name"],
        "tickers_list": row.get("tickers_list") or [],
    }


SavedPeerGroupResponseDict = dict[str, Any]


def list_peer_groups_for_org(db: Session, org_id: str) -> list[dict[str, Any]]:
    if is_dev_peer_org(org_id):
        return [_to_response(row) for row in _dev_list(org_id)]

    try:
        db.info["current_org_id"] = org_id
        groups = (
            db.query(SavedPeerGroup)
            .filter(SavedPeerGroup.organization_id == org_id)
            .order_by(SavedPeerGroup.created_at.desc())
            .all()
        )
        return [_to_response(g) for g in groups]
    except OperationalError as exc:
        if settings.allow_dev_tier_toggle:
            return [_to_response(row) for row in _dev_list(org_id)]
        raise HTTPException(
            status_code=503,
            detail={
                "code": "DATABASE_UNAVAILABLE",
                "message": "PostgreSQL is not running. Start it with docker compose up -d.",
            },
        ) from exc


def create_peer_group_for_org(
    db: Session,
    org_id: str,
    group_name: str,
    tickers: list[str],
) -> dict[str, Any]:
    name = group_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required.")
    tickers_list = _normalize_tickers(tickers)
    if len(tickers_list) < 2:
        raise HTTPException(status_code=400, detail="At least two tickers are required.")

    row = {
        "id": str(uuid4()),
        "group_name": name,
        "tickers_list": tickers_list,
    }

    if is_dev_peer_org(org_id):
        store = _DEV_STORE.setdefault(org_id, [])
        store.insert(0, row)
        return _to_response(row)

    try:
        db.info["current_org_id"] = org_id
        group = SavedPeerGroup(
            organization_id=org_id,
            group_name=name,
            tickers_list=tickers_list,
        )
        db.add(group)
        db.commit()
        db.refresh(group)
        return _to_response(group)
    except OperationalError as exc:
        db.rollback()
        if settings.allow_dev_tier_toggle:
            store = _DEV_STORE.setdefault(org_id, [])
            store.insert(0, row)
            return _to_response(row)
        raise HTTPException(
            status_code=503,
            detail={
                "code": "DATABASE_UNAVAILABLE",
                "message": "PostgreSQL is not running. Start it with docker compose up -d.",
            },
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not save peer group.") from exc


def delete_peer_group_for_org(db: Session, org_id: str, group_id: str) -> None:
    if is_dev_peer_org(org_id):
        store = _DEV_STORE.get(org_id, [])
        next_store = [g for g in store if g["id"] != group_id]
        if len(next_store) == len(store):
            raise HTTPException(status_code=404, detail="Peer group not found")
        _DEV_STORE[org_id] = next_store
        return

    try:
        db.info["current_org_id"] = org_id
        group = (
            db.query(SavedPeerGroup)
            .filter(
                SavedPeerGroup.id == group_id,
                SavedPeerGroup.organization_id == org_id,
            )
            .first()
        )
        if not group:
            raise HTTPException(status_code=404, detail="Peer group not found")
        db.delete(group)
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if settings.allow_dev_tier_toggle:
            store = _DEV_STORE.get(org_id, [])
            next_store = [g for g in store if g["id"] != group_id]
            if len(next_store) == len(store):
                raise HTTPException(status_code=404, detail="Peer group not found") from exc
            _DEV_STORE[org_id] = next_store
            return
        raise HTTPException(
            status_code=503,
            detail={
                "code": "DATABASE_UNAVAILABLE",
                "message": "PostgreSQL is not running. Start it with docker compose up -d.",
            },
        ) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Could not delete peer group.") from exc


def clear_dev_store() -> None:
    """Test helper."""
    _DEV_STORE.clear()
