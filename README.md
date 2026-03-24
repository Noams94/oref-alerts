# 🛡️ מערכת ניטור התרעות פיקוד העורף

מערכת לאיסוף, תצוגה, סינון וייצוא של התרעות פיקוד העורף — בזמן אמת ועם היסטוריה מלאה מ-2019.

---

## שתי גרסאות

הפרויקט מכיל שתי גרסאות עצמאיות:

### 🌐 גרסת Web (תיקיית `web/`) — **הגרסה הפעילה**

דאשבורד Next.js שרץ על Vercel עם Neon Postgres.

- **157,000+ התרעות** היסטוריות מ-2019
- **עדכון חי** מ-API של פיקוד העורף
- **סינון מלא** — תאריך, יישוב (עם השלמה אוטומטית), סוג התרעה, מקור תקיפה
- **מבצעים** — סינון מהיר לפי מבצע (עם כלביא, שאגת הארי)
- **מפה אינטראקטיבית** — Leaflet עם הגדלה למסך מלא
- **ייצוא Excel** — לפי הפילטר הנבחר
- **פריסה**: Vercel + Neon Postgres

```bash
cd web
npm install
npx vercel link
npx vercel env pull
npm run dev
```

### 🖥️ גרסה מקומית (תיקיית שורש) — **הגרסה המקורית**

אפליקציית Python/Flask שרצה מקומית עם SQLite.

- שרת Flask על פורט 5050
- גישה ציבורית דרך Tailscale Funnel
- מתאימה להרצה מהמחשב הביתי

```bash
pip install -r requirements.txt
python3 oref_app.py
```

> הגרסה המקורית שמורה ב-branch `backup-main`.

---

## מקורות נתונים

| מקור | תוכן |
|------|-------|
| [yuval-harpaz/alarms](https://github.com/yuval-harpaz/alarms) | ארכיון CSV מ-2019 (157K+ רשומות) |
| `GetAlarmsHistory.aspx` | 3,000 ההתרעות האחרונות מפיקוד העורף |
| `Alerts.json` | התרעות פעילות כרגע |

---

ד״ר נועם קשת · [noamkeshet.com](https://noamkeshet.com) · keshet.noam@gmail.com
