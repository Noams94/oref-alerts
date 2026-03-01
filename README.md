# 🛡️ מערכת ניטור התראות פיקוד העורף

ממשק ווב לאיסוף, תצוגה וייצוא של התראות פיקוד העורף בזמן אמת.

## תכונות
- **איסוף אוטומטי** — שולף נתונים מ-API של פיקוד העורף כל 10 שניות (live) ו-2 דקות (היסטוריה)
- **היסטוריה מלאה** — טוען ב-startup את כל ההיסטוריה הזמינה
- **ייצוא Excel** — 3 גיליונות: כל ההתראות / סיכום אירועים / סטטיסטיקות
- **ממשק עברי RTL** — תצוגה חיה עם ספירה לאחור לרענון

## הפעלה מקומית

```bash
pip install -r requirements.txt
python oref_app.py
```

פותח אוטומטית את http://localhost:5050

**macOS**: לחץ פעמיים על `פיקוד-העורף.command`

## מקורות נתונים
| Source | תדירות | תוכן |
|--------|--------|-------|
| `GetAlarmsHistory.aspx` | כל 2 דקות | 3,000 ההתראות האחרונות |
| `Alerts.json` | כל 10 שניות | התראות פעילות כרגע |
| `AlertsHistory.json` | פעם ב-startup | היסטוריה יומית מלאה |

## פריסה ל-Render
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Fork את ה-repo
2. כנס ל-[render.com](https://render.com) ← New ← Web Service ← GitHub repo
3. Render מזהה את `render.yaml` אוטומטית
