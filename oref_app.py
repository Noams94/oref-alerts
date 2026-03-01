"""
פיקוד העורף — אוסף התראות + ממשק ייצוא
-----------------------------------------
• Thread אחד שולף GetAlarmsHistory.aspx כל 2 דקות (מחזיר 3000 האחרונות, עדכני להיום)
• Thread שני שולף Alerts.json כל 10 שניות (התראות פעילות ברגע זה)
• Flask מגיש ממשק ווב עברי + כפתור ייצוא Excel
"""

import sqlite3
import threading
import time
import io
import json
import logging
from datetime import datetime
from collections import Counter, defaultdict

import requests
from flask import Flask, send_file, jsonify, render_template_string
import openpyxl
from openpyxl.styles import (
    Font, PatternFill, Alignment, Border, Side
)
from openpyxl.utils import get_column_letter

# ─── Config ───────────────────────────────────────────────────────────────────
DB_PATH           = "alerts.db"
LIVE_INTERVAL     = 10    # seconds — Alerts.json (פעיל עכשיו)
HISTORY_INTERVAL  = 120   # seconds — GetAlarmsHistory (כל 2 דקות, בהתאם ל-cache)
PORT              = 5050

OREF_HEADERS = {
    "Referer":          "https://www.oref.org.il/",
    "X-Requested-With": "XMLHttpRequest",
    "Accept":           "application/json",
}
HISTORY_HEADERS = {
    "Referer":          "https://alerts-history.oref.org.il/12481-he/Pakar.aspx",
    "X-Requested-With": "XMLHttpRequest",
    "Accept":           "application/json, text/javascript, */*; q=0.01",
}

# endpoint עדכני עם נתוני היום — מחדש כל 2 דקות
# endpoint עדכני — 3000 האחרונות, מחדש כל 2 דקות
HISTORY_URL = ("https://alerts-history.oref.org.il/Shared/Ajax/"
               "GetAlarmsHistory.aspx?lang=he&mode=1")
# היסטוריה מלאה (אתמול + מוקדם יותר) — קובץ סטטי שמתעדכן פעם ביום
STATIC_HISTORY_URL = ("https://www.oref.org.il/warningMessages/alert"
                      "/History/AlertsHistory.json")
# התראות פעילות ברגע זה
LIVE_URL    = ("https://www.oref.org.il/warningMessages/alert/Alerts.json")

CAT_NAMES = {
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
CAT_COLORS = {
    1:  "FF4444", 2:  "FF8800", 3:  "AA44FF",
    4:  "4488FF", 5:  "FF44AA", 6:  "FF6600",
    13: "44BB44", 14: "FFCC00", 15: "FF8844",
    101:"FF4444",
}
DEFAULT_COLOR = "AAAAAA"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("oref")

# ─── Database ─────────────────────────────────────────────────────────────────
_db_lock = threading.Lock()

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        # מגרציה: אם קיים DB ישן ללא עמודת rid — מחק ובנה מחדש
        cols = [r[1] for r in conn.execute("PRAGMA table_info(alerts)").fetchall()]
        if cols and "rid" not in cols:
            log.warning("DB ישן זוהה (ללא rid) — מוחק ובונה מחדש...")
            conn.execute("DROP TABLE IF EXISTS alerts")
            conn.commit()

        conn.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                rid       INTEGER PRIMARY KEY,
                alert_dt  TEXT    NOT NULL,
                city      TEXT    NOT NULL,
                title     TEXT    NOT NULL,
                category  INTEGER NOT NULL,
                cat_desc  TEXT    DEFAULT '',
                source    TEXT    DEFAULT 'history'
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_dt ON alerts(alert_dt)")
        conn.commit()

def _normalize(r, source):
    """Convert API record (either format) to a unified dict."""
    # GetAlarmsHistory format: rid, data, alertDate, category, category_desc
    if "rid" in r:
        return {
            "rid":      r["rid"],
            "alert_dt": r.get("alertDate", ""),
            "city":     r.get("data", ""),
            "title":    r.get("category_desc", ""),
            "category": r.get("category", 0),
            "cat_desc": r.get("category_desc", ""),
            "source":   source,
        }
    # Alerts.json format: alertDate, data, title, category (no rid)
    # Use a synthetic rid based on timestamp+city hash to avoid collisions
    import hashlib
    key = f"{r.get('alertDate','')}-{r.get('data','')}-{r.get('title','')}"
    synthetic_rid = int(hashlib.md5(key.encode()).hexdigest()[:8], 16) * -1
    return {
        "rid":      synthetic_rid,
        "alert_dt": r.get("alertDate", ""),
        "city":     r.get("data", ""),
        "title":    r.get("title", ""),
        "category": r.get("category", 0),
        "cat_desc": CAT_NAMES.get(r.get("category", 0), ""),
        "source":   source,
    }

def insert_alerts(rows, source="history"):
    """Insert list of API records; deduplicate by rid."""
    if not rows:
        return 0
    count = 0
    with _db_lock:
        with get_db() as conn:
            for r in rows:
                try:
                    n = _normalize(r, source)
                    conn.execute(
                        "INSERT OR IGNORE INTO alerts "
                        "(rid, alert_dt, city, title, category, cat_desc, source) "
                        "VALUES (?,?,?,?,?,?,?)",
                        (n["rid"], n["alert_dt"], n["city"], n["title"],
                         n["category"], n["cat_desc"], n["source"])
                    )
                    if conn.execute("SELECT changes()").fetchone()[0]:
                        count += 1
                except Exception as e:
                    log.warning("insert error: %s", e)
            conn.commit()
    return count

def query_alerts(where="", params=()):
    with get_db() as conn:
        return conn.execute(
            f"SELECT * FROM alerts {where} ORDER BY alert_dt DESC",
            params
        ).fetchall()

def get_stats():
    with get_db() as conn:
        total   = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
        cities  = conn.execute(
            "SELECT COUNT(DISTINCT city) FROM alerts").fetchone()[0]
        newest  = conn.execute(
            "SELECT MAX(alert_dt) FROM alerts").fetchone()[0]
        oldest  = conn.execute(
            "SELECT MIN(alert_dt) FROM alerts").fetchone()[0]
        by_title = conn.execute(
            "SELECT title, COUNT(*) as n FROM alerts "
            "GROUP BY title ORDER BY n DESC"
        ).fetchall()
        top_cities = conn.execute(
            "SELECT city, COUNT(*) as n FROM alerts "
            "GROUP BY city ORDER BY n DESC LIMIT 10"
        ).fetchall()
    return dict(total=total, cities=cities, newest=newest,
                oldest=oldest, by_title=by_title, top_cities=top_cities)

# ─── Collectors ───────────────────────────────────────────────────────────────
_state = {
    "last_live":    "—",
    "last_history": "—",
    "live_errors":  0,
    "new_today":    0,
}

def fetch_json(url, headers=None):
    r = requests.get(url, headers=headers or OREF_HEADERS, timeout=15)
    r.raise_for_status()
    text = r.text.lstrip("\ufeff").strip()
    if not text or text in ("[]", ""):
        return []
    parsed = json.loads(text)
    # וודא שהתוצאה תמיד רשימה
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        return [parsed]
    return []

def _expand_live(obj):
    """
    Alerts.json מחזיר אובייקט יחיד כשיש התראה פעילה:
    {"id":"1","cat":"1","title":"ירי רקטות","data":["עיר1","עיר2"],...}
    פורש לרשימת רשומות — אחת לכל עיר.
    """
    if not isinstance(obj, dict):
        return []
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cities  = obj.get("data", [])
    title   = obj.get("title", "")
    try:
        cat = int(obj.get("cat", 0))
    except (ValueError, TypeError):
        cat = 0
    if isinstance(cities, str):
        cities = [cities]
    return [
        {"alertDate": now_str, "data": city, "title": title, "category": cat}
        for city in cities
    ]

def collect_live():
    """Poll Alerts.json every LIVE_INTERVAL seconds (התראות פעילות כרגע)."""
    log.info("Live collector started (every %ds)", LIVE_INTERVAL)
    while True:
        try:
            raw = fetch_json(LIVE_URL, headers=OREF_HEADERS)
            # raw הוא רשימה; כל פריט יכול להיות אובייקט התראה אחת
            records = []
            for item in raw:
                if isinstance(item, dict) and "data" in item and isinstance(item["data"], list):
                    # פורמט Alerts.json — data הוא מערך ערים
                    records.extend(_expand_live(item))
                elif isinstance(item, dict):
                    records.append(item)
                # אחרת (str וכד') — מדלג
            n = insert_alerts(records, source="live")
            _state["last_live"] = datetime.now().strftime("%H:%M:%S")
            if n:
                _state["new_today"] += n
                log.info("Live: +%d new alerts", n)
            _state["live_errors"] = 0
        except Exception as e:
            _state["live_errors"] += 1
            log.warning("Live fetch error: %s", e)
        time.sleep(LIVE_INTERVAL)

def collect_history():
    """Poll GetAlarmsHistory.aspx every HISTORY_INTERVAL seconds.
    מחזיר 3000 ההתראות האחרונות עם rid ייחודי — עדכני להיום."""
    log.info("History collector started (every %ds)", HISTORY_INTERVAL)
    while True:
        try:
            data = fetch_json(HISTORY_URL, headers=HISTORY_HEADERS)
            n = insert_alerts(data, source="history")
            _state["last_history"] = datetime.now().strftime("%H:%M:%S")
            if n:
                _state["new_today"] += n
                log.info("History: +%d new alerts", n)
        except Exception as e:
            log.warning("History fetch error: %s", e)
        time.sleep(HISTORY_INTERVAL)

# ─── Excel Builder ────────────────────────────────────────────────────────────
THIN        = Side(style="thin", color="CCCCCC")
CELL_BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
HDR_FONT    = Font(name="Arial", bold=True, color="FFFFFF", size=11)
HDR_FILL    = PatternFill("solid", fgColor="1F4E79")
CELL_FONT   = Font(name="Arial", size=10)
ALT_FILL    = PatternFill("solid", fgColor="EBF3FB")
RTL         = Alignment(horizontal="right", vertical="center", readingOrder=2)
CTR         = Alignment(horizontal="center", vertical="center", readingOrder=2)

def _hdr(ws, row, cols):
    for c in range(1, cols+1):
        cell = ws.cell(row=row, column=c)
        cell.font = HDR_FONT; cell.fill = HDR_FILL
        cell.alignment = CTR; cell.border = CELL_BORDER
    ws.row_dimensions[row].height = 22

def _cell(ws, row, col, val, color=None, bold=False, wrap=False):
    c = ws.cell(row=row, column=col, value=val)
    c.font   = Font(name="Arial", size=10, bold=bold,
                    color="FFFFFF" if color else "000000")
    c.border = CELL_BORDER
    c.alignment = Alignment(horizontal="right", vertical="top" if wrap else "center",
                             readingOrder=2, wrap_text=wrap)
    if color:
        c.fill = PatternFill("solid", fgColor=color)
    elif row % 2 == 0:
        c.fill = ALT_FILL
    return c

def build_excel():
    rows = query_alerts()
    wb   = openpyxl.Workbook()

    # ── Sheet 1: All alerts ──────────────────────────────────────────────────
    ws1 = wb.active
    ws1.title = "כל ההתראות"
    ws1.sheet_view.rightToLeft = True

    for ci, h in enumerate(["חותמת זמן","יישוב","סוג התראה","קטגוריה"], 1):
        ws1.cell(row=1, column=ci, value=h)
    _hdr(ws1, 1, 4)

    for ri, r in enumerate(rows, 2):
        cat   = r["category"]
        color = CAT_COLORS.get(cat, DEFAULT_COLOR)
        _cell(ws1, ri, 1, r["alert_dt"])
        _cell(ws1, ri, 2, r["city"])
        _cell(ws1, ri, 3, r["title"])
        _cell(ws1, ri, 4, CAT_NAMES.get(cat, f"קטגוריה {cat}"),
              color=color, bold=True)

    ws1.auto_filter.ref = f"A1:D{len(rows)+1}"
    ws1.freeze_panes   = "A2"
    for col, w in {1:22, 2:28, 3:38, 4:26}.items():
        ws1.column_dimensions[get_column_letter(col)].width = w

    # ── Sheet 2: Event summary ───────────────────────────────────────────────
    ws2 = wb.create_sheet("סיכום אירועים")
    ws2.sheet_view.rightToLeft = True

    groups  = defaultdict(set)
    g_meta  = {}
    for r in rows:
        ts_min = r["alert_dt"][:16] + ":00"
        key    = (ts_min, r["title"])
        groups[key].add(r["city"])
        g_meta[key] = (r["category"],
                       CAT_COLORS.get(r["category"], DEFAULT_COLOR))

    grp_rows = sorted(
        [(ts, title, sorted(cities), *g_meta[(ts,title)])
         for (ts,title), cities in groups.items()],
        key=lambda x: x[0]
    )

    for ci, h in enumerate(["חותמת זמן","סוג התראה","מספר ישובים","רשימת ישובים"], 1):
        ws2.cell(row=1, column=ci, value=h)
    _hdr(ws2, 1, 4)

    for ri, (ts, title, cities, cat, color) in enumerate(grp_rows, 2):
        _cell(ws2, ri, 1, ts)
        _cell(ws2, ri, 2, title, color=color, bold=True)
        _cell(ws2, ri, 3, len(cities))
        c = ws2.cell(row=ri, column=4, value=", ".join(cities))
        c.font      = CELL_FONT
        c.border    = CELL_BORDER
        c.alignment = Alignment(horizontal="right", vertical="top",
                                 readingOrder=2, wrap_text=True)
        if ri % 2 == 0:
            c.fill = ALT_FILL

    ws2.auto_filter.ref = f"A1:D{len(grp_rows)+1}"
    ws2.freeze_panes    = "A2"
    for col, w in {1:20, 2:38, 3:16, 4:60}.items():
        ws2.column_dimensions[get_column_letter(col)].width = w

    # ── Sheet 3: Statistics ──────────────────────────────────────────────────
    ws3 = wb.create_sheet("סטטיסטיקות")
    ws3.sheet_view.rightToLeft = True

    s   = get_stats()
    row = 1

    def sect(text):
        nonlocal row
        ws3.merge_cells(start_row=row, start_column=1,
                        end_row=row, end_column=3)
        c = ws3.cell(row=row, column=1, value=text)
        c.font      = Font(name="Arial", bold=True, size=11, color="FFFFFF")
        c.fill      = PatternFill("solid", fgColor="2E75B6")
        c.alignment = Alignment(horizontal="right", vertical="center",
                                 readingOrder=2)
        c.border    = CELL_BORDER
        ws3.row_dimensions[row].height = 20
        row += 1

    def kv(k, v):
        nonlocal row
        ck = ws3.cell(row=row, column=1, value=k)
        cv = ws3.cell(row=row, column=2, value=v)
        for c in (ck, cv):
            c.font      = Font(name="Arial", size=10,
                               bold=(c is ck))
            c.alignment = RTL
            c.border    = CELL_BORDER
        if row % 2 == 0:
            for col in [1,2]:
                ws3.cell(row=row, column=col).fill = ALT_FILL
        row += 1

    ws3.cell(row=row, column=1,
             value="סטטיסטיקות התראות פיקוד העורף").font = \
        Font(name="Arial", bold=True, size=14, color="1F4E79")
    ws3.merge_cells(start_row=row, start_column=1, end_row=row, end_column=3)
    ws3.cell(row=row, column=1).alignment = Alignment(
        horizontal="right", vertical="center", readingOrder=2)
    ws3.row_dimensions[row].height = 30
    row += 2

    sect("סיכום כללי")
    kv('סה"כ התראות', s["total"])
    kv("ישובים מושפעים", s["cities"])
    kv("אירועים מקובצים", len(grp_rows))
    kv("התראה ראשונה", s["oldest"] or "—")
    kv("התראה אחרונה", s["newest"] or "—")
    kv("עודכן לאחרונה",
       datetime.now().strftime("%d/%m/%Y %H:%M:%S"))
    row += 1

    sect("פירוט לפי סוג התראה")
    for ci, h in enumerate(["סוג התראה","מספר","אחוז"], 1):
        c = ws3.cell(row=row, column=ci, value=h)
        c.font = HDR_FONT; c.fill = HDR_FILL
        c.alignment = CTR; c.border = CELL_BORDER
    row += 1
    for ri, r in enumerate(s["by_title"]):
        pct = f"{100*r['n']/s['total']:.1f}%" if s["total"] else "0%"
        for ci, v in enumerate([r["title"], r["n"], pct], 1):
            c = ws3.cell(row=row, column=ci, value=v)
            c.font = CELL_FONT; c.alignment = RTL; c.border = CELL_BORDER
            if ri % 2 == 1:
                c.fill = ALT_FILL
        row += 1

    row += 1
    sect("10 הישובים עם הכי הרבה התראות")
    for ci, h in enumerate(["ישוב","מספר","אחוז"], 1):
        c = ws3.cell(row=row, column=ci, value=h)
        c.font = HDR_FONT; c.fill = HDR_FILL
        c.alignment = CTR; c.border = CELL_BORDER
    row += 1
    for ri, r in enumerate(s["top_cities"]):
        pct = f"{100*r['n']/s['total']:.1f}%" if s["total"] else "0%"
        for ci, v in enumerate([r["city"], r["n"], pct], 1):
            c = ws3.cell(row=row, column=ci, value=v)
            c.font = CELL_FONT; c.alignment = RTL; c.border = CELL_BORDER
            if ri % 2 == 1:
                c.fill = ALT_FILL
        row += 1

    for col, w in {1:38, 2:16, 3:12}.items():
        ws3.column_dimensions[get_column_letter(col)].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf

# ─── Flask App ────────────────────────────────────────────────────────────────
app = Flask(__name__)

HTML = """<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>פיקוד העורף — ניטור התראות</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    background: #0d1b2a;
    color: #e8eaf6;
    min-height: 100vh;
    padding: 24px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
    border-bottom: 2px solid #1f4e79;
    padding-bottom: 16px;
  }
  .logo {
    width: 54px; height: 54px;
    background: #1f4e79;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px;
  }
  h1 { font-size: 1.6rem; color: #90caf9; }
  h1 small { font-size: 0.85rem; color: #78909c; font-weight: normal; }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }
  .card {
    background: #162032;
    border: 1px solid #1f4e79;
    border-radius: 12px;
    padding: 20px;
    text-align: center;
  }
  .card .num  { font-size: 2.4rem; font-weight: bold; color: #42a5f5; }
  .card .lbl  { font-size: 0.85rem; color: #78909c; margin-top: 4px; }
  .card.green .num { color: #66bb6a; }
  .card.red   .num { color: #ef5350; }
  .card.yellow .num { color: #ffa726; }

  .status-bar {
    background: #162032;
    border: 1px solid #1a3a5c;
    border-radius: 8px;
    padding: 12px 20px;
    margin-bottom: 28px;
    display: flex;
    gap: 28px;
    font-size: 0.85rem;
    color: #78909c;
    flex-wrap: wrap;
  }
  .status-bar span { display: flex; align-items: center; gap: 6px; }
  .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #66bb6a;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%,100% { opacity: 1; } 50% { opacity: 0.3; }
  }

  .export-btn {
    display: block;
    width: 100%;
    padding: 18px;
    font-size: 1.3rem;
    font-weight: bold;
    background: linear-gradient(135deg, #1565c0, #0d47a1);
    color: #fff;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: all 0.2s;
    margin-bottom: 20px;
    text-decoration: none;
    text-align: center;
  }
  .export-btn:hover {
    background: linear-gradient(135deg, #1976d2, #1565c0);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(21,101,192,0.5);
  }
  .export-btn:active { transform: translateY(0); }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
    margin-top: 20px;
  }
  thead th {
    background: #1f4e79;
    color: #fff;
    padding: 10px 14px;
    text-align: right;
    font-weight: bold;
  }
  tbody tr:nth-child(even) { background: #162032; }
  tbody tr:hover           { background: #1a3a5c; }
  tbody td { padding: 8px 14px; border-bottom: 1px solid #1a3a5c; }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 0.78rem;
    font-weight: bold;
    color: #fff;
  }
  .section-title {
    font-size: 1.1rem;
    color: #90caf9;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #1f4e79;
  }
  #refresh-notice {
    font-size: 0.78rem;
    color: #546e7a;
    text-align: center;
    margin-top: 24px;
  }
</style>
</head>
<body>
<header>
  <div class="logo">🛡️</div>
  <div>
    <h1>פיקוד העורף — ניטור התראות
      <br><small>נתונים חיים · מתרענן כל 15 שניות</small>
    </h1>
  </div>
</header>

<div class="cards">
  <div class="card red">
    <div class="num" id="total">—</div>
    <div class="lbl">סה"כ התראות</div>
  </div>
  <div class="card">
    <div class="num" id="cities">—</div>
    <div class="lbl">ישובים מושפעים</div>
  </div>
  <div class="card yellow">
    <div class="num" id="new_today">—</div>
    <div class="lbl">חדשות מסשן זה</div>
  </div>
  <div class="card green">
    <div class="num" id="newest">—</div>
    <div class="lbl">התראה אחרונה</div>
  </div>
</div>

<div class="status-bar">
  <span><span class="dot"></span> אוסף נתונים חיים</span>
  <span>עדכון אחרון (live): <b id="last_live">—</b></span>
  <span>עדכון אחרון (היסטוריה): <b id="last_history">—</b></span>
  <span>שגיאות: <b id="errors">0</b></span>
</div>

<a href="/export" class="export-btn">⬇️ &nbsp; ייצא קובץ Excel עדכני</a>

<div class="section-title">10 התראות אחרונות</div>
<table>
  <thead>
    <tr><th>זמן</th><th>ישוב</th><th>סוג</th></tr>
  </thead>
  <tbody id="recent"></tbody>
</table>

<div id="refresh-notice">מתרענן אוטומטית · <span id="countdown">15</span>ש</div>

<script>
const CAT_COLORS = {{ cat_colors | tojson }};
const DEFAULT    = "#888";

function colorFor(title) {
  // match by keyword
  if (title.includes("רקטות") || title.includes("טילים")) return "#ef5350";
  if (title.includes("ביטול") || title.includes("שגרה") || title.includes("לצאת")) return "#66bb6a";
  if (title.includes("הנחיות") || title.includes("להישאר")) return "#ffa726";
  if (title.includes("כלי טיס")) return "#ff7043";
  return "#78909c";
}

async function refresh() {
  const [stats, state, recent] = await Promise.all([
    fetch("/api/stats").then(r => r.json()),
    fetch("/api/state").then(r => r.json()),
    fetch("/api/recent").then(r => r.json()),
  ]);

  document.getElementById("total").textContent   = stats.total.toLocaleString();
  document.getElementById("cities").textContent  = stats.cities.toLocaleString();
  document.getElementById("new_today").textContent = state.new_today.toLocaleString();
  document.getElementById("newest").textContent  =
    stats.newest ? stats.newest.slice(11,16) : "—";

  document.getElementById("last_live").textContent    = state.last_live;
  document.getElementById("last_history").textContent = state.last_history;
  document.getElementById("errors").textContent       = state.live_errors;

  const tbody = document.getElementById("recent");
  tbody.innerHTML = "";
  recent.forEach(r => {
    const color = colorFor(r.title);
    tbody.innerHTML += `<tr>
      <td>${r.alert_dt.slice(5,16)}</td>
      <td>${r.city}</td>
      <td><span class="badge" style="background:${color}">${r.title}</span></td>
    </tr>`;
  });
}

// Countdown timer
let cd = 15;
setInterval(() => {
  cd--;
  document.getElementById("countdown").textContent = cd;
  if (cd <= 0) { cd = 15; refresh(); }
}, 1000);

refresh();
</script>
</body>
</html>
"""

@app.route("/")
def index():
    return render_template_string(HTML, cat_colors=CAT_COLORS)

@app.route("/api/stats")
def api_stats():
    s = get_stats()
    return jsonify(
        total=s["total"],
        cities=s["cities"],
        newest=s["newest"],
        oldest=s["oldest"],
    )

@app.route("/api/state")
def api_state():
    return jsonify(**_state)

@app.route("/api/recent")
def api_recent():
    rows = query_alerts()[:10]
    return jsonify([dict(r) for r in rows])

@app.route("/export")
def export():
    s     = get_stats()
    today = datetime.now().strftime("%d-%m-%Y")
    fname = f"התראות_פיקוד_העורף_{today}.xlsx"
    buf   = build_excel()
    log.info("Excel exported: %s (%d alerts)", fname, s["total"])
    return send_file(
        buf,
        as_attachment=True,
        download_name=fname,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

def startup_backfill():
    """טוען בהפעלה: היסטוריה סטטית (28/02 ואחורה) + GetAlarmsHistory עדכני."""
    # 1. היסטוריה סטטית — AlertsHistory.json (נתוני אתמול וקודם)
    try:
        log.info("Backfill: טוען AlertsHistory.json (נתוני 28/02)...")
        data = fetch_json(STATIC_HISTORY_URL, headers=OREF_HEADERS)
        n = insert_alerts(data, source="history")
        log.info("Backfill: נטענו %d רשומות היסטוריות מ-AlertsHistory.json", n)
    except Exception as e:
        log.warning("Backfill AlertsHistory error: %s", e)

    # 2. GetAlarmsHistory — 3000 האחרונות (נתוני היום)
    try:
        log.info("Backfill: טוען GetAlarmsHistory.aspx (נתוני היום)...")
        data = fetch_json(HISTORY_URL, headers=HISTORY_HEADERS)
        n = insert_alerts(data, source="history")
        log.info("Backfill: נטענו %d רשומות מ-GetAlarmsHistory.aspx", n)
    except Exception as e:
        log.warning("Backfill GetAlarmsHistory error: %s", e)

    _state["last_history"] = datetime.now().strftime("%H:%M:%S")
    total = get_stats()["total"]
    log.info("Backfill הושלם — סה\"כ %d רשומות ב-DB", total)


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    import os

    # בענן: PORT מגיע מ-environment variable; מקומית: 5050
    port     = int(os.environ.get("PORT", PORT))
    is_cloud = os.environ.get("RENDER") or os.environ.get("RAILWAY_ENVIRONMENT")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_dir     = os.environ.get("DB_DIR", script_dir)   # בענן אפשר לדרוס נתיב
    global DB_PATH
    DB_PATH = os.path.join(db_dir, "alerts.db")

    os.makedirs(db_dir, exist_ok=True)
    init_db()

    # טעינה ראשונית
    threading.Thread(target=startup_backfill, name="backfill", daemon=True).start()

    # Collectors רקע
    for target, name in [(collect_live, "live"), (collect_history, "history")]:
        t = threading.Thread(target=target, name=name, daemon=True)
        t.start()

    log.info("Server starting on port %d (cloud=%s)", port, bool(is_cloud))

    # פתיחת דפדפן רק במצב מקומי
    if not is_cloud:
        import webbrowser
        threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{port}")).start()

    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
