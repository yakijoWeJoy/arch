import { describe, expect, it } from 'vitest';
import { componentUsage, deriveGraph, indexModel, scenarioParticipants } from './derive';
import { sampleModel } from './sample';

const edge = (g: ReturnType<typeof deriveGraph>, from: string, to: string) => g.edges.find((e) => e.from === from && e.to === to);

describe('deriveGraph — container level', () => {
  const model = sampleModel();

  it('turns a sync call into caller → interface owner', () => {
    const g = deriveGraph(model);
    const e = edge(g, 'c-decl', 'c-db');
    expect(e?.labels).toEqual(['DECLARATIONS']);
    expect(e?.async).toBe(false);
  });

  it('routes queues through the broker: publisher → broker → consumer', () => {
    const g = deriveGraph(model);
    expect(edge(g, 'c-decl', 'c-mq')?.labels).toContain('declarations.submitted');
    expect(edge(g, 'c-mq', 'c-risk')?.labels).toContain('declarations.submitted');
    expect(edge(g, 'c-mq', 'c-risk')?.async).toBe(true);
    // feedback via reply queue
    expect(edge(g, 'c-risk', 'c-mq')?.labels).toContain('risk.results');
    expect(edge(g, 'c-mq', 'c-decl')?.labels).toContain('risk.results');
    // no direct publisher → consumer edge
    expect(edge(g, 'c-decl', 'c-risk')).toBeUndefined();
  });

  it('hides F5 in the logical layer', () => {
    const g = deriveGraph(model, { layer: 'logical' });
    expect(edge(g, 'c-gw', 'c-decl')?.labels).toEqual(['POST /api/declarations']);
    expect(g.nodes.find((n) => n.id === 'c-f5')).toBeUndefined();
  });

  it('shows F5 hops in the deployment layer', () => {
    const g = deriveGraph(model, { layer: 'deployment' });
    expect(edge(g, 'c-gw', 'c-decl')).toBeUndefined();
    expect(edge(g, 'c-gw', 'c-f5')).toBeDefined();
    expect(edge(g, 'c-f5', 'c-decl')).toBeDefined();
    expect(edge(g, 'c-f5', 'c-port')?.labels).toEqual(['GET /manifests/{id}']);
  });

  it('aggregates scenarios and interfaces on one edge', () => {
    const g = deriveGraph(model);
    const e = edge(g, 'c-risk', 'c-decl'); // REST callback in the alternative scenario
    expect(e?.scenarioIds).toEqual(['sc-reject']);
    const notif = edge(g, 'c-pay', 'c-notif');
    expect(notif?.scenarioIds).toEqual(['sc-reconcile']);
    const db = deriveGraph(model).edges.filter((x) => x.to === 'c-db');
    expect(db.map((x) => x.from).sort()).toEqual(['c-decl', 'c-pay']);
  });

  it('filters by scenario', () => {
    const g = deriveGraph(model, { scenarioIds: ['sc-reconcile'] });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['c-db', 'c-notif', 'c-pay']);
  });

  it('marks external components', () => {
    const g = deriveGraph(model);
    expect(g.nodes.find((n) => n.id === 'c-port')?.external).toBe(true);
    expect(g.nodes.find((n) => n.id === 'c-decl')?.external).toBe(false);
  });
});

describe('deriveGraph — system level', () => {
  it('collapses components into systems and drops internal edges', () => {
    const g = deriveGraph(sampleModel(), { level: 'system' });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['sys-gw', 'sys-port']);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({ from: 'sys-gw', to: 'sys-port', labels: ['GET /manifests/{id}'] });
    expect(g.nodes.find((n) => n.id === 'sys-port')?.kind).toBe('external_system');
  });

  it('includes the network system in the deployment layer', () => {
    const g = deriveGraph(sampleModel(), { level: 'system', layer: 'deployment' });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['sys-gw', 'sys-net', 'sys-port']);
    expect(edge(g, 'sys-gw', 'sys-net')).toBeDefined();
    expect(edge(g, 'sys-net', 'sys-port')).toBeDefined();
    expect(edge(g, 'sys-net', 'sys-gw')).toBeDefined();
  });
});

describe('componentUsage', () => {
  it('derives the service card of risk-service', () => {
    const u = componentUsage(sampleModel(), 'c-risk');
    expect(u.consumes.map((i) => i.id)).toEqual(['i-q-submitted']);
    expect(u.publishes.map((i) => i.id)).toEqual(['i-q-risk']);
    expect(u.calls.map((i) => i.id).sort()).toEqual(['i-decl-reject', 'i-port-manifest']);
    expect(u.scenarios.map((s) => s.id)).toEqual(['sc-submit', 'sc-reject']);
  });

  it('lists callers and trigger scenarios', () => {
    const notif = componentUsage(sampleModel(), 'c-notif');
    expect(notif.calledBy.map((c) => c.id).sort()).toEqual(['c-decl', 'c-pay']);
    const pay = componentUsage(sampleModel(), 'c-pay');
    expect(pay.exposed.map((i) => i.id)).toEqual(['i-pay-cron']);
    expect(pay.scenarios.map((s) => s.id)).toEqual(['sc-reconcile']);
  });

  it('counts an F5 as involved when a step passes through its VIP', () => {
    const f5 = componentUsage(sampleModel(), 'c-f5');
    expect(f5.scenarios.map((s) => s.id)).toEqual(['sc-submit', 'sc-reject']);
  });
});

describe('scenarioParticipants', () => {
  it('orders participants by first appearance, F5 before the target', () => {
    const model = sampleModel();
    const p = scenarioParticipants(model.scenarios[0], indexModel(model)).map((c) => c.id);
    expect(p).toEqual(['c-gw', 'c-f5', 'c-decl', 'c-db', 'c-mq', 'c-risk', 'c-port']);
  });
});
