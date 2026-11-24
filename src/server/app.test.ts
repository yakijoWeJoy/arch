import { beforeEach, describe, expect, it } from 'vitest';
import { deriveGraph } from '../shared/derive';
import { sampleModel } from '../shared/sample';
import type { Model } from '../shared/schema';
import { buildApp } from './app';
import { openDb } from './db';
import { importModel } from './repo';

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  const db = openDb(':memory:');
  importModel(db, sampleModel());
  app = buildApp({ db });
});

const req = async (method: string, url: string, body?: unknown, user = 'dana') => {
  const res = await app.inject({ method: method as any, url, payload: body as any, headers: { 'x-user': encodeURIComponent(user) } });
  return { status: res.statusCode, body: res.body ? res.json() : undefined };
};

describe('API', () => {
  it('round-trips the sample model', async () => {
    const { status, body } = await req('GET', '/api/model');
    expect(status).toBe(200);
    const model = body as Model;
    const sample = sampleModel();
    expect(model.components).toHaveLength(sample.components.length);
    const submit = model.scenarios.find((s) => s.id === 'sc-submit')!;
    expect(submit.threads.map((t) => t.label)).toEqual(['A', 'B', 'C']);
    expect(submit.steps).toHaveLength(7);
    expect(model.scenarios.find((s) => s.id === 'sc-reject')!.parentScenarioId).toBe('sc-submit');
    // derivation over the stored model equals derivation over the sample
    expect(deriveGraph(model).edges.length).toBe(deriveGraph(sample).edges.length);
  });

  it('creates an inline draft interface and uses it in a new scenario step', async () => {
    const draft = await req('POST', '/api/interfaces', {
      componentId: 'c-pay', kind: 'rest', name: 'refund', method: 'POST', path: '/api/refunds', status: 'draft',
    });
    expect(draft.status).toBe(201);
    expect(draft.body.updatedBy).toBe('dana');

    const sc = await req('POST', '/api/scenarios', {
      name: 'החזר כספי',
      threads: [{ id: 'x-a', label: 'A', kind: 'main' }],
      steps: [{ id: 'x-1', threadId: 'x-a', ord: 1, callerComponentId: 'c-decl', interfaceId: draft.body.id, action: 'call' }],
    });
    expect(sc.status).toBe(201);
    const model = (await req('GET', '/api/model')).body as Model;
    const g = deriveGraph(model);
    expect(g.edges.find((e) => e.from === 'c-decl' && e.to === 'c-pay')?.labels).toEqual(['POST /api/refunds']);
  });

  it('replaces threads and steps on scenario update', async () => {
    const before = (await req('GET', '/api/model')).body as Model;
    const sc = before.scenarios.find((s) => s.id === 'sc-reconcile')!;
    const res = await req('PUT', '/api/scenarios/sc-reconcile', { ...sc, steps: sc.steps.slice(0, 1) });
    expect(res.status).toBe(200);
    expect(res.body.steps).toHaveLength(1);
    expect(res.body.updatedBy).toBe('dana');
  });

  it('rejects stale updates with 409 (optimistic lock)', async () => {
    const model = (await req('GET', '/api/model')).body as Model;
    const c = model.components.find((x) => x.id === 'c-risk')!;
    const first = await req('PUT', '/api/components/c-risk', { ...c, technology: 'Kotlin' }, 'dana');
    expect(first.status).toBe(200);
    const second = await req('PUT', '/api/components/c-risk', { ...c, technology: 'Go' }, 'yossi');
    expect(second.status).toBe(409);
    expect(second.body.error).toContain('dana');

    const sc = model.scenarios[0];
    expect((await req('PUT', `/api/scenarios/${sc.id}`, sc)).status).toBe(200);
    expect((await req('PUT', `/api/scenarios/${sc.id}`, sc)).status).toBe(409);
  });

  it('refuses to delete an interface used by a step', async () => {
    const res = await req('DELETE', '/api/interfaces/i-q-submitted');
    expect(res.status).toBe(409);
    // an unused one can be deleted
    const created = await req('POST', '/api/interfaces', { componentId: 'c-mq', kind: 'queue', name: 'tmp', queueName: 'tmp' });
    expect((await req('DELETE', `/api/interfaces/${created.body.id}`)).status).toBe(204);
  });

  it('validates input', async () => {
    expect((await req('POST', '/api/components', { name: 'x' })).status).toBe(400);
    expect((await req('POST', '/api/nope', {})).status).toBe(404);
    const bad = await req('POST', '/api/scenarios', {
      name: 'x', threads: [], steps: [{ id: 's', threadId: 'missing', ord: 1, callerComponentId: 'c-gw', interfaceId: 'i-gw-post' }],
    });
    expect(bad.status).toBe(400);
    const missingFk = await req('POST', '/api/systems', { organizationId: 'nope', name: 'x' });
    expect(missingFk.status).toBe(409);
  });

  it('deleting a scenario removes its steps from the derived map', async () => {
    expect((await req('DELETE', '/api/scenarios/sc-reconcile')).status).toBe(204);
    const g = deriveGraph((await req('GET', '/api/model')).body as Model);
    expect(g.edges.find((e) => e.from === 'c-pay')).toBeUndefined();
  });
});
