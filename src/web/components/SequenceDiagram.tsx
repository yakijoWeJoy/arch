import { scenarioParticipants, sortedSteps, type Index } from '../../shared/derive';
import { interfaceLabel, type Scenario, type Step, type Thread } from '../../shared/schema';
import { COMPONENT_KIND_ICON, FEEDBACK_COLOR, THREAD_COLORS, THREAD_KIND_LABEL } from '../labels';

const COL_W = 150;
const LEFT = 96;
const HEAD_H = 50;
const ROW_H = 40;
const BAND_H = 28;
const TOP = 12;

export function threadColor(threads: Thread[], threadId: string): string {
  const i = threads.findIndex((t) => t.id === threadId);
  const t = threads[i];
  if (t?.kind === 'feedback') return FEEDBACK_COLOR;
  return THREAD_COLORS[Math.max(i, 0) % THREAD_COLORS.length];
}

/** "A1", "B2"… — position of the step inside its thread. */
export function stepNumbers(sc: Pick<Scenario, 'steps' | 'threads'>): Map<string, string> {
  const out = new Map<string, string>();
  const count = new Map<string, number>();
  for (const st of sortedSteps(sc)) {
    const n = (count.get(st.threadId) ?? 0) + 1;
    count.set(st.threadId, n);
    out.set(st.id, `${sc.threads.find((t) => t.id === st.threadId)?.label ?? '?'}${n}`);
  }
  return out;
}

type Row =
  | { kind: 'band'; thread: Thread; y: number }
  | { kind: 'trigger'; y: number }
  | { kind: 'step'; step: Step; y: number };

export function SequenceDiagram({
  scenario,
  idx,
  selectedStepId,
  onSelect,
}: {
  scenario: Pick<Scenario, 'steps' | 'threads' | 'triggerInterfaceId'>;
  idx: Index;
  selectedStepId?: string | null;
  onSelect?: (stepId: string) => void;
}) {
  const parts = scenarioParticipants(scenario, idx);
  const col = new Map(parts.map((p, i) => [p.id, i]));
  const x = (componentId: string) => LEFT + (col.get(componentId) ?? 0) * COL_W + COL_W / 2;
  const nums = stepNumbers(scenario);
  const trigger = scenario.triggerInterfaceId ? idx.interfaces.get(scenario.triggerInterfaceId) : undefined;

  const rows: Row[] = [];
  let y = TOP + HEAD_H + 16;
  if (trigger) {
    rows.push({ kind: 'trigger', y: y + ROW_H / 2 });
    y += ROW_H;
  }
  let lastThread: string | null = null;
  for (const st of sortedSteps(scenario)) {
    if (st.threadId !== lastThread) {
      const t = scenario.threads.find((th) => th.id === st.threadId);
      if (t) {
        rows.push({ kind: 'band', thread: t, y: y + 4 });
        y += BAND_H;
      }
      lastThread = st.threadId;
    }
    rows.push({ kind: 'step', step: st, y: y + ROW_H / 2 });
    y += ROW_H;
  }
  const height = y + 16;
  const width = Math.max(LEFT + parts.length * COL_W + 16, 480);
  const colors = [...new Set([...THREAD_COLORS, FEEDBACK_COLOR, '#475569'])];

  if (parts.length === 0) {
    return <div className="empty-diagram">הוסף צעדים כדי לראות את דיאגרמת ה-sequence</div>;
  }

  return (
    <div className="seq-wrap" dir="ltr">
      <svg width={width} height={height} className="seq">
        <defs>
          {colors.map((c) => (
            <g key={c}>
              <marker id={`fill-${c.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={c} />
              </marker>
              <marker id={`open-${c.slice(1)}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10" fill="none" stroke={c} strokeWidth="1.6" />
              </marker>
            </g>
          ))}
        </defs>

        {/* participants + lifelines */}
        {parts.map((p) => {
          const cx = x(p.id);
          const ext = p.kind === 'external';
          const lb = p.kind === 'load_balancer';
          const draft = p.status === 'draft';
          return (
            <g key={p.id}>
              <line x1={cx} y1={TOP + HEAD_H} x2={cx} y2={height - 8} className="lifeline" />
              <rect
                x={cx - COL_W / 2 + 8}
                y={TOP}
                width={COL_W - 16}
                height={HEAD_H - 8}
                rx={6}
                className={`part ${ext ? 'ext' : ''} ${lb ? 'lb' : ''} ${p.kind === 'broker' ? 'broker' : ''} ${draft ? 'draft' : ''}`}
              />
              <text x={cx} y={TOP + 18} className="part-icon" textAnchor="middle">
                {COMPONENT_KIND_ICON[p.kind]}
              </text>
              <text x={cx} y={TOP + 34} className="part-name" textAnchor="middle">
                {truncate(p.name, 18)}
              </text>
            </g>
          );
        })}

        {rows.map((r) => {
          if (r.kind === 'band') {
            const color = threadColor(scenario.threads, r.thread.id);
            const origin = r.thread.originStepId ? nums.get(r.thread.originStepId) : null;
            return (
              <g key={`band-${r.thread.id}`}>
                <rect x={4} y={r.y} width={width - 8} height={BAND_H - 6} rx={4} fill={color} opacity={0.08} />
                <text x={10} y={r.y + 15} className="band-text" fill={color}>
                  {`Thread ${r.thread.label} · ${THREAD_KIND_LABEL[r.thread.kind]}${origin ? ` · from ${origin}` : ''}`}
                </text>
              </g>
            );
          }
          if (r.kind === 'trigger' && trigger) {
            const tx = x(trigger.componentId);
            const label = trigger.kind === 'cron' ? `⏰ ${interfaceLabel(trigger)}` : `⚡ ${interfaceLabel(trigger)}`;
            return (
              <g key="trigger">
                <circle cx={LEFT - 30} cy={r.y} r={5} fill="#475569" />
                <line x1={LEFT - 25} y1={r.y} x2={tx - 3} y2={r.y} stroke="#475569" strokeWidth={1.5} markerEnd="url(#fill-475569)" />
                <text x={(LEFT - 25 + tx) / 2} y={r.y - 6} textAnchor="middle" className="arrow-label">
                  {label}
                </text>
              </g>
            );
          }
          if (r.kind === 'step') return <StepArrow key={r.step.id} {...{ r, scenario, idx, x, nums, selectedStepId, onSelect, width }} />;
          return null;
        })}
      </svg>
    </div>
  );
}

function StepArrow({
  r,
  scenario,
  idx,
  x,
  nums,
  selectedStepId,
  onSelect,
  width,
}: {
  r: { step: Step; y: number };
  scenario: Pick<Scenario, 'threads'>;
  idx: Index;
  x: (id: string) => number;
  nums: Map<string, string>;
  selectedStepId?: string | null;
  onSelect?: (id: string) => void;
  width: number;
}) {
  const st = r.step;
  const y = r.y;
  const iface = idx.interfaces.get(st.interfaceId);
  const caller = idx.components.get(st.callerComponentId);
  const thread = scenario.threads.find((t) => t.id === st.threadId);
  const color = threadColor(scenario.threads as Thread[], st.threadId);
  const selected = st.id === selectedStepId;
  const isAsync = st.action === 'publish' || st.action === 'consume';
  const isFeedback = thread?.kind === 'feedback' || st.action === 'callback';
  const dash = isFeedback ? '2 4' : isAsync ? '7 4' : undefined;
  const marker = `url(#${isAsync ? 'open' : 'fill'}-${color.slice(1)})`;

  const incomplete = !iface || !caller;
  const num = nums.get(st.id) ?? '';
  const hit = (
    <rect x={0} y={y - ROW_H / 2} width={width} height={ROW_H} fill={selected ? color : 'transparent'} opacity={selected ? 0.1 : 1} />
  );

  if (incomplete) {
    return (
      <g className="step" onClick={() => onSelect?.(st.id)}>
        {hit}
        <text x={10} y={y + 4} className="step-num" fill={color}>
          {num}
        </text>
        <text x={LEFT} y={y + 4} className="arrow-label warn">
          צעד לא שלם — בחר קורא וממשק
        </text>
      </g>
    );
  }

  const owner = iface.componentId;
  const [from, to] = st.action === 'consume' ? [owner, caller.id] : [caller.id, owner];
  const vip = st.viaVipId ? idx.interfaces.get(st.viaVipId) : undefined;
  const x1 = x(from);
  const x2 = x(to);
  const label = `${isFeedback ? '↩ ' : ''}${interfaceLabel(iface)}`;

  const segs: [number, number][] = [];
  const vipX = vip && vip.componentId !== from && vip.componentId !== to ? x(vip.componentId) : null;
  if (vipX !== null) segs.push([x1, vipX], [vipX, x2]);
  else segs.push([x1, x2]);

  return (
    <g className="step" onClick={() => onSelect?.(st.id)}>
      {hit}
      <text x={10} y={y + 4} className="step-num" fill={color}>
        {num}
      </text>
      {x1 === x2 ? (
        <path
          d={`M${x1},${y - 8} h34 v16 h-31`}
          fill="none"
          stroke={color}
          strokeWidth={selected ? 2.4 : 1.6}
          strokeDasharray={dash}
          markerEnd={marker}
        />
      ) : (
        segs.map(([a, b], i) => (
          <line
            key={i}
            x1={a}
            y1={y}
            x2={b + (b > a ? -3 : 3)}
            y2={y}
            stroke={color}
            strokeWidth={selected ? 2.4 : 1.6}
            strokeDasharray={dash}
            markerEnd={marker}
          />
        ))
      )}
      {vipX !== null && (
        <g>
          <rect x={vipX - 6} y={y - 6} width={12} height={12} transform={`rotate(45 ${vipX} ${y})`} className="vip-mark" />
          <text x={vipX} y={y + 18} textAnchor="middle" className="vip-label">
            {vip!.name}
          </text>
        </g>
      )}
      <text x={x1 === x2 ? x1 + 40 : (x1 + x2) / 2} y={y - (vipX !== null ? 11 : 6)} textAnchor={x1 === x2 ? 'start' : 'middle'} className="arrow-label" fill={color}>
        {truncate(label, 42)}
      </text>
    </g>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
