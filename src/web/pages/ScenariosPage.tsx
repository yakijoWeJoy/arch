import { useEffect, useMemo, useState } from 'react';
import { sortedSteps, type Index } from '../../shared/derive';
import {
  interfaceLabel,
  STEP_ACTIONS,
  type EntityName,
  type InterfaceKind,
  type Model,
  type Scenario,
  type Step,
  type StepAction,
  type Thread,
} from '../../shared/schema';
import { ApiError, newId, useModel, useSave } from '../api';
import { EntityForm } from '../components/EntityForm';
import { SequenceDiagram, stepNumbers, threadColor } from '../components/SequenceDiagram';
import { Badge, Combo, ErrorBanner, Field, Modal, type ComboOption } from '../components/ui';
import { ACTION_LABEL, COMPONENT_KIND_LABEL, FEEDBACK_MODE_LABEL, INTERFACE_KIND_LABEL, THREAD_KIND_LABEL } from '../labels';

type Draft = Scenario;

const KINDS_FOR_ACTION: Record<StepAction, InterfaceKind[]> = {
  call: ['rest', 'soap', 'db'],
  publish: ['queue'],
  consume: ['queue'],
  callback: ['rest', 'soap'],
};
const TRIGGER_KINDS: InterfaceKind[] = ['rest', 'soap', 'queue', 'cron'];

interface CreateRequest {
  entity: EntityName;
  title: string;
  initial: Record<string, unknown>;
  restrictKinds?: readonly string[];
  onCreated: (id: string) => void;
}

export function ScenariosPage({ selectedId, go }: { selectedId?: string; go: (path: string) => void }) {
  const { model, idx } = useModel();
  const { create } = useSave();
  const [filter, setFilter] = useState('');

  if (!model || !idx) return null;

  const addScenario = async () => {
    const t: Thread = { id: newId(), label: 'A', kind: 'main', originStepId: null };
    const sc = await create.mutateAsync({ collection: 'scenarios', body: { name: 'תרחיש חדש', threads: [t], steps: [] } });
    go(`scenarios/${sc.id}`);
  };

  const roots = model.scenarios.filter((s) => !s.parentScenarioId || !model.scenarios.some((p) => p.id === s.parentScenarioId));
  const childrenOf = (id: string) => model.scenarios.filter((s) => s.parentScenarioId === id);
  const matches = (s: Scenario) => !filter || s.name.toLowerCase().includes(filter.toLowerCase());

  const renderItem = (s: Scenario, depth: number): React.ReactNode => (
    <div key={s.id}>
      {matches(s) && (
        <a href={`#/scenarios/${s.id}`} className={`list-item ${s.id === selectedId ? 'active' : ''}`} style={{ paddingInlineStart: 12 + depth * 16 }}>
          {depth > 0 && <span className="branch-mark">↳</span>}
          <span className="grow">{s.name}</span>
          {s.branchLabel && <Badge>{s.branchLabel}</Badge>}
          <span className="count">{s.steps.length}</span>
        </a>
      )}
      {childrenOf(s.id).map((c) => renderItem(c, depth + 1))}
    </div>
  );

  const selected = model.scenarios.find((s) => s.id === selectedId);

  return (
    <div className="page two-col">
      <aside className="sidebar">
        <div className="sidebar-head">
          <h2>תרחישים</h2>
          <button className="btn primary small" onClick={addScenario}>
            ＋ חדש
          </button>
        </div>
        <input className="search" placeholder="חיפוש תרחיש…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="list">{roots.map((s) => renderItem(s, 0))}</div>
        {model.scenarios.length === 0 && <p className="muted pad">אין עדיין תרחישים.</p>}
      </aside>
      <main className="main">
        {selected ? (
          <ScenarioEditor key={selected.id} scenario={selected} model={model} idx={idx} go={go} />
        ) : (
          <div className="empty-state">
            <h2>בחר תרחיש או צור חדש</h2>
            <p>
              כל צעד בתרחיש הוא רכיב שקורא לממשק של רכיב אחר. הקטלוג ומפת הקשרים נגזרים אוטומטית מהצעדים.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function nextLabel(threads: Thread[]): string {
  const used = new Set(threads.map((t) => t.label));
  for (let i = 0; i < 26; i++) {
    const l = String.fromCharCode(65 + i);
    if (!used.has(l)) return l;
  }
  return `T${threads.length + 1}`;
}

function ScenarioEditor({ scenario, model, idx, go }: { scenario: Scenario; model: Model; idx: Index; go: (p: string) => void }) {
  const { create, update, remove } = useSave();
  const [draft, setDraft] = useState<Draft>(scenario);
  const [dirty, setDirty] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [createReq, setCreateReq] = useState<CreateRequest | null>(null);

  // Follow server changes (e.g. the other user saved) unless there are local edits.
  useEffect(() => {
    if (!dirty) setDraft(scenario);
  }, [scenario, dirty]);

  const edit = (fn: (d: Draft) => Draft) => {
    setDraft((d) => fn(d));
    setDirty(true);
  };
  const setStep = (id: string, patch: Partial<Step>) =>
    edit((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const nums = useMemo(() => stepNumbers(draft), [draft]);
  const ordered = useMemo(() => sortedSteps(draft), [draft]);

  // ---- options ----
  const componentOptions: ComboOption[] = useMemo(
    () =>
      model.components.map((c) => ({
        id: c.id,
        label: c.name,
        sub: COMPONENT_KIND_LABEL[c.kind] + (c.status === 'draft' ? ' · טיוטה' : ''),
        group: model.systems.find((s) => s.id === c.systemId)?.name,
      })),
    [model],
  );
  const interfaceOptions = (kinds: InterfaceKind[]): ComboOption[] =>
    model.interfaces
      .filter((i) => kinds.includes(i.kind))
      .map((i) => ({
        id: i.id,
        label: interfaceLabel(i),
        sub: INTERFACE_KIND_LABEL[i.kind] + (i.status === 'draft' ? ' · טיוטה' : ''),
        group: idx.components.get(i.componentId)?.name,
      }))
      .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? ''));
  const vipOptions = interfaceOptions(['vip']);

  // ---- inline creation (saved immediately as draft) ----
  const requestComponent = (text: string, onCreated: (id: string) => void) =>
    setCreateReq({
      entity: 'components',
      title: 'רכיב חדש (טיוטה)',
      initial: { name: text, systemId: model.systems[0]?.id ?? '', status: 'draft' },
      onCreated,
    });
  const requestInterface = (text: string, kinds: InterfaceKind[], onCreated: (id: string) => void, ownerHint?: string) => {
    const broker = model.components.find((c) => c.kind === 'broker');
    const owner = kinds.includes('queue') && kinds.length === 1 ? broker?.id : ownerHint;
    const kind = kinds[0];
    setCreateReq({
      entity: 'interfaces',
      title: 'ממשק חדש (טיוטה)',
      initial: {
        componentId: owner ?? '',
        kind,
        name: text,
        queueName: kind === 'queue' ? text : null,
        path: kind === 'rest' && text.startsWith('/') ? text : null,
        status: 'draft',
      },
      restrictKinds: kinds,
      onCreated,
    });
  };

  // ---- threads & steps ----
  const addStep = (threadId: string) => {
    const thread = draft.threads.find((t) => t.id === threadId)!;
    const inThread = ordered.filter((s) => s.threadId === threadId);
    const last = inThread[inThread.length - 1];
    const step: Step = {
      id: newId(),
      threadId,
      ord: (last?.ord ?? 0) + 1,
      callerComponentId: last?.callerComponentId ?? '',
      interfaceId: '',
      action: inThread.length === 0 && thread.kind === 'async' ? 'consume' : 'call',
      viaVipId: null,
      feedbackMode: thread.kind === 'feedback' ? 'reply_queue' : null,
      note: null,
    };
    edit((d) => ({ ...d, steps: [...d.steps, step] }));
    setSelectedStepId(step.id);
  };

  const openThread = (from: Step, kind: 'async' | 'feedback') => {
    const t: Thread = { id: newId(), label: nextLabel(draft.threads), kind, originStepId: from.id };
    const first: Step =
      kind === 'async'
        ? { id: newId(), threadId: t.id, ord: 1, callerComponentId: '', interfaceId: from.interfaceId, action: 'consume', viaVipId: null, feedbackMode: null, note: null }
        : { id: newId(), threadId: t.id, ord: 1, callerComponentId: from.callerComponentId, interfaceId: '', action: 'publish', viaVipId: null, feedbackMode: 'reply_queue', note: null };
    edit((d) => ({ ...d, threads: [...d.threads, t], steps: [...d.steps, first] }));
    setSelectedStepId(first.id);
  };

  const addThread = (kind: Thread['kind']) => {
    const t: Thread = { id: newId(), label: nextLabel(draft.threads), kind, originStepId: null };
    edit((d) => ({ ...d, threads: [...d.threads, t] }));
  };

  const removeThread = (id: string) => {
    if (draft.threads.length <= 1) return;
    edit((d) => {
      const gone = new Set(d.steps.filter((s) => s.threadId === id).map((s) => s.id));
      return {
        ...d,
        threads: d.threads.filter((t) => t.id !== id).map((t) => (t.originStepId && gone.has(t.originStepId) ? { ...t, originStepId: null } : t)),
        steps: d.steps.filter((s) => s.threadId !== id),
      };
    });
  };

  const removeStep = (id: string) =>
    edit((d) => ({
      ...d,
      steps: d.steps.filter((s) => s.id !== id),
      threads: d.threads.map((t) => (t.originStepId === id ? { ...t, originStepId: null } : t)),
    }));

  const moveStep = (id: string, dir: -1 | 1) =>
    edit((d) => {
      const st = d.steps.find((s) => s.id === id)!;
      const siblings = sortedSteps(d).filter((s) => s.threadId === st.threadId);
      const i = siblings.findIndex((s) => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= siblings.length) return d;
      [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
      const ord = new Map(siblings.map((s, k) => [s.id, k + 1]));
      return { ...d, steps: d.steps.map((s) => (ord.has(s.id) ? { ...s, ord: ord.get(s.id)! } : s)) };
    });

  // ---- persistence ----
  const incomplete = draft.steps.filter((s) => !s.callerComponentId || !s.interfaceId);
  const save = async () => {
    if (incomplete.length) {
      setError(new Error(`יש ${incomplete.length} צעדים לא שלמים (${incomplete.map((s) => nums.get(s.id)).join(', ')}) — בחר קורא וממשק`));
      return;
    }
    try {
      setError(null);
      await update.mutateAsync({ collection: 'scenarios', id: draft.id, body: draft });
      setDirty(false);
    } catch (e) {
      setError(e);
    }
  };
  const discard = () => {
    setDraft(scenario);
    setDirty(false);
    setError(null);
  };

  const createAlternative = async () => {
    // Copy the steps so the architect only edits where the branch diverges.
    const tMap = new Map(draft.threads.map((t) => [t.id, newId()]));
    const sMap = new Map(draft.steps.map((s) => [s.id, newId()]));
    const body = {
      name: `${draft.name} — חלופה`,
      description: null,
      triggerInterfaceId: draft.triggerInterfaceId,
      parentScenarioId: draft.id,
      branchLabel: 'תנאי',
      threads: draft.threads.map((t) => ({ ...t, id: tMap.get(t.id)!, originStepId: t.originStepId ? (sMap.get(t.originStepId) ?? null) : null })),
      steps: draft.steps.map((s) => ({ ...s, id: sMap.get(s.id)!, threadId: tMap.get(s.threadId)! })),
    };
    try {
      const sc = await create.mutateAsync({ collection: 'scenarios', body });
      go(`scenarios/${sc.id}`);
    } catch (e) {
      setError(e);
    }
  };

  const deleteScenario = async () => {
    if (!confirm(`למחוק את התרחיש "${draft.name}"?`)) return;
    await remove.mutateAsync({ collection: 'scenarios', id: draft.id });
    go('scenarios');
  };

  const parent = model.scenarios.find((s) => s.id === draft.parentScenarioId);
  const alternatives = model.scenarios.filter((s) => s.parentScenarioId === draft.id);
  const selectedStep = draft.steps.find((s) => s.id === selectedStepId);

  return (
    <div className="editor">
      <div className="editor-head">
        <input
          className="title-input"
          value={draft.name}
          onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))}
          dir="auto"
          aria-label="שם התרחיש"
        />
        <div className="head-actions">
          {dirty && <span className="dirty">שינויים לא שמורים</span>}
          <button className="btn primary" onClick={save} disabled={!dirty || update.isPending}>
            שמור
          </button>
          {dirty && (
            <button className="btn" onClick={discard}>
              בטל שינויים
            </button>
          )}
          <button className="btn" onClick={createAlternative} title="יוצר תרחיש חלופי מקושר עם עותק של הצעדים">
            ⑂ צור חלופה
          </button>
          <button className="btn danger" onClick={deleteScenario}>
            מחק
          </button>
        </div>
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      {error instanceof ApiError && error.status === 409 && (
        <div className="banner">
          <button className="btn small" onClick={discard}>
            טען את הגרסה העדכנית (מבטל את השינויים שלך)
          </button>
        </div>
      )}

      <div className="meta-grid">
        <Field label="טריגר">
          <Combo
            value={draft.triggerInterfaceId}
            options={interfaceOptions(TRIGGER_KINDS)}
            allowEmpty
            onChange={(id) => edit((d) => ({ ...d, triggerInterfaceId: id }))}
            onCreate={(text) => requestInterface(text, TRIGGER_KINDS, (id) => edit((d) => ({ ...d, triggerInterfaceId: id })))}
          />
        </Field>
        <Field label="תרחיש אב (חלופה של…)">
          <select
            value={draft.parentScenarioId ?? ''}
            onChange={(e) => edit((d) => ({ ...d, parentScenarioId: e.target.value || null }))}
          >
            <option value="">— תרחיש ראשי —</option>
            {model.scenarios
              .filter((s) => s.id !== draft.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        {draft.parentScenarioId && (
          <Field label="תנאי ההסתעפות">
            <input value={draft.branchLabel ?? ''} onChange={(e) => edit((d) => ({ ...d, branchLabel: e.target.value || null }))} dir="auto" />
          </Field>
        )}
        <Field label="תיאור">
          <input value={draft.description ?? ''} onChange={(e) => edit((d) => ({ ...d, description: e.target.value || null }))} dir="auto" />
        </Field>
      </div>
      {(parent || alternatives.length > 0) && (
        <div className="links-row">
          {parent && (
            <span>
              חלופה של: <a href={`#/scenarios/${parent.id}`}>{parent.name}</a>
            </span>
          )}
          {alternatives.length > 0 && (
            <span>
              חלופות:{' '}
              {alternatives.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  <a href={`#/scenarios/${a.id}`}>{a.name}</a>
                  {a.branchLabel && ` (${a.branchLabel})`}
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      <div className="split">
        <section className="steps-panel">
          {draft.threads.map((t) => {
            const color = threadColor(draft.threads, t.id);
            const steps = ordered.filter((s) => s.threadId === t.id);
            return (
              <div key={t.id} className="thread" style={{ borderInlineStartColor: color }}>
                <div className="thread-head">
                  <span className="thread-label" style={{ background: color }}>
                    {t.label}
                  </span>
                  <select
                    className="inline-select"
                    value={t.kind}
                    onChange={(e) => edit((d) => ({ ...d, threads: d.threads.map((x) => (x.id === t.id ? { ...x, kind: e.target.value as Thread['kind'] } : x)) }))}
                  >
                    {Object.entries(THREAD_KIND_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                  {t.originStepId && nums.get(t.originStepId) && <span className="muted">נפתח מצעד {nums.get(t.originStepId)}</span>}
                  <span className="grow" />
                  {draft.threads.length > 1 && (
                    <button className="icon-btn" title="מחק thread" onClick={() => removeThread(t.id)}>
                      🗑
                    </button>
                  )}
                </div>
                {steps.map((st) => (
                  <StepRow
                    key={st.id}
                    step={st}
                    num={nums.get(st.id)!}
                    idx={idx}
                    selected={st.id === selectedStepId}
                    onSelect={() => setSelectedStepId(st.id === selectedStepId ? null : st.id)}
                  />
                ))}
                <button className="btn ghost small" onClick={() => addStep(t.id)}>
                  ＋ צעד
                </button>
              </div>
            );
          })}
          <div className="thread-actions">
            <button className="btn small" onClick={() => addThread('async')}>
              ＋ thread אסינכרוני
            </button>
            <button className="btn small" onClick={() => addThread('feedback')}>
              ＋ thread feedback
            </button>
          </div>

          {selectedStep && (
            <StepInspector
              key={selectedStep.id}
              step={selectedStep}
              num={nums.get(selectedStep.id)!}
              draft={draft}
              idx={idx}
              componentOptions={componentOptions}
              interfaceOptions={interfaceOptions}
              vipOptions={vipOptions}
              onChange={(patch) => setStep(selectedStep.id, patch)}
              onMove={(dir) => moveStep(selectedStep.id, dir)}
              onRemove={() => {
                removeStep(selectedStep.id);
                setSelectedStepId(null);
              }}
              onOpenThread={(kind) => openThread(selectedStep, kind)}
              onCreateComponent={(text) => requestComponent(text, (id) => setStep(selectedStep.id, { callerComponentId: id }))}
              onCreateInterface={(text) =>
                requestInterface(text, KINDS_FOR_ACTION[selectedStep.action], (id) => setStep(selectedStep.id, { interfaceId: id }))
              }
              onCreateVip={(text) =>
                setCreateReq({
                  entity: 'interfaces',
                  title: 'VIP חדש (טיוטה)',
                  initial: { componentId: model.components.find((c) => c.kind === 'load_balancer')?.id ?? '', kind: 'vip', name: text, status: 'draft' },
                  restrictKinds: ['vip'],
                  onCreated: (id) => setStep(selectedStep.id, { viaVipId: id }),
                })
              }
            />
          )}
        </section>

        <section className="diagram-panel">
          <SequenceDiagram scenario={draft} idx={idx} selectedStepId={selectedStepId} onSelect={setSelectedStepId} />
        </section>
      </div>

      {createReq && (
        <Modal title={createReq.title} onClose={() => setCreateReq(null)}>
          <EntityForm
            entity={createReq.entity}
            initial={createReq.initial}
            model={model}
            restrictKinds={createReq.restrictKinds}
            submitLabel="צור"
            busy={create.isPending}
            onCancel={() => setCreateReq(null)}
            onSubmit={async (values) => {
              try {
                const row = await create.mutateAsync({ collection: createReq.entity, body: values });
                createReq.onCreated(row.id);
                setCreateReq(null);
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

function StepRow({ step, num, idx, selected, onSelect }: { step: Step; num: string; idx: Index; selected: boolean; onSelect: () => void }) {
  const caller = idx.components.get(step.callerComponentId);
  const iface = idx.interfaces.get(step.interfaceId);
  const owner = iface ? idx.components.get(iface.componentId) : undefined;
  const vip = step.viaVipId ? idx.interfaces.get(step.viaVipId) : undefined;
  const arrow = step.action === 'consume' ? '⇠' : step.action === 'publish' ? '⇢' : step.action === 'callback' ? '↩' : '→';
  return (
    <div className={`step-row ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <span className="step-num">{num}</span>
      {caller && iface ? (
        <span className="step-summary" dir="ltr">
          <b>{caller.name}</b> {arrow} <b>{owner?.name}</b> <span className="muted">{interfaceLabel(iface)}</span>
        </span>
      ) : (
        <span className="warn">צעד לא שלם</span>
      )}
      {vip && <Badge tone="accent">⋔ {vip.name}</Badge>}
      {step.feedbackMode && <Badge>{FEEDBACK_MODE_LABEL[step.feedbackMode]}</Badge>}
    </div>
  );
}

function StepInspector(props: {
  step: Step;
  num: string;
  draft: Draft;
  idx: Index;
  componentOptions: ComboOption[];
  interfaceOptions: (kinds: InterfaceKind[]) => ComboOption[];
  vipOptions: ComboOption[];
  onChange: (patch: Partial<Step>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onOpenThread: (kind: 'async' | 'feedback') => void;
  onCreateComponent: (text: string) => void;
  onCreateInterface: (text: string) => void;
  onCreateVip: (text: string) => void;
}) {
  const { step, draft, idx, onChange } = props;
  const thread = draft.threads.find((t) => t.id === step.threadId);
  const kinds = KINDS_FOR_ACTION[step.action];
  const iface = idx.interfaces.get(step.interfaceId);
  const callerLabel = step.action === 'consume' ? 'צרכן (מי שקורא מהתור)' : step.action === 'publish' ? 'שולח' : 'קורא';
  const opened = draft.threads.filter((t) => t.originStepId === step.id);

  return (
    <div className="inspector">
      <div className="inspector-head">
        <h3>צעד {props.num}</h3>
        <span className="grow" />
        <button className="icon-btn" title="הזז למעלה" onClick={() => props.onMove(-1)}>
          ▲
        </button>
        <button className="icon-btn" title="הזז למטה" onClick={() => props.onMove(1)}>
          ▼
        </button>
        <button className="icon-btn" title="מחק צעד" onClick={props.onRemove}>
          🗑
        </button>
      </div>
      <div className="form-grid">
        <Field label="פעולה">
          <select
            value={step.action}
            onChange={(e) => {
              const action = e.target.value as StepAction;
              const keep = iface && KINDS_FOR_ACTION[action].includes(iface.kind);
              onChange({ action, interfaceId: keep ? step.interfaceId : '' });
            }}
          >
            {STEP_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Thread">
          <select value={step.threadId} onChange={(e) => onChange({ threadId: e.target.value, ord: 999 })}>
            {draft.threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} · {THREAD_KIND_LABEL[t.kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={callerLabel}>
          <Combo
            value={step.callerComponentId || null}
            options={props.componentOptions}
            onChange={(id) => onChange({ callerComponentId: id ?? '' })}
            onCreate={props.onCreateComponent}
          />
        </Field>
        <Field label={kinds.includes('queue') ? 'תור' : 'ממשק'} hint={iface ? `של ${idx.components.get(iface.componentId)?.name}` : undefined}>
          <Combo
            value={step.interfaceId || null}
            options={props.interfaceOptions(kinds)}
            onChange={(id) => onChange({ interfaceId: id ?? '' })}
            onCreate={props.onCreateInterface}
          />
        </Field>
        <Field label="עובר דרך F5 (VIP)">
          <Combo
            value={step.viaVipId}
            options={props.vipOptions}
            allowEmpty
            emptyLabel="— ישיר —"
            onChange={(id) => onChange({ viaVipId: id })}
            onCreate={props.onCreateVip}
          />
        </Field>
        {(thread?.kind === 'feedback' || step.feedbackMode) && (
          <Field label="מנגנון feedback">
            <select value={step.feedbackMode ?? ''} onChange={(e) => onChange({ feedbackMode: (e.target.value || null) as Step['feedbackMode'] })}>
              <option value="">—</option>
              {Object.entries(FEEDBACK_MODE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="הערה">
          <input value={step.note ?? ''} onChange={(e) => onChange({ note: e.target.value || null })} dir="auto" />
        </Field>
      </div>
      <div className="inspector-actions">
        {step.action === 'publish' && step.interfaceId && (
          <button className="btn small" onClick={() => props.onOpenThread('async')}>
            ⇢ פתח thread צרכן לתור הזה
          </button>
        )}
        {thread?.kind !== 'feedback' && step.callerComponentId && (
          <button className="btn small" onClick={() => props.onOpenThread('feedback')}>
            ↩ פתח thread feedback לשולח
          </button>
        )}
        {opened.length > 0 && <span className="muted">פותח: {opened.map((t) => `Thread ${t.label}`).join(', ')}</span>}
      </div>
    </div>
  );
}
