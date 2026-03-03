#!/usr/bin/env python3
"""
ייבוא נתונים היסטוריים מקובץ alarms.csv לבסיס הנתונים של פיקוד העורף.

מבנה CSV:  time, cities, threat, id, description, origin
מיפוי ל-DB: alert_dt, city, category, rid(hash), title, origin

שימוש:
    python3 import_csv.py                          # מחפש alarms.csv בתיקיית הפרויקט
    python3 import_csv.py /path/to/alarms.csv      # נתיב מפורש
    python3 import_csv.py /path/to/alarms.csv --db /path/to/alerts.db
"""

import csv
import hashlib
import sqlite3
import sys
import os
import argparse
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB  = os.path.join(SCRIPT_DIR, "alerts.db")
DEFAULT_CSV = os.path.join(SCRIPT_DIR, "alarms.csv")

CAT_NAMES = {
    0:  "",
    1:  "ירי רקטות וטילים",
    2:  "חדירת כלי טיס עוין",
    3:  "רעידת אדמה",
    4:  "חשש לצונאמי",
    5:  "אירוע חומרים מסוכנים",
    6:  "התרעה ביטחונית",
    7:  "גל חום",
    8:  "תרגיל",
    13: "ביטול / חזרה לשגרה",
    14: "הנחיות פיקוד העורף",
    15: "חדירת כלי טיס",
    101:"ירי רקטות",
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def make_rid(csv_id: str, city: str, time_str: str) -> int:
    """
    יוצר rid ייחודי לכל שורה ב-CSV.
    מחזיר מספר שלילי כדי להימנע מהתנגשות עם rid אמיתי של oref (חיובי).
    """
    key = f"csv-{csv_id}-{city}-{time_str}"
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16) * -1


def ensure_schema(conn: sqlite3.Connection):
    """ווידא שה-DB קיים ועמודת origin קיימת."""
    # צור טבלה אם לא קיימת
    conn.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            rid       INTEGER PRIMARY KEY,
            alert_dt  TEXT    NOT NULL,
            city      TEXT    NOT NULL,
            title     TEXT    NOT NULL,
            category  INTEGER NOT NULL,
            cat_desc  TEXT    DEFAULT '',
            source    TEXT    DEFAULT 'history',
            origin    TEXT    DEFAULT ''
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_dt ON alerts(alert_dt)")

    # מגרציה: הוסף origin אם חסרה
    cols = [r[1] for r in conn.execute("PRAGMA table_info(alerts)").fetchall()]
    if "origin" not in cols:
        conn.execute("ALTER TABLE alerts ADD COLUMN origin TEXT DEFAULT ''")
        print("  ✓ עמודת origin נוספה ל-DB")

    conn.commit()


# ── Main import ───────────────────────────────────────────────────────────────
def import_csv(csv_path: str, db_path: str = DEFAULT_DB, batch_size: int = 1000):
    print()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("📥  ייבוא נתונים היסטוריים מ-CSV")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  קובץ:   {csv_path}")
    print(f"  מסד:    {db_path}")
    print()

    # בדיקות קדם
    if not os.path.exists(csv_path):
        print(f"❌  קובץ לא נמצא: {csv_path}")
        sys.exit(1)
    if not os.path.exists(db_path):
        print(f"❌  מסד הנתונים לא נמצא: {db_path}")
        print("    הרץ את oref_app.py לפחות פעם אחת כדי ליצור את ה-DB")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    ensure_schema(conn)

    # קרא CSV
    with open(csv_path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    total_csv = len(rows)
    print(f"  📊 {total_csv:,} שורות בקובץ")
    print()

    inserted = 0
    skipped  = 0
    errors   = 0
    batch    = []

    def flush(batch):
        conn.executemany(
            "INSERT OR IGNORE INTO alerts "
            "(rid, alert_dt, city, title, category, cat_desc, source, origin) "
            "VALUES (?,?,?,?,?,?,?,?)",
            batch
        )
        conn.commit()

    for i, row in enumerate(rows):
        try:
            csv_id   = row.get("id", "").strip()
            city     = row.get("cities", "").strip()
            time_str = row.get("time", "").strip()
            desc     = row.get("description", "").strip()
            origin   = row.get("origin", "").strip()

            try:
                category = int(row.get("threat", "0").strip())
            except ValueError:
                category = 0

            rid      = make_rid(csv_id, city, time_str)
            cat_desc = CAT_NAMES.get(category, desc)
            title    = desc if desc else cat_desc

            batch.append((rid, time_str, city, title, category, cat_desc, "csv", origin))

            if len(batch) >= batch_size:
                before = conn.execute("SELECT changes()").fetchone()[0]
                flush(batch)
                batch = []

        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"  ⚠️  שגיאה בשורה {i+2}: {e}")

        # דיווח התקדמות
        if (i + 1) % 10000 == 0:
            pct = 100 * (i + 1) / total_csv
            print(f"  ⏳ {i+1:>7,} / {total_csv:,}  ({pct:.0f}%)")

    # שטיפה אחרונה
    if batch:
        flush(batch)

    # ספור תוצאות
    after_total = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    csv_in_db   = conn.execute(
        "SELECT COUNT(*) FROM alerts WHERE source='csv'"
    ).fetchone()[0]
    conn.close()

    print()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  ✅  שורות ב-CSV:          {total_csv:>8,}")
    print(f"  📥  רשומות CSV ב-DB:      {csv_in_db:>8,}")
    print(f"  📦  סה\"כ ב-DB (הכל):      {after_total:>8,}")
    if errors:
        print(f"  ❌  שגיאות:              {errors:>8,}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print()
    print("  הנתונים הוכנסו בהצלחה! הפעל מחדש את oref_app.py לצפייה.")
    print()


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ייבוא alarms.csv לבסיס הנתונים")
    parser.add_argument("csv", nargs="?", default=DEFAULT_CSV,
                        help=f"נתיב לקובץ CSV (ברירת מחדל: {DEFAULT_CSV})")
    parser.add_argument("--db", default=DEFAULT_DB,
                        help=f"נתיב ל-DB (ברירת מחדל: {DEFAULT_DB})")
    args = parser.parse_args()

    import_csv(args.csv, args.db)
