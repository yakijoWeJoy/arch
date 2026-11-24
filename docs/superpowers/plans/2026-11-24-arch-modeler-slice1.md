# תוכנית מימוש — פרוסה ראשונה (MVP)

מבוסס על: `docs/superpowers/specs/2026-11-24-arch-modeler-design.md`

**יעד:** קטלוג + עורך תרחיש שנשמרים ל־SQLite, ומפת קשרים נגזרת מהצעדים.

## משימות

1. **שלד פרויקט** — `package.json` יחיד, TypeScript, Vite (web), tsx (server בפיתוח), Vitest. סקריפטים: `dev`, `build`, `start`, `test`.
2. **shared** — `src/shared/schema.ts`: zod לכל ישות (Organization, System, HostingNode, Component, Interface, Scenario+Threads+Steps). `src/shared/derive.ts`: `deriveEdges(model, {layer, level})`, `componentUsage(model, componentId)`.
   - בדיקות: call פשוט, publish/consume דרך broker, VIP בשכבה לוגית מול פריסה, צבירה לרמת מערכת (קשתות פנימיות נעלמות), צבירת תרחישים לקשת.
3. **DB** — `src/server/db.ts`: Drizzle + better-sqlite3, יצירת טבלאות ב־startup (`CREATE TABLE IF NOT EXISTS`), FK + `ON DELETE`. 
4. **API** — `src/server/app.ts` (Fastify):
   - `GET /api/model` — כל המודל
   - `POST/PUT/DELETE /api/{organizations|systems|hosting|components|interfaces}`
   - `POST /api/scenarios`, `PUT /api/scenarios/:id` (תרחיש + threads + steps בטרנזקציה), `DELETE`
   - נעילה אופטימית: `updatedAt` בגוף ה־PUT ⇒ 409 אם לא תואם
   - `GET /api/export/json`
   - בדיקות API עם `inject` על DB בזיכרון.
5. **seed** — `npm run seed`: דוגמה קטנה בהשראת "שער עולמי" (gateway, 4 שירותים, RabbitMQ, DB, F5 עם 2 VIPs, מערכת חיצונית "מסוף נמל"), 2 תרחישים כולל async ו־feedback.
6. **web** — React + TanStack Query, RTL, ניווט: תרחישים | קטלוג | מפת קשרים.
   - **קטלוג**: עץ ארגון→מערכת→רכיב→ממשק, פילטר סוג/טיוטות, טפסי יצירה/עריכה/מחיקה, אישור טיוטה.
   - **עורך תרחיש**: רשימת תרחישים; טופס טריגר; צעדים מקובצים לפי thread; לכל צעד: קורא, פעולה, ממשק (חיפוש + "צור חדש" כטיוטה), VIP, feedback mode, הערה; הוספה/הזזה/מחיקה; "פתח thread חדש מצעד publish"; שמירה. דיאגרמת sequence SVG חיה.
   - **מפת קשרים**: @xyflow/react + dagre, מתגים רמה (system/container) ושכבה (לוגית/פריסה), פילטר תרחיש.
7. **שרת סטטי + Docker** — Fastify מגיש `dist/web`; `Dockerfile`; README עם הוראות הרצה.
8. **אימות** — `npm test`, `npm run build`, הרצה + צילום מסך ב־Playwright של שלושת המסכים.
9. **PR**.
