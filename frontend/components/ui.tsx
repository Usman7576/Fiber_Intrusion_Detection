/** Small shadcn-style primitives, written in-repo (no generator needed). */

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...p} />;
}

export function CardHeader({
  title,
  subtitle,
  icon,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-accent">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

export function Badge({
  color,
  children,
  className,
  solid,
}: {
  color: string;
  children: ReactNode;
  className?: string;
  solid?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", className)}
      style={
        solid
          ? { backgroundColor: color, color: "#070B12" }
          : { backgroundColor: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}40` }
      }
    >
      {children}
    </span>
  );
}

type Variant = "primary" | "ghost" | "outline";

export function Button({
  variant = "outline",
  active,
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; active?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-accent text-bg hover:bg-accent/85",
        variant === "outline" && "border border-line-strong text-ink hover:bg-white/5",
        variant === "ghost" && "text-muted hover:bg-white/5 hover:text-ink",
        active && "border-accent/60 bg-accent/10 text-accent",
        className,
      )}
      {...p}
    />
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line-strong p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
            o.value === value ? "bg-accent/15 text-accent" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-8 rounded-lg border border-line-strong bg-panel-2 px-2.5 text-xs text-ink outline-none focus-visible:border-accent",
        className,
      )}
      {...p}
    />
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: string;
}) {
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {icon && <span style={{ color: tone }}>{icon}</span>}
      </div>
      <div className="num mt-1.5 truncate text-2xl font-semibold" style={{ color: tone }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-xs text-faint">{hint}</div>}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-white/5", className)} />;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="max-w-sm text-xs text-muted">{children}</div>}
    </div>
  );
}
