import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CircleNotch, X, CaretLeft, CaretRight } from '@phosphor-icons/react';

export const cx = (...a) => a.filter(Boolean).join(' ');

// ---- Boutons en relief (ombre fixe 4 px, sans flou) ----
const BTN = {
  primary: 'bg-lagon text-white shadow-press shadow-lagon-dark hover:brightness-105',
  secondary: 'bg-white text-ink border-2 border-line shadow-press shadow-line hover:bg-lagon-bg',
  danger: 'bg-danger text-white shadow-press shadow-danger-dark hover:brightness-105',
  dangerSoft: 'bg-white text-danger border-2 border-line shadow-press shadow-line hover:bg-danger-tint',
  ghost: 'text-lagon-text hover:bg-lagon-tint',
};
export function Button({ variant = 'primary', size = 'md', loading, className, children, ...p }) {
  const sz = size === 'sm' ? 'h-9 px-3 text-sm rounded-xl' : 'h-11 px-5 text-[15px] rounded-2xl';
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 font-extrabold select-none transition active:translate-y-[4px] active:shadow-none disabled:opacity-50 disabled:active:translate-y-0',
        variant === 'ghost' && 'active:translate-y-0', sz, BTN[variant], className)}
    >
      {loading && <CircleNotch size={18} weight="bold" className="animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...p }) {
  return <div {...p} className={cx('bg-white border-2 border-line rounded-2xl', className)}>{children}</div>;
}
export function CardHead({ title, sub, right }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
      <div><h3 className="font-extrabold text-ink text-[16px]">{title}</h3>{sub && <p className="text-sm text-ink-soft mt-0.5">{sub}</p>}</div>
      {right}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-ink-soft text-[13px] font-bold">
        {Icon && <Icon size={18} weight="bold" className="text-lagon" />}{label}
      </div>
      <div className="mt-1.5 text-[26px] leading-tight font-black text-ink">{value}</div>
      {hint && <div className="text-[13px] text-ink-soft mt-0.5">{hint}</div>}
    </Card>
  );
}

const BADGE = {
  lagon: 'bg-lagon-tint text-lagon-text',
  gray: 'bg-[#F1F1F1] text-ink-soft',
  danger: 'bg-danger-tint text-danger-dark',
  gold: 'bg-[#FDF3DC] text-[#8A6100]',
};
export const Badge = ({ tone = 'gray', children }) => <span className={cx('inline-flex items-center h-6 px-2 rounded-lg text-xs font-extrabold whitespace-nowrap', BADGE[tone])}>{children}</span>;

export const Input = ({ className, ...p }) => (
  <input {...p} className={cx('h-11 w-full rounded-xl border-2 border-line bg-[#F7F7F7] px-3.5 text-[15px] font-semibold text-ink placeholder:text-ink-faint outline-none focus:border-lagon focus:bg-white', className)} />
);
export const Textarea = ({ className, ...p }) => (
  <textarea {...p} className={cx('w-full rounded-xl border-2 border-line bg-[#F7F7F7] px-3.5 py-2.5 text-[15px] font-semibold text-ink placeholder:text-ink-faint outline-none focus:border-lagon focus:bg-white', className)} />
);
export const Select = ({ className, children, ...p }) => (
  <select {...p} className={cx('h-11 rounded-xl border-2 border-line bg-white px-3 text-[14px] font-bold text-ink outline-none focus:border-lagon', className)}>{children}</select>
);
export const Label = ({ children, hint }) => (
  <label className="block text-[13px] font-extrabold text-ink mb-1.5">{children}{hint && <span className="font-semibold text-ink-soft"> · {hint}</span>}</label>
);

export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex bg-[#F1F1F1] rounded-xl p-1 gap-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cx('h-8 px-3 rounded-lg text-[13px] font-extrabold', value === o.value ? 'bg-white text-lagon-text border-2 border-line' : 'text-ink-soft hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Spinner = ({ className }) => <CircleNotch size={26} weight="bold" className={cx('animate-spin text-lagon', className)} />;
export const Loading = () => <div className="flex justify-center py-16"><Spinner /></div>;
export function Empty({ icon: Icon, title, text }) {
  return (
    <div className="text-center py-12 px-6">
      {Icon && <Icon size={36} weight="bold" className="mx-auto text-ink-faint" />}
      <p className="font-extrabold text-ink mt-3">{title}</p>
      {text && <p className="text-sm text-ink-soft mt-1">{text}</p>}
    </div>
  );
}
export const ErrorBox = ({ error, retry }) => (
  <Card className="p-5 border-danger-tint">
    <p className="font-extrabold text-danger-dark">Impossible de charger</p>
    <p className="text-sm text-ink-soft mt-1">{error?.message}</p>
    {retry && <Button size="sm" variant="secondary" className="mt-3" onClick={retry}>Réessayer</Button>}
  </Card>
);

// ---- Tableau ----
export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[12px] uppercase tracking-wide text-ink-soft border-y-2 border-line bg-[#FAFAFA]">
            {head.map((h, i) => <th key={i} className={cx('px-4 py-2.5 font-extrabold whitespace-nowrap', h?.right && 'text-right')}>{h?.label ?? h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-line">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ className, children, ...p }) => <td {...p} className={cx('px-4 py-3 align-middle text-ink', className)}>{children}</td>;

export function Pager({ page, total, limit, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t-2 border-line text-sm text-ink-soft font-bold">
      <span>{total} résultat{total > 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente"><CaretLeft weight="bold" /></Button>
        <span>{page} / {pages}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante"><CaretRight weight="bold" /></Button>
      </div>
    </div>
  );
}

export function Avatar({ name, src, size = 36 }) {
  const initials = (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  if (src) return <img src={src} alt="" className="rounded-full object-cover border-2 border-line" style={{ width: size, height: size }} />;
  return <div className="rounded-full bg-lagon-tint text-lagon-text font-black flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</div>;
}

// ---- Graphique en barres (une seule couleur) ----
export function Bars({ data, field, height = 140, color = '#00A3A8', label }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d[field]));
  const w = 100 / Math.max(1, data.length);
  const h = hover != null ? data[hover] : null;
  return (
    <div>
      <div className="h-6 text-[13px] font-bold text-ink-soft">
        {h ? <span><span className="text-ink">{h[field]}</span> {label} · {new Date(h.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
          : <span>Total : <span className="text-ink">{data.reduce((s, d) => s + d[field], 0)}</span> {label}</span>}
      </div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => {
          const bh = (d[field] / max) * (height - 4);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={i * w} y={0} width={w} height={height} fill="transparent" />
              <rect x={i * w + w * 0.15} y={height - Math.max(bh, 1.5)} width={w * 0.7} height={Math.max(bh, 1.5)} rx={0.8}
                fill={d[field] ? color : '#E5E5E5'} opacity={hover == null || hover === i ? 1 : 0.45} />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] font-bold text-ink-faint mt-1">
        <span>{data[0] && new Date(data[0].day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
        <span>aujourd'hui</span>
      </div>
    </div>
  );
}

// ---- Fenêtre modale ----
export function Modal({ open, onClose, title, children, footer, width = 480 }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="bg-white rounded-2xl border-2 border-line w-full max-h-[90vh] flex flex-col" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-line">
          <h3 className="font-black text-ink text-[17px]">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F1F1F1] text-ink-soft" aria-label="Fermer"><X size={20} weight="bold" /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-4 border-t-2 border-line flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Notifications (toasts) ----
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  const push = useCallback((text, tone = 'ok') => {
    const k = ++id.current;
    setItems((x) => [...x, { k, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.k !== k)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.k} className={cx('px-4 py-3 rounded-2xl border-2 font-bold text-[14px] bg-white max-w-sm', t.tone === 'error' ? 'border-danger text-danger-dark' : 'border-lagon text-lagon-text')}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---- Chargement de données ----
export function useApi(fn, deps = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const run = useCallback(async () => {
    set((s) => ({ ...s, loading: true, error: null }));
    try { set({ data: await fn(), error: null, loading: false }); }
    catch (error) { set({ data: null, error, loading: false }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function PageHead({ title, sub, right }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div><h1 className="text-[26px] font-black text-ink leading-tight">{title}</h1>{sub && <p className="text-ink-soft font-semibold mt-1">{sub}</p>}</div>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </div>
  );
}
