import type { Component, Interface, Model } from '../shared/schema';
import { interfaceLabel } from '../shared/schema';

export const ORG_KIND_LABEL = { ours: 'שלנו', external: 'חיצוני' } as const;
export const COMPONENT_KIND_LABEL: Record<Component['kind'], string> = {
  service: 'מיקרו-שירות',
  database: 'מסד נתונים',
  broker: 'Broker (RabbitMQ)',
  gateway: 'Gateway',
  batch: 'Batch',
  load_balancer: 'F5 / Load balancer',
  external: 'רכיב חיצוני',
};
export const COMPONENT_KIND_ICON: Record<Component['kind'], string> = {
  service: '⬢',
  database: '⛁',
  broker: '✉',
  gateway: '⇆',
  batch: '⏱',
  load_balancer: '⋔',
  external: '☁',
};
export const INTERFACE_KIND_LABEL: Record<Interface['kind'], string> = {
  rest: 'REST',
  soap: 'SOAP',
  queue: 'תור',
  cron: 'Cron',
  vip: 'VIP (F5)',
  db: 'DB',
};
export const HOSTING_KIND_LABEL = {
  site: 'אתר',
  server: 'שרת פיזי',
  vm: 'VM',
  k8s_cluster: 'K8s cluster',
  namespace: 'Namespace',
} as const;
export const ACTION_LABEL = {
  call: 'קריאה (סינכרונית)',
  publish: 'שליחה לתור',
  consume: 'צריכה מתור',
  callback: 'REST callback',
} as const;
export const THREAD_KIND_LABEL = { main: 'ראשי', async: 'אסינכרוני', feedback: 'Feedback' } as const;
export const FEEDBACK_MODE_LABEL = { reply_queue: 'Reply queue', rest_callback: 'REST callback' } as const;
export const STATUS_LABEL = { draft: 'טיוטה', confirmed: 'מאושר' } as const;

export const THREAD_COLORS = ['#2563eb', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#db2777'];
export const FEEDBACK_COLOR = '#7c3aed';

export function ifaceText(i: Interface, model: Model): string {
  const owner = model.components.find((c) => c.id === i.componentId);
  return `${owner?.name ?? '?'} · ${INTERFACE_KIND_LABEL[i.kind]} ${interfaceLabel(i)}`;
}
