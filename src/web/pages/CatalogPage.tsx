import { useMemo, useState } from 'react';
import { componentUsage } from '../../shared/derive';
import { COMPONENT_KINDS, interfaceLabel, type Component, type EntityName, type Interface, type Model } from '../../shared/schema';
import { useModel, useSave } from '../api';
import { EntityForm } from '../components/EntityForm';
import { Badge, ErrorBanner, Modal } from '../components/ui';
import {
  COMPONENT_KIND_ICON,
  COMPONENT_KIND_LABEL,
  HOSTING_KIND_LABEL,
  INTERFACE_KIND_LABEL,
  ORG_KIND_LABEL,
} from '../labels';

const ROUTE_ENTITY: Record<string, EntityName> = {
  org: 'organizations',
  system: 'systems',
  component: 'components',
  interface: 'interfaces',
  hosting: 'hosting',
};

export function CatalogPage({ kind, id }: { kind?: string; id?: string }) {
  const { model } = useModel();
  const [text, setText] = useState('');
  const [compKind, setCompKind] = useState('');
  const [draftsOnly, setDraftsOnly] = useState(false);
  const [creating, setCreating] = useState<{ entity: EntityName; initial: Record<string, unknown> } | null>(null);
  const { create } = useSave();
  const [error, setError] = useState<unknown>(null);

  const visible = useMemo(() => {
    if (!model) return null;
    const t = text.trim().toLowerCase();
    const ifaceMatch = (i: Interface) => (!draftsOnly || i.status === 'draft') && (!t || `${i.name} ${interfaceLabel(i)}`.toLowerCase().includes(t));
    const comps = new Set<string>();
    const ifaces = new Set<string>();
    for (const c of model.components) {
      if (compKind && c.kind !== compKind) continue;
      const own = model.interfaces.filter((i) => i.componentId === c.id);
      const matchedIfaces = own.filter(ifaceMatch);
      const selfMatch = (!draftsOnly || c.status === 'draft') && (!t || `${c.name} ${c.technology ?? ''}`.toLowerCase().includes(t));
      if (selfMatch || matchedIfaces.length) {
        comps.add(c.id);
        (selfMatch && !t && !draftsOnly ? own : matchedIfaces).forEach((i) => ifaces.add(i.id));
      }
    }
    return { comps, ifaces };
  }, [model, text, compKind, draftsOnly]);

  if (!model || !visible) return null;
  const filtering = !!(text || compKind || draftsOnly);
  const drafts = model.components.filter((c) => c.status === 'draft').length + model.interfaces.filter((i) => i.status === 'draft').length;

  return (
    <div className="page two-col">
      <aside className="sidebar wide">
        <div className="sidebar-head">
          <h2>קטלוג</h2>
          <button className="btn small" onClick={() => setCreating({ entity: 'organizations', initial: {} })}>
            ＋ ארגון
          </button>
        </div>
        <div className="filters">
          <input className="search" placeholder="חיפוש רכיב / ממשק / תור…" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="filter-row">
            <select value={compKind} onChange={(e) => setCompKind(e.target.value)}>
              <option value="">כל הסוגים</option>
              {COMPONENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {COMPONENT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={draftsOnly} onChange={(e) => setDraftsOnly(e.target.checked)} /> טיוטות ({drafts})
            </label>
          </div>
        </div>
        <div className="tree">
          {model.organizations.map((o) => {
            const systems = model.systems.filter((s) => s.organizationId === o.id);
            const anyVisible = systems.some((s) => model.components.some((c) => c.systemId === s.id && visible.comps.has(c.id)));
            if (filtering && !anyVisible) return null;
            return (
              <div key={o.id} className="tree-node">
                <a href={`#/catalog/org/${o.id}`} className={`tree-row lvl0 ${id === o.id ? 'active' : ''}`}>
                  <span className="grow">{o.name}</span>
                  <Badge tone={o.kind === 'external' ? 'ext' : 'neutral'}>{ORG_KIND_LABEL[o.kind]}</Badge>
                </a>
                {systems.map((s) => {
                  const comps = model.components.filter((c) => c.systemId === s.id && (!filtering || visible.comps.has(c.id)));
                  if (filtering && comps.length === 0) return null;
                  return (
                    <div key={s.id}>
                      <a href={`#/catalog/system/${s.id}`} className={`tree-row lvl1 ${id === s.id ? 'active' : ''}`}>
                        <span className="grow">▣ {s.name}</span>
                        <span className="count">{comps.length}</span>
                      </a>
                      {comps.map((c) => (
                        <div key={c.id}>
                          <a href={`#/catalog/component/${c.id}`} className={`tree-row lvl2 ${id === c.id ? 'active' : ''}`}>
                            <span className="kind-icon">{COMPONENT_KIND_ICON[c.kind]}</span>
                            <span className="grow" dir="ltr">
                              {c.name}
                            </span>
                            {c.status === 'draft' && <Badge tone="draft">טיוטה</Badge>}
                          </a>
                          {(filtering || id === c.id || model.interfaces.find((i) => i.id === id)?.componentId === c.id) &&
                            model.interfaces
                              .filter((i) => i.componentId === c.id && (!filtering || visible.ifaces.has(i.id)))
                              .map((i) => (
                                <a key={i.id} href={`#/catalog/interface/${i.id}`} className={`tree-row lvl3 ${id === i.id ? 'active' : ''}`}>
                                  <span className="iface-kind">{INTERFACE_KIND_LABEL[i.kind]}</span>
                                  <span className="grow" dir="ltr">
                                    {interfaceLabel(i)}
                                  </span>
                                  {i.status === 'draft' && <Badge tone="draft">טיוטה</Badge>}
                                </a>
                              ))}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {!filtering && (
            <div className="tree-node">
              <div className="tree-row lvl0 section">
                <span className="grow">אירוח</span>
                <button className="icon-btn" title="הוסף" onClick={() => setCreating({ entity: 'hosting', initial: { kind: 'site' } })}>
                  ＋
                </button>
              </div>
              <HostingTree model={model} selectedId={id} parentId={null} depth={1} />
            </div>
          )}
        </div>
      </aside>
      <main className="main">
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {kind && id && ROUTE_ENTITY[kind] ? (
          <Detail key={id} entity={ROUTE_ENTITY[kind]} id={id} model={model} onCreate={(entity, initial) => setCreating({ entity, initial })} />
        ) : (
          <div className="empty-state">
            <h2>קטלוג רכיבים</h2>
            <p>
              {model.components.length} רכיבים · {model.interfaces.length} ממשקים · {drafts} טיוטות. רוב הפריטים נוצרים ישירות מתוך
              עורך התרחישים; כאן אפשר לסדר, לאשר טיוטות ולהשלים פרטים.
            </p>
          </div>
        )}
      </main>
      {creating && (
        <Modal title="פריט חדש" onClose={() => setCreating(null)}>
          <EntityForm
            entity={creating.entity}
            initial={creating.initial}
            model={model}
            submitLabel="צור"
            onCancel={() => setCreating(null)}
            onSubmit={async (values) => {
              try {
                const row = await create.mutateAsync({ collection: creating.entity, body: values });
                setCreating(null);
                const route = Object.entries(ROUTE_ENTITY).find(([, e]) => e === creating.entity)![0];
                window.location.hash = `#/catalog/${route}/${row.id}`;
              } catch (e) {
                setError(e);
              }
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function HostingTree({ model, selectedId, parentId, depth }: { model: Model; selectedId?: string; parentId: string | null; depth: number }) {
  return (
    <>
      {model.hosting
        .filter((h) => h.parentId === parentId)
        .map((h) => (
          <div key={h.id}>
            <a href={`#/catalog/hosting/${h.id}`} className={`tree-row ${selectedId === h.id ? 'active' : ''}`} style={{ paddingInlineStart: 8 + depth * 14 }}>
              <span className="iface-kind">{HOSTING_KIND_LABEL[h.kind]}</span>
              <span className="grow" dir="ltr">
                {h.name}
              </span>
            </a>
            <HostingTree model={model} selectedId={selectedId} parentId={h.id} depth={depth + 1} />
          </div>
        ))}
    </>
  );
}

function Detail({
  entity,
  id,
  model,
  onCreate,
}: {
  entity: EntityName;
  id: string;
  model: Model;
  onCreate: (entity: EntityName, initial: Record<string, unknown>) => void;
}) {
  const { update, remove } = useSave();
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const row = (model[entity] as { id: string; updatedAt: string; updatedBy: string | null; status?: string }[]).find((r) => r.id === id);
  if (!row) return <div className="empty-state">הפריט לא נמצא (אולי נמחק).</div>;

  const save = async (values: Record<string, unknown>) => {
    try {
      setError(null);
      await update.mutateAsync({ collection: entity, id, body: { ...values, updatedAt: row.updatedAt } });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e);
    }
  };
  const del = async () => {
    if (!confirm('למחוק? פריטים מוכלים יימחקו גם הם.')) return;
    try {
      await remove.mutateAsync({ collection: entity, id });
      window.location.hash = '#/catalog';
    } catch (e) {
      setError(e);
    }
  };

  const title =
    entity === 'organizations' ? 'ארגון' : entity === 'systems' ? 'מערכת' : entity === 'components' ? 'רכיב' : entity === 'interfaces' ? 'ממשק' : 'אירוח';

  return (
    <div className="detail">
      <div className="detail-head">
        <h2>
          {title}: <span dir="auto">{(row as any).name}</span>
        </h2>
        <span className="grow" />
        {row.status === 'draft' && (
          <button className="btn primary small" onClick={() => save({ ...row, status: 'confirmed' })}>
            ✓ אשר טיוטה
          </button>
        )}
        {entity === 'organizations' && (
          <button className="btn small" onClick={() => onCreate('systems', { organizationId: id })}>
            ＋ מערכת
          </button>
        )}
        {entity === 'systems' && (
          <button className="btn small" onClick={() => onCreate('components', { systemId: id })}>
            ＋ רכיב
          </button>
        )}
        {entity === 'components' && (
          <button className="btn small" onClick={() => onCreate('interfaces', { componentId: id })}>
            ＋ ממשק
          </button>
        )}
        {entity === 'hosting' && (
          <button className="btn small" onClick={() => onCreate('hosting', { parentId: id })}>
            ＋ צומת בתוכו
          </button>
        )}
        <button className="btn danger small" onClick={del}>
          מחק
        </button>
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <div className="muted small-text">
        עודכן {new Date(row.updatedAt).toLocaleString('he-IL')}
        {row.updatedBy && ` ע"י ${row.updatedBy}`} {saved && <b className="ok">· נשמר ✓</b>}
      </div>
      <div className="card">
        <EntityForm key={row.updatedAt} entity={entity} initial={row} model={model} onSubmit={save} busy={update.isPending} />
      </div>
      {entity === 'components' && <ServiceCard model={model} component={row as unknown as Component} />}
      {entity === 'interfaces' && <InterfaceUsage model={model} iface={row as unknown as Interface} />}
    </div>
  );
}

function IfaceList({ items, model, showOwner }: { items: Interface[]; model: Model; showOwner?: boolean }) {
  if (!items.length) return <span className="muted">—</span>;
  return (
    <ul className="plain">
      {items.map((i) => (
        <li key={i.id}>
          {showOwner && <bdi className="muted">{model.components.find((c) => c.id === i.componentId)?.name} · </bdi>}
          <a href={`#/catalog/interface/${i.id}`} dir="ltr">
            <span className="iface-kind">{INTERFACE_KIND_LABEL[i.kind]}</span> {interfaceLabel(i)}
          </a>
          {i.status === 'draft' && <Badge tone="draft">טיוטה</Badge>}
        </li>
      ))}
    </ul>
  );
}

/** The derived part of the service card: everything here comes from scenario steps. */
function ServiceCard({ model, component }: { model: Model; component: Component }) {
  const u = componentUsage(model, component.id);
  const hosting: string[] = [];
  let h = model.hosting.find((x) => x.id === component.hostingNodeId);
  while (h) {
    hosting.unshift(`${HOSTING_KIND_LABEL[h.kind]} ${h.name}`);
    h = model.hosting.find((x) => x.id === h!.parentId);
  }
  const cron = u.exposed.filter((i) => i.kind === 'cron');
  return (
    <div className="card-grid">
      <div className="card">
        <h4>ממשקים חשופים</h4>
        <IfaceList items={u.exposed.filter((i) => i.kind !== 'cron')} model={model} />
      </div>
      <div className="card">
        <h4>תורים — שולח</h4>
        <IfaceList items={u.publishes} model={model} />
        <h4>תורים — צורך</h4>
        <IfaceList items={u.consumes} model={model} />
      </div>
      <div className="card">
        <h4>קורא ל־</h4>
        <IfaceList items={u.calls} model={model} showOwner />
        <h4>נקרא ע"י</h4>
        {u.calledBy.length ? (
          <ul className="plain">
            {u.calledBy.map((c) => (
              <li key={c.id}>
                <a href={`#/catalog/component/${c.id}`}>{c.name}</a>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">—</span>
        )}
      </div>
      <div className="card">
        <h4>Cron</h4>
        <IfaceList items={cron} model={model} />
        <h4>אירוח</h4>
        <div>
          {hosting.length ? (
            hosting.map((h, i) => (
              <span key={i}>
                {i > 0 && ' › '}
                <bdi>{h}</bdi>
              </span>
            ))
          ) : (
            <span className="muted">—</span>
          )}
        </div>
      </div>
      <div className="card span2">
        <h4>מופיע בתרחישים ({u.scenarios.length})</h4>
        {u.scenarios.length ? (
          <ul className="plain">
            {u.scenarios.map((s) => (
              <li key={s.id}>
                <a href={`#/scenarios/${s.id}`}>{s.name}</a>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">לא מופיע באף תרחיש</span>
        )}
      </div>
    </div>
  );
}

function InterfaceUsage({ model, iface }: { model: Model; iface: Interface }) {
  const uses = model.scenarios.flatMap((s) =>
    s.steps
      .filter((st) => st.interfaceId === iface.id || st.viaVipId === iface.id)
      .map((st) => ({ s, st, caller: model.components.find((c) => c.id === st.callerComponentId) })),
  );
  const triggers = model.scenarios.filter((s) => s.triggerInterfaceId === iface.id);
  return (
    <div className="card">
      <h4>שימושים בתרחישים</h4>
      {triggers.map((s) => (
        <div key={s.id}>
          ⚡ טריגר של <a href={`#/scenarios/${s.id}`}>{s.name}</a>
        </div>
      ))}
      {uses.length === 0 && triggers.length === 0 && <span className="muted">לא בשימוש</span>}
      <ul className="plain">
        {uses.map(({ s, st, caller }) => (
          <li key={st.id}>
            <a href={`#/scenarios/${s.id}`}>{s.name}</a> · {caller?.name} ({st.action})
          </li>
        ))}
      </ul>
    </div>
  );
}
