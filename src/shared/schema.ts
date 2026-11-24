import { z } from 'zod';

export const ORG_KINDS = ['ours', 'external'] as const;
export const HOSTING_KINDS = ['site', 'server', 'vm', 'k8s_cluster', 'namespace'] as const;
export const COMPONENT_KINDS = [
  'service',
  'database',
  'broker',
  'gateway',
  'batch',
  'load_balancer',
  'external',
] as const;
export const INTERFACE_KINDS = ['rest', 'soap', 'queue', 'cron', 'vip', 'db'] as const;
export const STATUSES = ['draft', 'confirmed'] as const;
export const THREAD_KINDS = ['main', 'async', 'feedback'] as const;
export const STEP_ACTIONS = ['call', 'publish', 'consume', 'callback'] as const;
export const FEEDBACK_MODES = ['reply_queue', 'rest_callback'] as const;

const id = z.string().min(1);
const optId = z.string().min(1).nullable().default(null);
const optText = z.string().nullable().default(null);

/** Fields every stored row carries. `updatedAt` is also the optimistic-lock token. */
const meta = {
  id,
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: optText,
};

export const organizationInput = z.object({
  name: z.string().min(1),
  kind: z.enum(ORG_KINDS).default('ours'),
  notes: optText,
});
export const organization = organizationInput.extend(meta);

export const systemInput = z.object({
  organizationId: id,
  name: z.string().min(1),
  description: optText,
});
export const system = systemInput.extend(meta);

export const hostingInput = z.object({
  parentId: optId,
  kind: z.enum(HOSTING_KINDS),
  name: z.string().min(1),
  location: z.enum(['on_prem', 'cloud']).nullable().default(null),
});
export const hostingNode = hostingInput.extend(meta);

export const componentInput = z.object({
  systemId: id,
  name: z.string().min(1),
  kind: z.enum(COMPONENT_KINDS).default('service'),
  technology: optText,
  description: optText,
  hostingNodeId: optId,
  status: z.enum(STATUSES).default('confirmed'),
});
export const component = componentInput.extend(meta);

export const interfaceInput = z.object({
  componentId: id,
  kind: z.enum(INTERFACE_KINDS),
  name: z.string().min(1),
  method: optText,
  path: optText,
  queueName: optText,
  cronExpr: optText,
  address: optText,
  status: z.enum(STATUSES).default('confirmed'),
});
export const iface = interfaceInput.extend(meta);

export const threadInput = z.object({
  id,
  label: z.string().min(1),
  kind: z.enum(THREAD_KINDS).default('main'),
  originStepId: optId,
});

export const stepInput = z.object({
  id,
  threadId: id,
  ord: z.number().int(),
  callerComponentId: id,
  interfaceId: id,
  action: z.enum(STEP_ACTIONS).default('call'),
  viaVipId: optId,
  feedbackMode: z.enum(FEEDBACK_MODES).nullable().default(null),
  note: optText,
});

export const scenarioInput = z.object({
  name: z.string().min(1),
  description: optText,
  triggerInterfaceId: optId,
  parentScenarioId: optId,
  branchLabel: optText,
  threads: z.array(threadInput).default([]),
  steps: z.array(stepInput).default([]),
});
export const scenario = scenarioInput.extend(meta);

export type Organization = z.infer<typeof organization>;
export type System = z.infer<typeof system>;
export type HostingNode = z.infer<typeof hostingNode>;
export type Component = z.infer<typeof component>;
export type Interface = z.infer<typeof iface>;
export type Thread = z.infer<typeof threadInput>;
export type Step = z.infer<typeof stepInput>;
export type Scenario = z.infer<typeof scenario>;
export type ScenarioInput = z.input<typeof scenarioInput>;

export type ComponentKind = (typeof COMPONENT_KINDS)[number];
export type InterfaceKind = (typeof INTERFACE_KINDS)[number];
export type StepAction = (typeof STEP_ACTIONS)[number];

export interface Model {
  organizations: Organization[];
  systems: System[];
  hosting: HostingNode[];
  components: Component[];
  interfaces: Interface[];
  scenarios: Scenario[];
}

/** Catalog entity collections exposed by the generic CRUD API. */
export const ENTITY_INPUTS = {
  organizations: organizationInput,
  systems: systemInput,
  hosting: hostingInput,
  components: componentInput,
  interfaces: interfaceInput,
} as const;
export type EntityName = keyof typeof ENTITY_INPUTS;

/** Short human label for an interface, e.g. "POST /orders" or "orders.created". */
export function interfaceLabel(i: Interface): string {
  switch (i.kind) {
    case 'rest':
    case 'soap':
      return [i.method, i.path].filter(Boolean).join(' ') || i.name;
    case 'queue':
      return i.queueName || i.name;
    case 'cron':
      return i.cronExpr ? `${i.name} (${i.cronExpr})` : i.name;
    case 'vip':
      return i.address ? `${i.name} ${i.address}` : i.name;
    case 'db':
      return i.name;
  }
}
