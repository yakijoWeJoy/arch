# Arch Modeler — מסמך תכן

תאריך: 2026-11-24 · סטטוס: מאושר

## 1. מטרה

כלי גנרי לארכיטקטים למידול ארכיטקטורה של מערכת. הנתונים האמיתיים הראשונים: המערכת "שער עולמי" (~50 מיקרו־שירותים).

**עיקרון מנחה:** הארכיטקט כותב **תרחישים (sequences)**. כל צעד = רכיב קורא שמשתמש בממשק של רכיב אחר. משתתפים וממשקים נבחרים מהקטלוג או נוצרים inline (נשמרים כטיוטה). **הקטלוג, מפת הקשרים ודיאגרמות C4 נגזרים מהצעדים** — אף פעם לא מצוירים בנפרד.

## 2. החלטות שהתקבלו

| נושא | החלטה |
|---|---|
| Stack | TypeScript מלא: React + Vite בצד לקוח, Node (Fastify) בצד שרת, Drizzle ORM |
| אחסון | SQLite (קובץ אחד על השרת), משותף לשני המשתמשים. מעבר ל־PostgreSQL אפשרי בהמשך דרך Drizzle |
| עורך sequence | רשימת צעדים מובנית (טופס לכל צעד) + דיאגרמת sequence חיה לצידה |
| פריסה | קונטיינר Docker יחיד, on-prem, ללא תלות בענן או בשירותים חיצוניים |
| RabbitMQ | ה־broker הוא משתתף גלוי בתרחיש |
| אסינכרוני | הודעה אסינכרונית פותחת thread חדש; feedback לשולח הוא thread משלו |
| Feedback | דרך reply queue **או** REST callback — אותו סימון ויזואלי |
| REST/SOAP | method + path בלבד |
| תורים | שם התור בלבד (בלי exchange/routing key) |
| F5 | מתווך: כל צעד יכול לעבור דרך VIP של F5; כל VIP הוא פריט בקטלוג |
| הסתעפויות | כל חלופה = תרחיש נפרד ומקושר (אין alt/opt בתוך תרחיש) |
| היקף | PROD בלבד, ללא סביבות, ללא גרסאות |
| משתמשים | שניים, ללא ניהול הרשאות, נתונים משותפים |

## 3. מודל נתונים

```
Organization (ours | external)
 └─ System                       ← C4 Software System
     └─ Component                ← C4 Container: service | database | broker | gateway | batch | load_balancer | external
         └─ Interface            ← rest | soap | queue | cron | vip | db
Hosting (עץ): site(on-prem|cloud) → server | vm | k8s_cluster → namespace
Component.hosting_id → Hosting
Scenario ── Thread(A,B,C…) ── Step
```

### טבלאות

- **organizations**: `id, name, kind('ours'|'external'), notes`
- **systems**: `id, organization_id, name, description`
- **hosting_nodes**: `id, parent_id?, kind('site'|'server'|'vm'|'k8s_cluster'|'namespace'), name, location('on_prem'|'cloud')?`
- **components**: `id, system_id, name, kind, technology, description, hosting_node_id?, status('draft'|'confirmed')`
- **interfaces**: `id, component_id, kind, name, method?, path?, queue_name?, cron_expr?, address?, status`
  - `rest`/`soap`: method + path
  - `queue`: queue_name — **התור שייך לרכיב ה־broker**
  - `cron`: cron_expr — שייך לרכיב שמתוזמן
  - `vip`: address — שייך לרכיב F5 (`kind='load_balancer'`); כל VIP הוא ממשק נפרד ⇒ פריט קטלוג
  - `db`: שם סכמה/טבלה — שייך לרכיב database (כדי שגישה ל־DB תופיע כצעד)
- **scenarios**: `id, name, description, trigger_interface_id?, parent_scenario_id?, branch_label?`
  - הטריגר הוא ממשק (REST/SOAP נכנס, תור, או cron). תרחיש חלופי מצביע על תרחיש האב + תווית התנאי ("אם הנמל דחה").
- **threads**: `id, scenario_id, label('A','B'…), kind('main'|'async'|'feedback'), origin_step_id?`
- **steps**: `id, scenario_id, thread_id, ord, caller_component_id, interface_id, action, via_vip_id?, feedback_mode?, note`
  - `action`: `call` (סינכרוני), `publish` (שליחה לתור), `consume` (צריכה מתור), `callback` (REST חוזר לשולח)
  - `via_vip_id`: ממשק VIP של F5 שהצעד עובר דרכו (אופציונלי)
  - `feedback_mode`: `reply_queue` | `rest_callback` — לצעדים ב־thread מסוג feedback

כל טבלה כוללת `created_at, updated_at, updated_by`.

### כללי threads
- `publish` בצעד ב־thread X ⇒ המערכת מציעה לפתוח thread חדש (B) שמתחיל בצעד `consume` של אותו תור.
- thread מסוג `feedback` מוצג בצבע/סגנון ייחודי; ה־feedback יכול להיות `publish` ל־reply queue או `callback` REST.

## 4. גזירה (Derivation) — הלב של הכלי

פונקציה טהורה ב־`src/shared/derive.ts`, ללא תלות ב־DB, מכוסה בבדיקות:

**קלט:** components, interfaces, systems, steps. **פלט:** קשתות מצטברות.

לכל צעד:
- `owner = interface.component`
- `call`/`callback`: קשת `caller → owner`, תווית `METHOD path`
- `publish`: קשת `caller → broker` (תווית: שם התור)
- `consume`: קשת `broker → caller` (תווית: שם התור)
- עם `via_vip`:
  - **שכבה לוגית** — ה־F5 שקוף: `caller → owner`
  - **שכבת פריסה** — `caller → F5 → owner`

הקשתות מצטברות לפי `(from, to)` עם רשימת ממשקים ותרחישים שבהם הן מופיעות. **רמת מערכת**: אותן קשתות מקובצות לפי `system_id` (קשתות פנימיות למערכת נעלמות). זה מזין את מפת הקשרים, את כרטיס השירות ("תרחישים שבהם מופיע", "תורים נשלחים/נצרכים") ואת יצוא C4.

## 5. מסכים (לפי המוקאפים)

1. **עורך תרחיש** — משמאל/ימין (RTL): רשימת צעדים לפי threads A/B/C; כל צעד: קורא, ממשק (combobox עם חיפוש בקטלוג + "צור חדש" ⇒ טיוטה), פעולה, "עובר דרך F5". Inspector לצעד הנבחר. דיאגרמת sequence ב־SVG מותאם (React) שמתעדכנת חיה: משתתפים לפי סדר הופעה, צבע לכל thread, סמן F5 על החץ, סגנון feedback.
2. **קטלוג** — עץ Organization → System → Component → Interface, פילטרים (סוג, סטטוס טיוטה, hosting), עריכה.
3. **כרטיס שירות** — ממשקים חשופים, תורים נשלחים/נצרכים, cron, hosting, תרחישים שבהם מופיע (הכל נגזר).
4. **מפת קשרים** — גרף נגזר, רמת system/container, שכבה לוגית/פריסה. ציור עם `@xyflow/react` + פריסה אוטומטית `dagre`.
5. **יצוא C4** — Context, Container, Deployment, Dynamic (לתרחיש) כ־PPTX (`pptxgenjs`) ו־diagram-as-code (Structurizr DSL, PlantUML C4, Mermaid).

ממשק בעברית, `dir="rtl"`. דיאגרמות עצמן בכיוון LTR (שמות טכניים באנגלית).

## 6. ארכיטקטורה טכנית

```
arch/
  src/shared/   טיפוסים (zod schemas), derive.ts, export generators
  src/server/   Fastify: REST API (/api/...), Drizzle + better-sqlite3, מגיש את ה־SPA הבנוי
  src/web/      React + Vite + TanStack Query
  data/         קובץ SQLite (volume ב־Docker)
```

- **API**: CRUD ל־organizations / systems / components / interfaces / hosting / scenarios; `PUT /api/scenarios/:id` שומר את התרחיש עם threads ו־steps בטרנזקציה אחת; `GET /api/model` מחזיר את כל המודל (קטן — מאות רשומות) והלקוח מריץ את הגזירה בעצמו.
- **ולידציה**: zod משותף לשרת וללקוח.
- **שיתוף בין שני משתמשים**: נעילה אופטימית — כל עדכון שולח `updated_at` שנקרא; אם השתנה בינתיים ⇒ 409 והודעה "נערך ע"י X, טען מחדש". שם המשתמש נבחר פעם אחת ונשמר בדפדפן (לשדה `updated_by`), ללא סיסמה.
- **גיבוי**: העתקת קובץ ה־SQLite; בנוסף `GET /api/export/json` ליצוא/ייבוא מלא.
- **פריסה**: `Dockerfile` רב־שלבי, `docker run -p 8080:8080 -v arch-data:/app/data`. אפשר גם `npm start` ישירות על שרת עם Node 22.
- **בדיקות**: Vitest ל־derive ול־API (Fastify `inject` על DB זמני).

## 7. שלבי מימוש

1. **פרוסה ראשונה (MVP)** — שלד הפרויקט, DB + מיגרציות, API, קטלוג (עץ + עריכה + טיוטות), עורך תרחיש עם threads ו־F5 ודיאגרמת sequence חיה, מפת קשרים נגזרת (לוגית, container/system). נתוני דוגמה.
2. כרטיס שירות, hosting מלא ושכבת פריסה במפה, תרחישים חלופיים מקושרים.
3. יצוא diagram-as-code (Structurizr / PlantUML / Mermaid).
4. יצוא PPTX של C4 (Context, Container, Deployment, Dynamic).
5. ייבוא ראשוני של "שער עולמי" (CSV/JSON של שירותים ותורים, אם יש מקור).

## 8. מחוץ להיקף

הרשאות/התחברות, סביבות (DEV/TEST), גרסאות והיסטוריה, עריכה בזמן־אמת משותפת (שני משתמשים — נעילה אופטימית מספיקה), alt/opt בתוך תרחיש.

## 9. סיכונים

- **SQLite על דיסק רשת** — לשמור את הקובץ על דיסק מקומי של השרת.
- **מפה עמוסה עם 50+ שירותים** — פילטר לפי מערכת/תרחיש/שכן, ורמת system כברירת מחדל.
- **גישה ל־npm ב־on-prem** — התמונה נבנית מראש; בריצה אין תלות ברשת.
