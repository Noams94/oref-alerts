# 🛡️ מערכת ניטור התראות פיקוד העורף

ממשק ווב לאיסוף, תצוגה, סינון וייצוא של התראות פיקוד העורף — בזמן אמת ועם היסטוריה מלאה מ-2019.

## תכונות

- **איסוף אוטומטי** — שולף נתונים מ-API של פיקוד העורף כל 2 דקות (היסטוריה) + כל 10 שניות (live)
- **היסטוריה מלאה** — 240,000+ רשומות מ-2019 עד היום, מיובאות אוטומטית מ-[GitHub](https://github.com/yuval-harpaz/alarms) בהפעלה
- **מפה אינטראקטיבית** — Leaflet + OpenStreetMap, נקודות לפי יישוב עם צבע לפי סוג התראה
- **פאנל סינון** — תאריך, יישוב, סוג התראה, מקור (איראן / עזה / לבנון / תימן...)
- **ייצוא Excel** — 3 גיליונות: כל ההתראות / סיכום / סטטיסטיקות (לפי פילטר)
- **גישה ציבורית קבועה** — Tailscale Funnel: כתובת HTTPS קבועה, חינמי

## הפעלה

**macOS**: לחץ פעמיים על `פיקוד-העורף.command`

האפליקציה:
1. מפעילה את השרת על פורט 5050
2. מפעילה **Tailscale Funnel** → כתובת HTTPS ציבורית וקבועה
3. פותחת דפדפן אוטומטית

```bash
# או מ-Terminal:
pip install -r requirements.txt
python3 oref_app.py
```

## גישה ציבורית (Tailscale Funnel)

הכתובת הציבורית **קבועה** ומשויכת לשם המחשב ב-Tailscale:

```
https://<machine-name>.tail631a26.ts.net/
```

```bash
# התקנה (פעם אחת):
brew install tailscale
# התחברות:
tailscale up
# הפעלה ידנית:
tailscale funnel --bg 5050
```

> Tailscale Funnel חינמי לחלוטין ומשתמש ב-IP ביתי — עוקף את חסימת ה-WAF של פיקוד העורף.

## מקורות נתונים

| מקור | תדירות | תוכן |
|------|--------|-------|
| `GetAlarmsHistory.aspx` | כל 2 דקות | 3,000 ההתראות האחרונות |
| `Alerts.json` | כל 10 שניות | התראות פעילות כרגע (מקומית בלבד) |
| `AlertsHistory.json` | פעם ב-startup | היסטוריה יומית מ-oref |
| [yuval-harpaz/alarms](https://github.com/yuval-harpaz/alarms) | פעם ב-startup | ארכיון CSV מ-2019 (114K+ רשומות) |

## ייבוא CSV ידני

```bash
# ייבוא קובץ CSV מקומי:
python3 import_csv.py /path/to/alarms.csv

# עם DB מותאם אישית:
python3 import_csv.py /path/to/alarms.csv --db /path/to/alerts.db
```

## הערה לגבי פריסת ענן

**אתר פיקוד העורף חוסם IP-ים של שרתי ענן** (Imperva WAF — AWS, GCP, Render, Railway וכו').
**הפתרון המומלץ**: הרץ מקומית + Tailscale Funnel לגישה ציבורית.
