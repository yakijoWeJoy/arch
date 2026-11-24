import { asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import {
  ENTITY_INPUTS,
  scenarioInput,
  type EntityName,
  type Model,
  type Scenario,
} from '../shared/schema';
import { scenarios, steps, tables, threads, type Db } from './db';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const now = () => new Date().toISOString();

export function loadModel(db: Db): Model {
  const scenarioRows = db.select().from(scenarios).orderBy(asc(scenarios.name)).all();
  const threadRows = db.select().from(threads).orderBy(asc(threads.pos)).all();
  const stepRows = db.select().from(steps).orderBy(asc(steps.ord)).all();
  return {
    organizations: db.select().from(tables.organizations).orderBy(asc(tables.organizations.name)).all() as Model['organizations'],
    systems: db.select().from(tables.systems).orderBy(asc(tables.systems.name)).all() as Model['systems'],
    hosting: db.select().from(tables.hosting).orderBy(asc(tables.hosting.name)).all() as Model['hosting'],
    components: db.select().from(tables.components).orderBy(asc(tables.components.name)).all() as Model['components'],
    interfaces: db.select().from(tables.interfaces).orderBy(asc(tables.interfaces.name)).all() as Model['interfaces'],
    scenarios: scenarioRows.map((s) => ({
      ...s,
      threads: threadRows
        .filter((t) => t.scenarioId === s.id)
        .map(({ id, label, kind, originStepId }) => ({ id, label, kind, originStepId })),
      steps: stepRows.filter((st) => st.scenarioId === s.id).map(({ scenarioId: _s, ...rest }) => rest),
    })) as Model['scenarios'],
  };
}

function parse<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, 'invalid input', r.error.issues);
  return r.data;
}

/** Translates SQLite constraint errors into user-facing HTTP errors. */
function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    // RESTRICT violations surface as SQLITE_CONSTRAINT_TRIGGER; drizzle may wrap the driver error in `cause`.
    const msg = `${e?.message} ${e?.cause?.message}`;
    if (msg.includes('FOREIGN KEY constraint failed')) {
      throw new HttpError(409, 'הפריט מקושר לפריטים אחרים (למשל צעדים בתרחיש) ולא ניתן למחוק/לשמור אותו');
    }
    throw e;
  }
}

function checkVersion(current: { updatedAt: string; updatedBy: string | null } | undefined, expected: unknown) {
  if (!current) throw new HttpError(404, 'not found');
  if (typeof expected === 'string' && expected !== current.updatedAt) {
    throw new HttpError(409, `הפריט נערך בינתיים${current.updatedBy ? ` ע"י ${current.updatedBy}` : ''} — טען מחדש`, {
      updatedAt: current.updatedAt,
      updatedBy: current.updatedBy,
    });
  }
}

export function createEntity(db: Db, entity: EntityName, body: unknown, user: string | null) {
  const data = parse(ENTITY_INPUTS[entity], body);
  const t = now();
  const row = { ...data, id: randomUUID(), createdAt: t, updatedAt: t, updatedBy: user };
  guard(() => db.insert(tables[entity]).values(row as any).run());
  return row;
}

export function updateEntity(db: Db, entity: EntityName, id: string, body: any, user: string | null) {
  const table = tables[entity] as any;
  const current = db.select().from(table).where(eq(table.id, id)).get() as any;
  checkVersion(current, body?.updatedAt);
  const data = parse(ENTITY_INPUTS[entity], body);
  const row = { ...data, id, createdAt: current.createdAt, updatedAt: now(), updatedBy: user };
  guard(() => db.update(table).set(row).where(eq(table.id, id)).run());
  return row;
}

export function deleteEntity(db: Db, entity: EntityName, id: string) {
  const table = tables[entity] as any;
  const res = guard(() => db.delete(table).where(eq(table.id, id)).run());
  if (res.changes === 0) throw new HttpError(404, 'not found');
}

function validateScenarioShape(data: ReturnType<typeof scenarioInput.parse>) {
  const threadIds = new Set(data.threads.map((t) => t.id));
  for (const st of data.steps) {
    if (!threadIds.has(st.threadId)) throw new HttpError(400, `step ${st.id} references unknown thread ${st.threadId}`);
  }
}

function writeScenarioChildren(db: Db, scenarioId: string, data: ReturnType<typeof scenarioInput.parse>) {
  db.delete(steps).where(eq(steps.scenarioId, scenarioId)).run();
  db.delete(threads).where(eq(threads.scenarioId, scenarioId)).run();
  if (data.threads.length) {
    db.insert(threads).values(data.threads.map((t, pos) => ({ ...t, scenarioId, pos }))).run();
  }
  if (data.steps.length) {
    db.insert(steps).values(data.steps.map((st) => ({ ...st, scenarioId }))).run();
  }
}

export function getScenario(db: Db, id: string): Scenario {
  const sc = loadModel(db).scenarios.find((s) => s.id === id);
  if (!sc) throw new HttpError(404, 'not found');
  return sc;
}

export function createScenario(db: Db, body: unknown, user: string | null): Scenario {
  const data = parse(scenarioInput, body);
  validateScenarioShape(data);
  const t = now();
  const id = randomUUID();
  const { threads: _t, steps: _s, ...head } = data;
  guard(() =>
    db.transaction((tx) => {
      tx.insert(scenarios).values({ ...head, id, createdAt: t, updatedAt: t, updatedBy: user }).run();
      writeScenarioChildren(tx as unknown as Db, id, data);
    }),
  );
  return getScenario(db, id);
}

/** Replaces the scenario with its threads and steps in one transaction. */
export function updateScenario(db: Db, id: string, body: any, user: string | null): Scenario {
  const data = parse(scenarioInput, body);
  validateScenarioShape(data);
  const { threads: _t, steps: _s, ...head } = data;
  guard(() =>
    db.transaction((tx) => {
      const current = tx.select().from(scenarios).where(eq(scenarios.id, id)).get();
      checkVersion(current, body?.updatedAt);
      if (head.parentScenarioId === id) throw new HttpError(400, 'scenario cannot be its own parent');
      tx.update(scenarios).set({ ...head, updatedAt: now(), updatedBy: user }).where(eq(scenarios.id, id)).run();
      writeScenarioChildren(tx as unknown as Db, id, data);
    }),
  );
  return getScenario(db, id);
}

export function deleteScenario(db: Db, id: string) {
  const res = db.delete(scenarios).where(eq(scenarios.id, id)).run();
  if (res.changes === 0) throw new HttpError(404, 'not found');
}

/** Inserts a whole model as-is (ids preserved). Used by seed and JSON import. */
export function importModel(db: Db, model: Model) {
  db.transaction((tx) => {
    for (const name of ['organizations', 'systems', 'hosting', 'components', 'interfaces'] as const) {
      const rows = model[name];
      // hosting nodes reference each other: insert parents first
      const ordered = name === 'hosting' ? topo(rows as Model['hosting']) : rows;
      for (const row of ordered) tx.insert(tables[name]).values(row as any).run();
    }
    // scenarios may reference parents: insert heads first without parent, then patch
    for (const sc of model.scenarios) {
      const { threads: _t, steps: _s, ...head } = sc;
      tx.insert(scenarios).values({ ...head, parentScenarioId: null }).run();
    }
    for (const sc of model.scenarios) {
      if (sc.parentScenarioId) tx.update(scenarios).set({ parentScenarioId: sc.parentScenarioId }).where(eq(scenarios.id, sc.id)).run();
      writeScenarioChildren(tx as unknown as Db, sc.id, sc);
    }
  });
}

function topo(rows: Model['hosting']): Model['hosting'] {
  const out: Model['hosting'] = [];
  const done = new Set<string>();
  const visit = (r: Model['hosting'][number]) => {
    if (done.has(r.id)) return;
    const parent = r.parentId ? rows.find((x) => x.id === r.parentId) : undefined;
    if (parent) visit(parent);
    done.add(r.id);
    out.push(r);
  };
  rows.forEach(visit);
  return out;
}

export function isEmpty(db: Db): boolean {
  return db.select().from(tables.organizations).limit(1).all().length === 0;
}
