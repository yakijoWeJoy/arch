/**
 * Derivation: everything that is not a sequence step (relationship map, service
 * usage, C4 views) is computed from the steps here. Pure functions, no I/O.
 */
import { interfaceLabel, type Component, type Interface, type Model, type Scenario, type Step } from './schema';

export type Layer = 'logical' | 'deployment';
export type Level = 'container' | 'system';

export interface DeriveOptions {
  layer?: Layer;
  level?: Level;
  /** Restrict to steps of these scenarios. Empty/undefined = all scenarios. */
  scenarioIds?: string[];
}

export interface DerivedNode {
  id: string;
  name: string;
  /** Component kind at container level, 'system' / 'external_system' at system level. */
  kind: string;
  systemId: string | null;
  external: boolean;
}

export interface DerivedEdge {
  id: string;
  from: string;
  to: string;
  /** Distinct interface labels carried by this edge. */
  labels: string[];
  interfaceIds: string[];
  scenarioIds: string[];
  /** True when at least one contribution is a queue publish/consume. */
  async: boolean;
}

export interface DerivedGraph {
  nodes: DerivedNode[];
  edges: DerivedEdge[];
}

interface Segment {
  from: string; // component id
  to: string; // component id
  iface: Interface;
  scenarioId: string;
  async: boolean;
}

export interface Index {
  components: Map<string, Component>;
  interfaces: Map<string, Interface>;
  systems: Map<string, Model['systems'][number]>;
  orgs: Map<string, Model['organizations'][number]>;
}

export function indexModel(model: Model): Index {
  return {
    components: new Map(model.components.map((c) => [c.id, c])),
    interfaces: new Map(model.interfaces.map((i) => [i.id, i])),
    systems: new Map(model.systems.map((s) => [s.id, s])),
    orgs: new Map(model.organizations.map((o) => [o.id, o])),
  };
}

/** Component-to-component hops produced by a single step. */
export function stepSegments(step: Step, scenarioId: string, idx: Index, layer: Layer): Segment[] {
  const iface = idx.interfaces.get(step.interfaceId);
  if (!iface || !idx.components.has(step.callerComponentId)) return [];
  const caller = step.callerComponentId;
  const owner = iface.componentId;
  const async = step.action === 'publish' || step.action === 'consume';
  // Direction follows the data: a consumer receives from the broker that owns the queue.
  const [from, to] = step.action === 'consume' ? [owner, caller] : [caller, owner];

  const vip = step.viaVipId ? idx.interfaces.get(step.viaVipId) : undefined;
  if (layer === 'deployment' && vip && vip.componentId !== from && vip.componentId !== to) {
    return [
      { from, to: vip.componentId, iface, scenarioId, async },
      { from: vip.componentId, to, iface, scenarioId, async },
    ];
  }
  return [{ from, to, iface, scenarioId, async }];
}

function isExternal(c: Component, idx: Index): boolean {
  if (c.kind === 'external') return true;
  const sys = idx.systems.get(c.systemId);
  const org = sys ? idx.orgs.get(sys.organizationId) : undefined;
  return org?.kind === 'external';
}

export function deriveGraph(model: Model, opts: DeriveOptions = {}): DerivedGraph {
  const layer = opts.layer ?? 'logical';
  const level = opts.level ?? 'container';
  const idx = indexModel(model);
  const wanted = opts.scenarioIds?.length ? new Set(opts.scenarioIds) : null;

  const segments: Segment[] = [];
  for (const sc of model.scenarios) {
    if (wanted && !wanted.has(sc.id)) continue;
    for (const step of sc.steps) segments.push(...stepSegments(step, sc.id, idx, layer));
  }

  const nodeOf = (componentId: string): string | null => {
    if (level === 'container') return componentId;
    return idx.components.get(componentId)?.systemId ?? null;
  };

  const edges = new Map<string, DerivedEdge>();
  const used = new Set<string>();
  for (const s of segments) {
    const from = nodeOf(s.from);
    const to = nodeOf(s.to);
    if (!from || !to || from === to) continue;
    used.add(from);
    used.add(to);
    const key = `${from}->${to}`;
    let e = edges.get(key);
    if (!e) {
      e = { id: key, from, to, labels: [], interfaceIds: [], scenarioIds: [], async: false };
      edges.set(key, e);
    }
    const label = interfaceLabel(s.iface);
    if (!e.labels.includes(label)) e.labels.push(label);
    if (!e.interfaceIds.includes(s.iface.id)) e.interfaceIds.push(s.iface.id);
    if (!e.scenarioIds.includes(s.scenarioId)) e.scenarioIds.push(s.scenarioId);
    e.async ||= s.async;
  }

  const nodes: DerivedNode[] = [];
  if (level === 'container') {
    for (const id of used) {
      const c = idx.components.get(id)!;
      nodes.push({ id, name: c.name, kind: c.kind, systemId: c.systemId, external: isExternal(c, idx) });
    }
  } else {
    for (const id of used) {
      const sys = idx.systems.get(id)!;
      const external = idx.orgs.get(sys.organizationId)?.kind === 'external';
      nodes.push({ id, name: sys.name, kind: external ? 'external_system' : 'system', systemId: id, external });
    }
  }
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  return { nodes, edges: [...edges.values()] };
}

export interface ComponentUsage {
  /** Interfaces this component owns. */
  exposed: Interface[];
  /** Queues (owned by brokers) this component publishes to. */
  publishes: Interface[];
  /** Queues this component consumes from. */
  consumes: Interface[];
  /** Interfaces of other components this component calls (sync or callback). */
  calls: Interface[];
  /** Components that call/publish to this component's interfaces. */
  calledBy: Component[];
  scenarios: Scenario[];
}

export function componentUsage(model: Model, componentId: string): ComponentUsage {
  const idx = indexModel(model);
  const uniq = <T extends { id: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.id, x])).values()];
  const publishes: Interface[] = [];
  const consumes: Interface[] = [];
  const calls: Interface[] = [];
  const calledBy: Component[] = [];
  const scenarios: Scenario[] = [];

  for (const sc of model.scenarios) {
    let involved = sc.triggerInterfaceId
      ? idx.interfaces.get(sc.triggerInterfaceId)?.componentId === componentId
      : false;
    for (const st of sc.steps) {
      const iface = idx.interfaces.get(st.interfaceId);
      if (!iface) continue;
      const vipOwner = st.viaVipId ? idx.interfaces.get(st.viaVipId)?.componentId : undefined;
      if (st.callerComponentId === componentId) {
        involved = true;
        if (st.action === 'publish') publishes.push(iface);
        else if (st.action === 'consume') consumes.push(iface);
        else calls.push(iface);
      }
      if (iface.componentId === componentId || vipOwner === componentId) {
        involved = true;
        const caller = idx.components.get(st.callerComponentId);
        if (caller && caller.id !== componentId && iface.componentId === componentId) calledBy.push(caller);
      }
    }
    if (involved) scenarios.push(sc);
  }

  return {
    exposed: model.interfaces.filter((i) => i.componentId === componentId),
    publishes: uniq(publishes),
    consumes: uniq(consumes),
    calls: uniq(calls),
    calledBy: uniq(calledBy),
    scenarios,
  };
}

/** Participants of a scenario in order of first appearance (trigger owner first). */
export function scenarioParticipants(sc: Pick<Scenario, 'steps' | 'triggerInterfaceId' | 'threads'>, idx: Index): Component[] {
  const order: string[] = [];
  const add = (id: string | undefined | null) => {
    if (id && idx.components.has(id) && !order.includes(id)) order.push(id);
  };
  const steps = sortedSteps(sc);
  // The caller of the first step comes first: it is who receives the trigger.
  add(steps[0]?.callerComponentId);
  if (sc.triggerInterfaceId) add(idx.interfaces.get(sc.triggerInterfaceId)?.componentId);
  for (const st of steps) {
    const iface = idx.interfaces.get(st.interfaceId);
    const vip = st.viaVipId ? idx.interfaces.get(st.viaVipId) : undefined;
    if (st.action === 'consume') {
      add(iface?.componentId);
      add(st.callerComponentId);
    } else {
      add(st.callerComponentId);
      add(vip?.componentId);
      add(iface?.componentId);
    }
  }
  return order.map((id) => idx.components.get(id)!);
}

/** Steps ordered by thread order (as listed on the scenario) and then by `ord`. */
export function sortedSteps(sc: Pick<Scenario, 'steps' | 'threads'>): Step[] {
  const tOrder = new Map(sc.threads.map((t, i) => [t.id, i]));
  return [...sc.steps].sort(
    (a, b) => (tOrder.get(a.threadId) ?? 99) - (tOrder.get(b.threadId) ?? 99) || a.ord - b.ord,
  );
}
