import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** Minimal hash router: "#/catalog/component/123" → ['catalog', 'component', '123']. */
export function useHashRoute(): [string[], (path: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [parts, (path: string) => (window.location.hash = `#/${path}`)];
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export interface ComboOption {
  id: string;
  label: string;
  sub?: string;
  group?: string;
}

/**
 * Searchable picker. `onCreate` adds a "צור חדש" entry that receives the typed text,
 * used for inline creation of draft catalog items.
 */
export function Combo({
  value,
  options,
  onChange,
  onCreate,
  placeholder = 'חפש…',
  allowEmpty,
  emptyLabel = '— ללא —',
}: {
  value: string | null;
  options: ComboOption[];
  onChange: (id: string | null) => void;
  onCreate?: (text: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    const list = t
      ? options.filter((o) => `${o.label} ${o.sub ?? ''} ${o.group ?? ''}`.toLowerCase().includes(t))
      : options;
    return list.slice(0, 80);
  }, [options, text]);

  type Item = { kind: 'opt'; opt: ComboOption } | { kind: 'empty' } | { kind: 'create' };
  const items: Item[] = [
    // While searching, hide the "none" entry so Enter picks the first match.
    ...(allowEmpty && !text.trim() ? [{ kind: 'empty' } as Item] : []),
    ...filtered.map((opt) => ({ kind: 'opt', opt }) as Item),
    ...(onCreate ? [{ kind: 'create' } as Item] : []),
  ];

  const pick = (it: Item) => {
    if (it.kind === 'opt') onChange(it.opt.id);
    else if (it.kind === 'empty') onChange(null);
    else onCreate?.(text.trim());
    setOpen(false);
    setText('');
  };

  let lastGroup: string | undefined;
  return (
    <div className="combo" ref={ref}>
      <button type="button" className={`combo-btn ${selected ? '' : 'muted'}`} onClick={() => setOpen((o) => !o)}>
        <span className="combo-value">{selected ? selected.label : value ? '(לא נמצא)' : allowEmpty ? emptyLabel : 'בחר…'}</span>
        {selected?.sub && <span className="combo-sub">{selected.sub}</span>}
        <span className="combo-caret">▾</span>
      </button>
      {open && (
        <div className="combo-pop">
          <input
            autoFocus
            value={text}
            placeholder={placeholder}
            onChange={(e) => {
              setText(e.target.value);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, items.length - 1));
              else if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0));
              else if (e.key === 'Enter' && items[hi]) {
                e.preventDefault();
                pick(items[hi]);
              } else if (e.key === 'Escape') setOpen(false);
            }}
          />
          <div className="combo-list">
            {items.map((it, i) => {
              const header =
                it.kind === 'opt' && it.opt.group && it.opt.group !== lastGroup ? ((lastGroup = it.opt.group), it.opt.group) : null;
              return (
                <div key={it.kind === 'opt' ? it.opt.id : it.kind}>
                  {header && <div className="combo-group">{header}</div>}
                  <div
                    className={`combo-item ${i === hi ? 'hi' : ''} ${it.kind === 'create' ? 'create' : ''}`}
                    onMouseEnter={() => setHi(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(it);
                    }}
                  >
                    {it.kind === 'opt' && (
                      <>
                        <span>{it.opt.label}</span>
                        {it.opt.sub && <span className="combo-sub">{it.opt.sub}</span>}
                      </>
                    )}
                    {it.kind === 'empty' && <span className="muted">{emptyLabel}</span>}
                    {it.kind === 'create' && <span>＋ צור חדש{text.trim() ? `: "${text.trim()}"` : '…'}</span>}
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <div className="combo-item muted">אין תוצאות</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="סגור">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorBanner({ error, onClose }: { error: unknown; onClose?: () => void }) {
  if (!error) return null;
  return (
    <div className="banner error">
      <span>{error instanceof Error ? error.message : String(error)}</span>
      {onClose && (
        <button className="icon-btn" onClick={onClose}>
          ✕
        </button>
      )}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'draft' | 'ext' | 'accent' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
