import { useState } from 'react';
import {
  COMPONENT_KINDS,
  HOSTING_KINDS,
  INTERFACE_KINDS,
  ORG_KINDS,
  STATUSES,
  type EntityName,
  type Model,
} from '../../shared/schema';
import {
  COMPONENT_KIND_LABEL,
  HOSTING_KIND_LABEL,
  INTERFACE_KIND_LABEL,
  ORG_KIND_LABEL,
  STATUS_LABEL,
} from '../labels';
import { Combo, Field, type ComboOption } from './ui';

type Values = Record<string, any>;

interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'combo';
  options?: { value: string; label: string }[];
  comboOptions?: ComboOption[];
  allowEmpty?: boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}

const opts = <K extends string>(keys: readonly K[], labels: Record<K, string>) => keys.map((k) => ({ value: k, label: labels[k] }));
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }));

export const DEFAULTS: Record<EntityName, Values> = {
  organizations: { name: '', kind: 'ours', notes: null },
  systems: { organizationId: '', name: '', description: null },
  hosting: { parentId: null, kind: 'vm', name: '', location: null },
  components: { systemId: '', name: '', kind: 'service', technology: null, description: null, hostingNodeId: null, status: 'confirmed' },
  interfaces: { componentId: '', kind: 'rest', name: '', method: 'GET', path: null, queueName: null, cronExpr: null, address: null, status: 'confirmed' },
};

function fieldsFor(entity: EntityName, v: Values, model: Model): FieldSpec[] {
  const status: FieldSpec = { key: 'status', label: 'סטטוס', type: 'select', options: opts(STATUSES, STATUS_LABEL) };
  switch (entity) {
    case 'organizations':
      return [
        { key: 'name', label: 'שם', type: 'text', required: true },
        { key: 'kind', label: 'סוג', type: 'select', options: opts(ORG_KINDS, ORG_KIND_LABEL) },
        { key: 'notes', label: 'הערות', type: 'textarea' },
      ];
    case 'systems':
      return [
        {
          key: 'organizationId', label: 'ארגון', type: 'select', required: true,
          options: model.organizations.map((o) => ({ value: o.id, label: o.name })),
        },
        { key: 'name', label: 'שם', type: 'text', required: true },
        { key: 'description', label: 'תיאור', type: 'textarea' },
      ];
    case 'hosting':
      return [
        { key: 'kind', label: 'סוג', type: 'select', options: opts(HOSTING_KINDS, HOSTING_KIND_LABEL) },
        { key: 'name', label: 'שם', type: 'text', required: true },
        {
          key: 'parentId', label: 'בתוך', type: 'select', allowEmpty: true,
          options: model.hosting.filter((h) => h.id !== v.id).map((h) => ({ value: h.id, label: `${HOSTING_KIND_LABEL[h.kind]} · ${h.name}` })),
        },
        { key: 'location', label: 'מיקום', type: 'select', allowEmpty: true, options: [{ value: 'on_prem', label: 'On-prem' }, { value: 'cloud', label: 'ענן' }] },
      ];
    case 'components':
      return [
        { key: 'name', label: 'שם', type: 'text', required: true },
        { key: 'kind', label: 'סוג', type: 'select', options: opts(COMPONENT_KINDS, COMPONENT_KIND_LABEL) },
        {
          key: 'systemId', label: 'מערכת', type: 'select', required: true,
          options: model.systems.map((s) => ({ value: s.id, label: s.name })),
        },
        { key: 'technology', label: 'טכנולוגיה', type: 'text', placeholder: 'Java / Spring, RabbitMQ, Oracle…' },
        {
          key: 'hostingNodeId', label: 'אירוח', type: 'select', allowEmpty: true,
          options: model.hosting.map((h) => ({ value: h.id, label: `${HOSTING_KIND_LABEL[h.kind]} · ${h.name}` })),
        },
        status,
        { key: 'description', label: 'תיאור', type: 'textarea' },
      ];
    case 'interfaces': {
      const byKind: FieldSpec[] =
        v.kind === 'rest'
          ? [
              { key: 'method', label: 'Method', type: 'select', options: HTTP_METHODS },
              { key: 'path', label: 'Path', type: 'text', placeholder: '/api/orders/{id}' },
            ]
          : v.kind === 'soap'
            ? [
                { key: 'method', label: 'Operation', type: 'text' },
                { key: 'path', label: 'Endpoint path', type: 'text' },
              ]
            : v.kind === 'queue'
              ? [{ key: 'queueName', label: 'שם התור', type: 'text', required: true, hint: 'התור שייך ל-broker' }]
              : v.kind === 'cron'
                ? [{ key: 'cronExpr', label: 'ביטוי Cron', type: 'text', placeholder: '0 2 * * *' }]
                : v.kind === 'vip'
                  ? [{ key: 'address', label: 'כתובת', type: 'text', placeholder: '10.0.0.1:443' }]
                  : [];
      return [
        {
          key: 'componentId', label: 'רכיב בעלים', type: 'combo', required: true,
          comboOptions: model.components.map((c) => ({
            id: c.id, label: c.name, sub: COMPONENT_KIND_LABEL[c.kind],
            group: model.systems.find((s) => s.id === c.systemId)?.name,
          })),
        },
        { key: 'kind', label: 'סוג', type: 'select', options: opts(INTERFACE_KINDS, INTERFACE_KIND_LABEL) },
        { key: 'name', label: 'שם', type: 'text', required: true },
        ...byKind,
        status,
      ];
    }
  }
}

/** Fills derived defaults, e.g. a queue interface's name doubles as its queue name. */
function normalize(entity: EntityName, v: Values): Values {
  const out = { ...v };
  for (const k of Object.keys(out)) if (out[k] === '') out[k] = null;
  if (entity === 'interfaces') {
    if (out.kind === 'queue' && !out.queueName) out.queueName = out.name;
    if (out.kind === 'queue' && !out.name) out.name = out.queueName;
    if (out.kind === 'rest' && !out.name && out.path) out.name = `${out.method ?? ''} ${out.path}`.trim();
  }
  return out;
}

export function EntityForm({
  entity,
  initial,
  model,
  onSubmit,
  onCancel,
  submitLabel = 'שמור',
  busy,
  restrictKinds,
}: {
  entity: EntityName;
  initial: Values;
  model: Model;
  onSubmit: (values: Values) => void;
  onCancel?: () => void;
  submitLabel?: string;
  busy?: boolean;
  /** Limit the "kind" select (e.g. only queues when creating for a publish step). */
  restrictKinds?: readonly string[];
}) {
  const [v, setV] = useState<Values>({ ...DEFAULTS[entity], ...initial });
  const set = (k: string, val: unknown) => setV((p) => ({ ...p, [k]: val }));
  const fields = fieldsFor(entity, v, model).map((f) =>
    f.key === 'kind' && restrictKinds ? { ...f, options: f.options!.filter((o) => restrictKinds.includes(o.value)) } : f,
  );
  const missing = fields.filter((f) => f.required && !normalize(entity, v)[f.key]);

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!missing.length) onSubmit(normalize(entity, v));
      }}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <Field key={f.key} label={f.label + (f.required ? ' *' : '')} hint={f.hint}>
            {f.type === 'text' && (
              <input value={v[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} dir="auto" />
            )}
            {f.type === 'textarea' && <textarea value={v[f.key] ?? ''} rows={2} onChange={(e) => set(f.key, e.target.value)} dir="auto" />}
            {f.type === 'select' && (
              <select value={v[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value || null)}>
                {(f.allowEmpty || !v[f.key]) && <option value="">{f.allowEmpty ? '— ללא —' : 'בחר…'}</option>}
                {f.options!.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {f.type === 'combo' && <Combo value={v[f.key] ?? null} options={f.comboOptions!} onChange={(id) => set(f.key, id)} />}
          </Field>
        ))}
      </div>
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={busy || missing.length > 0}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            ביטול
          </button>
        )}
      </div>
    </form>
  );
}
