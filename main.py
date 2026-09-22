"""
Digital Bridge -- Interactive Auditorium Seating Application.
Main FastAPI application with all routes and API endpoints.

Guest-centric model: QR codes are tied to guests (permanent tokens),
not to seats. Moving a guest between seats does not change their QR.
"""

import io
import base64
import uuid

import qrcode
from fastapi import FastAPI, Request, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session, joinedload
from openpyxl import load_workbook

from database import get_db, init_db, HALL_CONFIG
from models import Seat, Guest
from auth import (
    verify_credentials, create_session_token, verify_session,
    require_admin, SESSION_COOKIE_NAME,
)

app = FastAPI(title="Digital Bridge")

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
def on_startup():
    init_db()


# ---------------------------------------------------------------------------
# Helper: generate QR code as base64 PNG
# ---------------------------------------------------------------------------

def generate_qr_base64(data: str, box_size: int = 6) -> str:
    """Generate a QR code PNG and return it as a base64-encoded data URI."""
    qr = qrcode.QRCode(version=1, box_size=box_size, border=2)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    encoded = base64.b64encode(buffer.read()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


# ---------------------------------------------------------------------------
# Public pages
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Main page -- interactive hall layout."""
    return templates.TemplateResponse("index.html", {
        "request": request,
        "hall_config": HALL_CONFIG,
    })


@app.get("/guest/{token}", response_class=HTMLResponse)
async def guest_page(token: str, request: Request, db: Session = Depends(get_db)):
    """Personal guest page opened after QR scan -- shows current seat navigation."""
    guest = db.query(Guest).filter(Guest.token == token).first()
    if not guest:
        raise HTTPException(status_code=404, detail="Guest not found")

    # Find the seat currently assigned to this guest
    seat = db.query(Seat).filter(Seat.guest_id == guest.id).first()

    base_url = str(request.base_url).rstrip("/")
    qr_url = f"{base_url}/guest/{guest.token}"
    qr_image = generate_qr_base64(qr_url)

    if not seat:
        # Guest exists but has no seat assigned yet
        return templates.TemplateResponse("seat.html", {
            "request": request,
            "guest": guest.to_dict(),
            "seat": None,
            "entrance": None,
            "nav_text": "Your seat has not been assigned yet. Please contact the administrator.",
            "qr_image": qr_image,
            "hall_config": HALL_CONFIG,
        })

    # Determine nearest entrance
    entrance_map = {"left": "A", "center": "B", "right": "V"}
    entrance = entrance_map.get(seat.sector, "B")

    # Build navigation instructions
    direction_hints = {
        "left": "turn left",
        "center": "go straight",
        "right": "turn right",
    }

    if seat.row <= 10:
        row_hint = f"Walk forward to row {seat.row}."
    else:
        row_hint = f"Your row {seat.row} is in the back section."

    nav_text = (
        f"Enter through Entrance {entrance}, "
        f"{direction_hints[seat.sector]} to the {seat.sector_label} sector. "
        f"{row_hint} "
        f"Your seat is {seat.number}."
    )

    return templates.TemplateResponse("seat.html", {
        "request": request,
        "guest": guest.to_dict(),
        "seat": seat.to_dict(),
        "entrance": entrance,
        "nav_text": nav_text,
        "qr_image": qr_image,
        "hall_config": HALL_CONFIG,
    })


# Keep old /seat/{token} route as a fallback redirect
@app.get("/seat/{token}", response_class=HTMLResponse)
async def seat_page_redirect(token: str):
    """Legacy redirect -- old seat-based QR codes."""
    return RedirectResponse(url=f"/guest/{token}", status_code=302)


# ---------------------------------------------------------------------------
# API -- Public
# ---------------------------------------------------------------------------

@app.get("/api/seats")
async def api_seats(db: Session = Depends(get_db)):
    """Return all seats as JSON."""
    seats = (
        db.query(Seat)
        .options(joinedload(Seat.guest))
        .order_by(Seat.sector, Seat.row, Seat.number)
        .all()
    )
    return [s.to_dict() for s in seats]


@app.get("/api/seat/{seat_id}")
async def api_seat(seat_id: int, request: Request, db: Session = Depends(get_db)):
    """Return info about a specific seat including guest QR code if assigned."""
    seat = db.query(Seat).options(joinedload(Seat.guest)).filter(Seat.id == seat_id).first()
    if not seat:
        raise HTTPException(status_code=404, detail="Seat not found")

    data = seat.to_dict()

    base_url = str(request.base_url).rstrip("/")

    if seat.guest:
        qr_url = f"{base_url}/guest/{seat.guest.token}"
        data["qr_image"] = generate_qr_base64(qr_url)
        data["qr_url"] = qr_url
    else:
        data["qr_image"] = None
        data["qr_url"] = None

    return data


@app.get("/api/hall-config")
async def api_hall_config():
    """Return hall configuration."""
    return HALL_CONFIG


# ---------------------------------------------------------------------------
# Admin -- Authentication
# ---------------------------------------------------------------------------

@app.get("/admin/login", response_class=HTMLResponse)
async def admin_login_page(request: Request):
    """Show admin login form."""
    if verify_session(request):
        return RedirectResponse(url="/admin", status_code=302)
    return templates.TemplateResponse("admin_login.html", {"request": request, "error": None})


@app.post("/admin/login")
async def admin_login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
):
    """Process admin login."""
    if verify_credentials(username, password):
        response = RedirectResponse(url="/admin", status_code=302)
        token = create_session_token(username)
        response.set_cookie(SESSION_COOKIE_NAME, token, httponly=True, max_age=86400)
        return response
    return templates.TemplateResponse("admin_login.html", {
        "request": request,
        "error": "Invalid credentials",
    })


@app.get("/admin/logout")
async def admin_logout():
    """Logout admin."""
    response = RedirectResponse(url="/", status_code=302)
    response.delete_cookie(SESSION_COOKIE_NAME)
    return response


# ---------------------------------------------------------------------------
# Admin -- Panel
# ---------------------------------------------------------------------------

@app.get("/admin", response_class=HTMLResponse)
async def admin_panel(request: Request, db: Session = Depends(get_db)):
    """Admin panel page."""
    if not verify_session(request):
        return RedirectResponse(url="/admin/login", status_code=302)

    total_seats = db.query(Seat).count()
    occupied = db.query(Seat).filter(Seat.guest_id.isnot(None)).count()
    total_guests = db.query(Guest).count()

    return templates.TemplateResponse("admin.html", {
        "request": request,
        "total_seats": total_seats,
        "occupied_seats": occupied,
        "total_guests": total_guests,
        "hall_config": HALL_CONFIG,
    })


# ---------------------------------------------------------------------------
# Admin -- API
# ---------------------------------------------------------------------------

HEADER_SKIP = {
    "fio", "name", "guest", "список", "гости", "гость", "участник",
    "фио", "имя", "ф.и.о.", "ф.и.о", "фамилия",
}


@app.post("/admin/upload")
async def admin_upload_excel(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload Excel file and auto-assign guests to seats.

    For each name in the file:
    - If a Guest with the same name already exists, reuse that record
      (preserving their permanent token / QR).
    - Otherwise create a new Guest with a fresh UUID token.
    Then clear all seat assignments and redistribute.
    """
    if not verify_session(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx / .xls files are supported")

    try:
        contents = await file.read()
        wb = load_workbook(io.BytesIO(contents), read_only=True)
        ws = wb.active

        # Extract names from the first column with data
        names: list[str] = []
        for row in ws.iter_rows(min_row=1, values_only=True):
            for cell_value in row:
                if cell_value and str(cell_value).strip():
                    name = str(cell_value).strip()
                    if name.lower() not in HEADER_SKIP:
                        names.append(name)
                    break  # only first non-empty column

        wb.close()

        if not names:
            raise HTTPException(status_code=400, detail="No names found in the file")

        # --- Guest upsert: reuse existing guests by name, create new ones ---
        existing_guests = {g.name: g for g in db.query(Guest).all()}
        guest_objects: list[Guest] = []

        for name in names:
            if name in existing_guests:
                guest_objects.append(existing_guests[name])
            else:
                new_guest = Guest(
                    name=name,
                    token=str(uuid.uuid4()),
                )
                db.add(new_guest)
                db.flush()  # get the id
                guest_objects.append(new_guest)

        # --- Clear all seat assignments ---
        db.query(Seat).update({Seat.guest_id: None})
        db.flush()

        # --- Auto-assign: center first, then left, then right ---
        sector_order = ["center", "left", "right"]
        available_seats: list[Seat] = []
        for sector in sector_order:
            seats = (
                db.query(Seat)
                .filter(Seat.sector == sector)
                .order_by(Seat.row, Seat.number)
                .all()
            )
            available_seats.extend(seats)

        assigned_count = 0
        skipped = 0
        for i, guest in enumerate(guest_objects):
            if i >= len(available_seats):
                skipped = len(guest_objects) - i
                break
            available_seats[i].guest_id = guest.id
            assigned_count += 1

        db.commit()

        result = {
            "success": True,
            "total_names": len(names),
            "assigned": assigned_count,
            "skipped": skipped,
            "message": f"Assigned {assigned_count} of {len(names)} guests",
        }
        if skipped > 0:
            result["warning"] = f"Not enough seats for {skipped} guests"

        return result

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"File processing error: {str(e)}")


@app.post("/admin/assign")
async def admin_assign(
    request: Request,
    db: Session = Depends(get_db),
):
    """Manually swap guests between two seats.

    Only swaps the guest_id references -- Guest records (and their
    permanent tokens / QR codes) remain unchanged.
    """
    if not verify_session(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    source_id = body.get("source_seat_id")
    target_id = body.get("target_seat_id")

    if not source_id or not target_id:
        raise HTTPException(status_code=400, detail="source_seat_id and target_seat_id required")

    source = db.query(Seat).filter(Seat.id == source_id).first()
    target = db.query(Seat).filter(Seat.id == target_id).first()

    if not source or not target:
        raise HTTPException(status_code=404, detail="Seat not found")

    # Save values before swap
    source_guest_id = source.guest_id
    target_guest_id = target.guest_id

    # Clear both first to avoid UNIQUE constraint violation
    # (SQLite checks constraints per-statement, not per-transaction)
    source.guest_id = None
    target.guest_id = None
    db.flush()

    # Now assign the swapped values
    source.guest_id = target_guest_id
    target.guest_id = source_guest_id
    db.commit()

    return {"success": True, "message": "Guests swapped"}


@app.post("/admin/assign-single")
async def admin_assign_single(
    request: Request,
    db: Session = Depends(get_db),
):
    """Unassign a guest from a specific seat (remove the link).
    The Guest record is preserved with its permanent token.
    """
    if not verify_session(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    seat_id = body.get("seat_id")

    seat = db.query(Seat).options(joinedload(Seat.guest)).filter(Seat.id == seat_id).first()
    if not seat:
        raise HTTPException(status_code=404, detail="Seat not found")

    seat.guest_id = None
    db.commit()
    return {"success": True, "seat": seat.to_dict()}


@app.post("/admin/clear")
async def admin_clear(request: Request, db: Session = Depends(get_db)):
    """Clear all seat assignments. Guest records are preserved."""
    if not verify_session(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

    db.query(Seat).update({Seat.guest_id: None})
    db.commit()
    return {"success": True, "message": "All assignments cleared (guest records preserved)"}


@app.get("/admin/guests")
async def admin_guests(request: Request, db: Session = Depends(get_db)):
    """Get list of all guests with their current seat assignments."""
    if not verify_session(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

    guests = db.query(Guest).all()
    result = []
    for g in guests:
        seat = db.query(Seat).filter(Seat.guest_id == g.id).first()
        entry = g.to_dict()
        if seat:
            entry["seat_id"] = seat.id
            entry["sector"] = seat.sector
            entry["sector_label"] = seat.sector_label
            entry["row"] = seat.row
            entry["number"] = seat.number
        else:
            entry["seat_id"] = None
            entry["sector"] = None
            entry["sector_label"] = None
            entry["row"] = None
            entry["number"] = None
        result.append(entry)

    return result


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
