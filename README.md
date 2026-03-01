# 🛡️ מערכת ניטור התראות פיקוד העורף

ממשק ווב לאיסוף, תצוגה וייצוא של התראות פיקוד העורף בזמן אמת.

## תכונות
- **איסוף אוטומטי** — שולף נתונים מ-API של פיקוד העורף כל 2 דקות (היסטוריה + live)
- **היסטוריה מלאה** — טוען ב-startup את כל ההיסטוריה הזמינה (22,000+ רשומות)
- **ייצוא Excel** — 3 גיליונות: כל ההתראות / סיכום אירועים / סטטיסטיקות
- **ממשק עברי RTL** — תצוגה חיה עם ספירה לאחור לרענון
- **גישה ציבורית** — Cloudflare Tunnel מאפשר שיתוף עם כל אחד בחינם

## הפעלה מקומית (מומלץ)

**macOS**: לחץ פעמיים על `פיקוד-העורף.command`

האפליקציה:
1. מפעילה את השרת
2. פותחת **Cloudflare Tunnel** → URL ציבורי שאפשר לשתף עם כולם
3. פותחת דפדפן אוטומטית

```bash
# או מ-Terminal:
pip install -r requirements.txt
python oref_app.py
```

## גישה ציבורית (Cloudflare Tunnel)

```bash
# התקנה (פעם אחת):
brew install cloudflare/cloudflare/cloudflared

# הפעלה ידנית (אם לא משתמשים ב-.command):
cloudflared tunnel --url http://localhost:5050
```

פולט URL בפורמט: `https://random-words.trycloudflare.com`

> **הערה**: כתובת ה-Tunnel משתנה בכל הפעלה. לכתובת קבועה ראה [Cloudflare Tunnel Named Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

## מקורות נתונים
| Source | תדירות | תוכן |
|--------|--------|-------|
| `GetAlarmsHistory.aspx` | כל 2 דקות | 3,000 ההתראות האחרונות |
| `Alerts.json` | כל 10 שניות | התראות פעילות כרגע (מקומית בלבד) |
| `AlertsHistory.json` | פעם ב-startup | היסטוריה יומית מלאה |

## הערה לגבי פריסת ענן

**אתר פיקוד העורף חוסם IP-ים של שרתי ענן** (AWS, GCP, Azure).
לכן הפריסה ל-Render/Railway לא מחזירה נתונים.
**הפתרון**: הרץ מקומית + השתמש ב-Cloudflare Tunnel לשיתוף ציבורי.
