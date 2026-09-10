"""Domain events, notifications, and a live SSE stream.

Every important mutation in the loan lifecycle calls emit()/audit()/notify()
here, so the UI, the graph engine and the audit trail all read the same
backend truth. Nothing here fabricates state — the stream only replays rows.
"""
from __future__ import annotations

import json
import time
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/ls", tags=["events"])

_DB = None
_RESOLVE = lambda auth: None  # noqa: E731


def configure(db_factory, session_resolver):
    global _DB, _RESOLVE
    _DB = db_factory
    _RESOLVE = session_resolver


def now() -> str:
    return datetime.utcnow().isoformat()


# ── writers (called by other backend modules inside their transactions) ──

def emit(conn, type: str, entity: str, entity_id, actor: str = "", data: dict | None = None) -> int:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO ls_events (type,entity,entity_id,actor,data,created_at) VALUES (?,?,?,?,?,?)",
        (type, entity, str(entity_id), actor, json.dumps(data or {}), now()))
    return cur.lastrowid


def audit(conn, borrower_id: str, analysis_id, actor: str, action: str, detail) -> int:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO ls_audit (borrower_id,analysis_id,actor,action,detail,created_at) VALUES (?,?,?,?,?,?)",
        (borrower_id, analysis_id, actor, action,
         detail if isinstance(detail, str) else json.dumps(detail), now()))
    return cur.lastrowid


def notify(conn, audience: str, kind: str, title: str, body: str = "", link: str = "") -> int:
    """audience is a session token or 'role:<role>' broadcast."""
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO ls_notifications (audience,kind,title,body,link,created_at) VALUES (?,?,?,?,?,?)",
        (audience, kind, title, body, link, now()))
    return cur.lastrowid


def _session_of(authorization: Optional[str]) -> dict:
    s = _RESOLVE(authorization) if authorization else None
    if not s:
        raise HTTPException(401, "Sign in required")
    return s


def _audiences(token: str, role: str) -> list[str]:
    return [token, f"role:{role}"]


# ── notifications API ──

@router.get("/notifications")
def list_notifications(authorization: Optional[str] = Header(default=None), limit: int = 50):
    s = _session_of(authorization)
    conn = _DB()
    try:
        rows = conn.execute(
            "SELECT * FROM ls_notifications WHERE audience=? OR audience=? OR audience='role:all' ORDER BY id DESC LIMIT ?",
            (s["token"], f"role:{s.get('role', 'guest')}", min(limit, 100)),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@router.get("/notifications/unread-count")
def unread_count(authorization: Optional[str] = Header(default=None)):
    s = _session_of(authorization)
    conn = _DB()
    try:
        n = conn.execute(
            "SELECT COUNT(*) c FROM ls_notifications WHERE is_read=0 AND (audience=? OR audience=? OR audience='role:all')",
            (s["token"], f"role:{s.get('role', 'guest')}")).fetchone()["c"]
        latest = conn.execute(
            "SELECT MAX(id) m FROM ls_notifications WHERE audience=? OR audience=? OR audience='role:all'",
            (s["token"], f"role:{s.get('role', 'guest')}")).fetchone()["m"]
        return {"unread": n, "latest_id": latest or 0}
    finally:
        conn.close()


@router.post("/notifications/{nid}/read")
def mark_read(nid: int, authorization: Optional[str] = Header(default=None)):
    s = _session_of(authorization)
    conn = _DB()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE ls_notifications SET is_read=1 WHERE id=? AND (audience=? OR audience=? OR audience='role:all')",
            (nid, s["token"], f"role:{s.get('role', 'guest')}"))
        if cur.rowcount == 0:
            raise HTTPException(404, "Notification not found")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()


@router.get("/events")
def list_events(entity: str = "", entity_id: str = "", limit: int = 100,
                authorization: Optional[str] = Header(default=None)):
    _session_of(authorization)
    conn = _DB()
    try:
        q = "SELECT * FROM ls_events WHERE 1=1"
        params: list = []
        if entity:
            q += " AND entity=?"
            params.append(entity)
        if entity_id:
            q += " AND entity_id=?"
            params.append(str(entity_id))
        q += " ORDER BY id DESC LIMIT ?"
        params.append(min(limit, 200))
        return [dict(r) for r in conn.execute(q, params).fetchall()]
    finally:
        conn.close()


# ── live stream (SSE). Token never goes in the URL: mint a 60s ticket first. ──

_TICKETS: dict[str, tuple[str, str, float]] = {}


@router.post("/events/ticket")
def stream_ticket(authorization: Optional[str] = Header(default=None)):
    s = _session_of(authorization)
    t = uuid.uuid4().hex
    _TICKETS[t] = (s["token"], s.get("role", "guest"), time.time() + 60)
    return {"ticket": t}


@router.get("/events/stream")
def stream(ticket: str = Query("")):
    rec = _TICKETS.pop(ticket, None)
    if not rec or rec[2] < time.time():
        raise HTTPException(401, "Invalid or expired ticket")
    token, role = rec[0], rec[1]

    def gen():
        last_id = 0
        start = time.time()
        yield ": connected\n\n"
        try:
            while time.time() - start < 105:
                conn = _DB()
                try:
                    rows = conn.execute(
                        "SELECT id, kind, title, body, link, created_at FROM ls_notifications "
                        "WHERE id>? AND (audience=? OR audience=? OR audience='role:all') ORDER BY id",
                        (last_id, token, f"role:{role}")).fetchall()
                finally:
                    conn.close()
                for r in rows:
                    last_id = max(last_id, r["id"])
                    yield f"data: {json.dumps(dict(r))}\n\n"
                yield ": ping\n\n"
                time.sleep(4)
        except GeneratorExit:
            pass

    return StreamingResponse(gen(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive",
    })
