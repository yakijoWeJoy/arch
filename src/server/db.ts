import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import fs from 'node:fs';
import path from 'node:path';

const meta = {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by'),
};

export const organizations = sqliteTable('organizations', {
  ...meta,
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  notes: text('notes'),
});

export const systems = sqliteTable('systems', {
  ...meta,
  organizationId: text('organization_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
});

export const hosting = sqliteTable('hosting_nodes', {
  ...meta,
  parentId: text('parent_id'),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  location: text('location'),
});

export const components = sqliteTable('components', {
  ...meta,
  systemId: text('system_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  technology: text('technology'),
  description: text('description'),
  hostingNodeId: text('hosting_node_id'),
  status: text('status').notNull(),
});

export const interfaces = sqliteTable('interfaces', {
  ...meta,
  componentId: text('component_id').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  method: text('method'),
  path: text('path'),
  queueName: text('queue_name'),
  cronExpr: text('cron_expr'),
  address: text('address'),
  status: text('status').notNull(),
});

export const scenarios = sqliteTable('scenarios', {
  ...meta,
  name: text('name').notNull(),
  description: text('description'),
  triggerInterfaceId: text('trigger_interface_id'),
  parentScenarioId: text('parent_scenario_id'),
  branchLabel: text('branch_label'),
});

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  scenarioId: text('scenario_id').notNull(),
  pos: integer('pos').notNull(),
  label: text('label').notNull(),
  kind: text('kind').notNull(),
  originStepId: text('origin_step_id'),
});

export const steps = sqliteTable('steps', {
  id: text('id').primaryKey(),
  scenarioId: text('scenario_id').notNull(),
  threadId: text('thread_id').notNull(),
  ord: integer('ord').notNull(),
  callerComponentId: text('caller_component_id').notNull(),
  interfaceId: text('interface_id').notNull(),
  action: text('action').notNull(),
  viaVipId: text('via_vip_id'),
  feedbackMode: text('feedback_mode'),
  note: text('note'),
});

export const tables = { organizations, systems, hosting, components, interfaces } as const;

const META_SQL = `id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT`;

/**
 * Schema DDL. Foreign keys cascade from container to contents; references that are
 * merely "pointing at" something (hosting, trigger, VIP) are set to NULL instead.
 * Steps referencing a deleted interface/component are blocked (RESTRICT) so that
 * nothing silently disappears from a scenario.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS organizations (${META_SQL}, name TEXT NOT NULL, kind TEXT NOT NULL, notes TEXT);
CREATE TABLE IF NOT EXISTS systems (${META_SQL},
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT);
CREATE TABLE IF NOT EXISTS hosting_nodes (${META_SQL},
  parent_id TEXT REFERENCES hosting_nodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, name TEXT NOT NULL, location TEXT);
CREATE TABLE IF NOT EXISTS components (${META_SQL},
  system_id TEXT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  name TEXT NOT NULL, kind TEXT NOT NULL, technology TEXT, description TEXT,
  hosting_node_id TEXT REFERENCES hosting_nodes(id) ON DELETE SET NULL,
  status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS interfaces (${META_SQL},
  component_id TEXT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, name TEXT NOT NULL, method TEXT, path TEXT, queue_name TEXT,
  cron_expr TEXT, address TEXT, status TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scenarios (${META_SQL},
  name TEXT NOT NULL, description TEXT,
  trigger_interface_id TEXT REFERENCES interfaces(id) ON DELETE SET NULL,
  parent_scenario_id TEXT REFERENCES scenarios(id) ON DELETE SET NULL,
  branch_label TEXT);
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL, origin_step_id TEXT);
CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  caller_component_id TEXT NOT NULL REFERENCES components(id) ON DELETE RESTRICT,
  interface_id TEXT NOT NULL REFERENCES interfaces(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  via_vip_id TEXT REFERENCES interfaces(id) ON DELETE SET NULL,
  feedback_mode TEXT, note TEXT);
CREATE INDEX IF NOT EXISTS steps_scenario ON steps(scenario_id);
CREATE INDEX IF NOT EXISTS threads_scenario ON threads(scenario_id);
`;

export type Db = BetterSQLite3Database<Record<string, never>> & { $client: Database.Database };

/** Opens (and creates if needed) the database. Pass ':memory:' for tests. */
export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(DDL);
  return drizzle(sqlite) as Db;
}
