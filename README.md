# Arch Modeler

כלי למידול ארכיטקטורה מבוסס תרחישים. הארכיטקט כותב **תרחישים (sequences)** — כל צעד הוא רכיב שקורא לממשק של רכיב אחר — והקטלוג, כרטיסי השירות ומפת הקשרים **נגזרים** מהצעדים.

- מסמך תכן: [`docs/superpowers/specs/2026-11-24-arch-modeler-design.md`](docs/superpowers/specs/2026-11-24-arch-modeler-design.md)
- תוכנית מימוש (פרוסה 1): [`docs/superpowers/plans/2026-11-24-arch-modeler-slice1.md`](docs/superpowers/plans/2026-11-24-arch-modeler-slice1.md)

## הרצה מקומית (פיתוח)

דרוש Node 22.

```bash
npm install
npm run seed     # נתוני דוגמה (רק על DB ריק)
npm run dev      # שרת על 8080 + Vite על http://localhost:5173
```

## הרצה בשרת (on-prem)

```bash
docker build -t arch-modeler .
docker run -d -p 8080:8080 -v arch-data:/app/data --name arch arch-modeler
```

או בלי Docker: `npm ci && npm run build && npm start` (ברירת מחדל: `data/arch.db`, פורט 8080; ניתן לשנות עם `DB_FILE`, `PORT`).

כל הנתונים נמצאים בקובץ SQLite יחיד — גיבוי = העתקת הקובץ. יצוא מלא ב-JSON: `GET /api/export/json`.
שני משתמשים עובדים על אותו שרת; עריכה מקבילה של אותו פריט מזוהה (409) והמשתמש מתבקש לטעון מחדש.

## מבנה

```
src/shared   סכמות (zod), גזירת הקשרים (derive.ts), נתוני דוגמה
src/server   Fastify + Drizzle + better-sqlite3
src/web      React (RTL): תרחישים, קטלוג, מפת קשרים
```

## בדיקות

```bash
npm test
```
