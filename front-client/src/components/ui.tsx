import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline";
}) {
  const styles =
    variant === "primary"
      ? "ds-btn ds-btn--primary"
      : variant === "danger"
        ? "ds-btn ds-btn--danger"
        : variant === "outline"
          ? "ds-btn ds-btn--outline"
          : "ds-btn ds-btn--ghost";
  return <button className={`${styles} ${className}`.trim()} {...props} />;
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ds-input ${className}`.trim()} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`ds-select ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="ds-field-label">{label}</span>
      {children}
      {hint ? <span className="ds-field-hint">{hint}</span> : null}
    </label>
  );
}

export function Panel({
  children,
  className = "",
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`ds-card ${accent ? "border-[var(--ds-color-primary)]" : ""} ${className}`.trim()}
      style={
        accent
          ? { borderLeftWidth: "var(--ds-accent-width)", borderLeftColor: "var(--ds-color-focus)" }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-color-border)] bg-[var(--ds-color-card)] px-6 py-12 text-center">
      <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--ds-color-foreground)]">
        {title}
      </p>
      <p className="ds-meta mx-auto mt-2 max-w-[48ch] font-normal leading-relaxed">
        {body}
      </p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Money({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums tracking-[-0.02em] ${className}`}>
      {new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(value)}
    </span>
  );
}

export function ListSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={`divide-y divide-[var(--ds-color-border)] overflow-hidden rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border)] bg-[var(--ds-color-card)] ${className}`.trim()}
    >
      {children}
    </ul>
  );
}
