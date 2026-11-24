/**
 * A small sample model inspired by "שער עולמי". Used by tests and by `npm run seed`.
 * Names are illustrative only.
 */
import type { Model } from './schema';

const T = '2026-11-24T00:00:00.000Z';
const m = { createdAt: T, updatedAt: T, updatedBy: 'seed' };

const org = (id: string, name: string, kind: 'ours' | 'external') => ({ id, name, kind, notes: null, ...m });
const sys = (id: string, organizationId: string, name: string) => ({ id, organizationId, name, description: null, ...m });
const host = (id: string, parentId: string | null, kind: Model['hosting'][number]['kind'], name: string, location: 'on_prem' | 'cloud' | null = null) =>
  ({ id, parentId, kind, name, location, ...m });
const comp = (id: string, systemId: string, name: string, kind: Model['components'][number]['kind'], technology: string | null, hostingNodeId: string | null = null) =>
  ({ id, systemId, name, kind, technology, description: null, hostingNodeId, status: 'confirmed' as const, ...m });
const ifc = (id: string, componentId: string, kind: Model['interfaces'][number]['kind'], name: string, extra: Partial<Model['interfaces'][number]> = {}) =>
  ({ id, componentId, kind, name, method: null, path: null, queueName: null, cronExpr: null, address: null, status: 'confirmed' as const, ...m, ...extra });
const step = (id: string, threadId: string, ord: number, callerComponentId: string, interfaceId: string, action: Model['scenarios'][number]['steps'][number]['action'], extra: Partial<Model['scenarios'][number]['steps'][number]> = {}) =>
  ({ id, threadId, ord, callerComponentId, interfaceId, action, viaVipId: null, feedbackMode: null, note: null, ...extra });

export function sampleModel(): Model {
  return {
    organizations: [org('org-ours', 'הארגון שלנו', 'ours'), org('org-port', 'מסוף נמל', 'external')],
    systems: [
      sys('sys-gw', 'org-ours', 'שער עולמי'),
      sys('sys-net', 'org-ours', 'תשתית רשת'),
      sys('sys-port', 'org-port', 'מערכת מסוף נמל'),
    ],
    hosting: [
      host('h-dc', null, 'site', 'DC ראשי', 'on_prem'),
      host('h-k8s', 'h-dc', 'k8s_cluster', 'prod-cluster-1'),
      host('h-ns', 'h-k8s', 'namespace', 'world-gate'),
      host('h-vm-mq', 'h-dc', 'vm', 'mq-vm-01'),
    ],
    components: [
      comp('c-gw', 'sys-gw', 'api-gateway', 'gateway', 'Kong', 'h-ns'),
      comp('c-decl', 'sys-gw', 'declaration-service', 'service', 'Java / Spring', 'h-ns'),
      comp('c-risk', 'sys-gw', 'risk-service', 'service', 'Java / Spring', 'h-ns'),
      comp('c-pay', 'sys-gw', 'payment-service', 'service', '.NET', 'h-ns'),
      comp('c-notif', 'sys-gw', 'notification-service', 'service', 'Node.js', 'h-ns'),
      comp('c-mq', 'sys-gw', 'rabbitmq', 'broker', 'RabbitMQ', 'h-vm-mq'),
      comp('c-db', 'sys-gw', 'declarations-db', 'database', 'Oracle'),
      comp('c-f5', 'sys-net', 'F5', 'load_balancer', 'F5 BIG-IP'),
      comp('c-port', 'sys-port', 'port-terminal-api', 'external', 'REST'),
    ],
    interfaces: [
      ifc('i-gw-post', 'c-gw', 'rest', 'submit declaration', { method: 'POST', path: '/declarations' }),
      ifc('i-decl-post', 'c-decl', 'rest', 'create declaration', { method: 'POST', path: '/api/declarations' }),
      ifc('i-decl-reject', 'c-decl', 'rest', 'rejection callback', { method: 'POST', path: '/api/declarations/{id}/rejection' }),
      ifc('i-db-decl', 'c-db', 'db', 'DECLARATIONS'),
      ifc('i-q-submitted', 'c-mq', 'queue', 'declarations.submitted', { queueName: 'declarations.submitted' }),
      ifc('i-q-risk', 'c-mq', 'queue', 'risk.results', { queueName: 'risk.results' }),
      ifc('i-port-manifest', 'c-port', 'rest', 'manifest lookup', { method: 'GET', path: '/manifests/{id}' }),
      ifc('i-notif', 'c-notif', 'rest', 'notify', { method: 'POST', path: '/api/notify' }),
      ifc('i-pay-cron', 'c-pay', 'cron', 'nightly-reconcile', { cronExpr: '0 2 * * *' }),
      ifc('i-vip-internal', 'c-f5', 'vip', 'vip-internal', { address: '10.10.0.20:443' }),
      ifc('i-vip-port', 'c-f5', 'vip', 'vip-port-out', { address: '10.10.0.30:443' }),
    ],
    scenarios: [
      {
        id: 'sc-submit',
        name: 'הגשת הצהרה',
        description: 'הצהרה נכנסת דרך ה-gateway, נשמרת, ונשלחת לבדיקת סיכון אסינכרונית.',
        triggerInterfaceId: 'i-gw-post',
        parentScenarioId: null,
        branchLabel: null,
        threads: [
          { id: 't-a', label: 'A', kind: 'main', originStepId: null },
          { id: 't-b', label: 'B', kind: 'async', originStepId: 's3' },
          { id: 't-c', label: 'C', kind: 'feedback', originStepId: 's5' },
        ],
        steps: [
          step('s1', 't-a', 1, 'c-gw', 'i-decl-post', 'call', { viaVipId: 'i-vip-internal' }),
          step('s2', 't-a', 2, 'c-decl', 'i-db-decl', 'call'),
          step('s3', 't-a', 3, 'c-decl', 'i-q-submitted', 'publish'),
          step('s4', 't-b', 1, 'c-risk', 'i-q-submitted', 'consume'),
          step('s5', 't-b', 2, 'c-risk', 'i-port-manifest', 'call', { viaVipId: 'i-vip-port' }),
          step('s6', 't-c', 1, 'c-risk', 'i-q-risk', 'publish', { feedbackMode: 'reply_queue' }),
          step('s7', 't-c', 2, 'c-decl', 'i-q-risk', 'consume', { feedbackMode: 'reply_queue' }),
        ],
        ...m,
      },
      {
        id: 'sc-reject',
        name: 'הגשת הצהרה — דחייה בסיכון',
        description: 'חלופה: risk-service דוחה ומחזיר callback ב-REST.',
        triggerInterfaceId: 'i-q-submitted',
        parentScenarioId: 'sc-submit',
        branchLabel: 'סיכון גבוה',
        threads: [
          { id: 't-ra', label: 'A', kind: 'async', originStepId: null },
          { id: 't-rb', label: 'B', kind: 'feedback', originStepId: 'r1' },
        ],
        steps: [
          step('r1', 't-ra', 1, 'c-risk', 'i-q-submitted', 'consume'),
          step('r2', 't-rb', 1, 'c-risk', 'i-decl-reject', 'callback', { feedbackMode: 'rest_callback', viaVipId: 'i-vip-internal' }),
          step('r3', 't-rb', 2, 'c-decl', 'i-notif', 'call'),
        ],
        ...m,
      },
      {
        id: 'sc-reconcile',
        name: 'התאמת תשלומים לילית',
        description: null,
        triggerInterfaceId: 'i-pay-cron',
        parentScenarioId: null,
        branchLabel: null,
        threads: [{ id: 't-pa', label: 'A', kind: 'main', originStepId: null }],
        steps: [
          step('p1', 't-pa', 1, 'c-pay', 'i-db-decl', 'call'),
          step('p2', 't-pa', 2, 'c-pay', 'i-notif', 'call'),
        ],
        ...m,
      },
    ],
  };
}
