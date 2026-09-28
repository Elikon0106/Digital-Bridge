"""Database configuration and initialization of 500 seats."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Seat

DATABASE_URL = "sqlite:///./hall.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Hall layout configuration:
# Left sector:   8 seats x 20 rows = 160 seats
# Center sector: 9 seats x 20 rows = 180 seats
# Right sector:  8 seats x 20 rows = 160 seats
# Total: 160 + 180 + 160 = 500 seats

HALL_CONFIG = {
    "left": {"label": "Левый", "seats_per_row": 8, "rows": 20},
    "center": {"label": "Центральный", "seats_per_row": 9, "rows": 20},
    "right": {"label": "Правый", "seats_per_row": 8, "rows": 20},
}


def get_db():
    """Dependency for FastAPI -- yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables and populate 500 seats if not already present."""
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        existing = db.query(Seat).count()
        if existing >= 500:
            return  # already initialized

        # Clear any partial data
        db.query(Seat).delete()
        db.commit()

        seats = []
        for sector_key, config in HALL_CONFIG.items():
            for row in range(1, config["rows"] + 1):
                for num in range(1, config["seats_per_row"] + 1):
                    seat = Seat(
                        sector=sector_key,
                        sector_label=config["label"],
                        row=row,
                        number=num,
                        guest_id=None,
                    )
                    seats.append(seat)

        db.add_all(seats)
        db.commit()
        print(f"[OK] Initialized {len(seats)} seats in the database.")
    finally:
        db.close()
