import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import "./ui.css";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");


type ButtonVariant = "primary" | "lime" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  loading?: boolean;
  icon?: IconName;
  iconAfter?: IconName;
}

export function Button({
  variant = "secondary",
  size = "md",
  block,
  loading,
  icon,
  iconAfter,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "btn",
        `btn--${variant}`,
        size !== "md" && `btn--${size}`,
        block && "btn--block",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="btn__spinner" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {iconAfter && !loading ? <Icon name={iconAfter} size={16} /> : null}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  ...rest
}: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={17} />
    </button>
  );
}


export function Card({
  children,
  pad,
  className,
  style,
}: {
  children: ReactNode;
  pad?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={cx("card", pad && "card--pad", className)} style={style}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="card__header">
      <div>
        <h2 className="card__title">{title}</h2>
        {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 10 }}>{actions}</div> : null}
    </header>
  );
}


export function Stat({
  icon,
  value,
  label,
  hint,
  hintTone,
  hintIcon,
  iconTone,
}: {
  icon: IconName;
  value: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  hintTone?: "up" | "down";
  hintIcon?: IconName;
  iconTone?: string;
}) {
  return (
    <Card className="stat">
      <span className="stat__icon" style={iconTone ? { color: iconTone } : undefined}>
        <Icon name={icon} size={18} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="stat__value">{value}</div>
        <div className="stat__label">{label}</div>
        {hint ? (
          <div className={cx("stat__hint", hintTone && `stat__hint--${hintTone}`)}>
            {hintIcon ? <Icon name={hintIcon} size={13} /> : null}
            {hint}
          </div>
        ) : null}
      </div>
    </Card>
  );
}


export function Badge({
  tone = "neutral",
  dot,
  live,
  icon,
  children,
}: {
  tone?: "success" | "warn" | "danger" | "neutral" | "lime";
  dot?: boolean;
  live?: boolean;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={cx("badge", `badge--${tone}`)}>
      {dot ? <span className={cx("badge__dot", live && "badge__dot--live")} /> : null}
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}


export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  hideLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <button
      type="button"
      className="toggle"
      data-on={checked}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
      {hideLabel ? null : <span className="toggle__label">{label}</span>}
    </button>
  );
}


export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="field__error">{error}</p> : hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  id,
  ...rest
}: { label: string; hint?: ReactNode; error?: string | null } & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <input className="input" id={inputId} aria-invalid={!!error} {...rest} />
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  id,
  children,
  ...rest
}: { label: string; hint?: ReactNode; error?: string | null } & SelectHTMLAttributes<HTMLSelectElement>) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={selectId}>
      <select className="select" id={selectId} {...rest}>
        {children}
      </select>
    </Field>
  );
}


export function Segmented<T extends string>({
  value,
  options,
  onChange,
  tone,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  tone?: "lime";
  ariaLabel: string;
}) {
  return (
    <div className={cx("segmented", tone === "lime" && "segmented--lime")} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__item"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}


export function RowMenu({
  items,
  label = "Row actions",
}: {
  items: { label: string; icon?: IconName; danger?: boolean; onSelect: () => void; disabled?: boolean }[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <IconButton
        icon="more"
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
      {open ? (
        <div className="menu__list" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={cx("menu__item", item.danger && "menu__item--danger")}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon ? <Icon name={item.icon} size={15} /> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}


export function Modal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  footerLead,
  size = "md",
}: {
  title: string;
  subtitle?: ReactNode;
  /** Shown as a tinted tile beside the title. */
  icon?: IconName;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Left-aligned footer content, opposite the actions. */
  footerLead?: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="modal__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cx("modal", size !== "md" && `modal--${size}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal__header">
          {icon ? (
            <span className="modal__icon" aria-hidden="true">
              <Icon name={icon} size={24} />
            </span>
          ) : null}
          <div className="modal__heading">
            <h2 id={titleId} className="modal__title">
              {title}
            </h2>
            {subtitle ? <p className="modal__subtitle">{subtitle}</p> : null}
          </div>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="modal__body">{children}</div>
        {footer || footerLead ? (
          <div className="modal__footer">
            {footerLead ? <div className="modal__footer-lead">{footerLead}</div> : null}
            <div className="modal__footer-actions">{footer}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}


export function Alert({
  tone = "info",
  children,
  icon,
}: {
  tone?: "error" | "info" | "success";
  children: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className={cx("alert", `alert--${tone}`)} role={tone === "error" ? "alert" : undefined}>
      <Icon name={icon ?? (tone === "error" ? "alert" : "info")} size={16} style={{ marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={19} />
      </span>
      <span className="empty__title">{title}</span>
      {children ? <span style={{ maxWidth: 380, fontSize: 13 }}>{children}</span> : null}
      {action ? <span style={{ marginTop: 6 }}>{action}</span> : null}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", radius }: { height?: number; width?: number | string; radius?: number }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius }} />;
}


interface Toast {
  id: number;
  message: string;
  tone: "default" | "error";
}

const ToastContext = createContext<(message: string, tone?: "default" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const push = useCallback((message: string, tone: "default" | "error" = "default") => {
    const id = ++next.current;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4200);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx("toast", toast.tone === "error" && "toast--error")}>
            <Icon name={toast.tone === "error" ? "alert" : "check"} size={16} />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export { Icon } from "./Icon";
export { Logo, Wordmark } from "./Icon";
export type { IconName } from "./Icon";
