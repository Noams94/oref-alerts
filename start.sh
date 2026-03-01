#!/bin/bash
# פיקוד העורף — הפעלת מערכת הניטור
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🛡️  מפעיל מערכת ניטור פיקוד העורף..."
echo "   תיקייה: $DIR"
echo "   כתובת:  http://localhost:5050"
echo "   לעצירה: Ctrl+C"
echo ""

# סגור שרת ישן אם קיים
OLD_PID=$(lsof -ti :5050 2>/dev/null)
if [ -n "$OLD_PID" ]; then
  echo "   סוגר תהליך ישן (PID $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null
  sleep 1
fi

cd "$DIR"
python3 oref_app.py
