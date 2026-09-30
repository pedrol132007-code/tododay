import { useEffect, useRef, useState } from "react";
import { formatDue } from "../../lib/boardVisuals";
import { PERIOD_PRESETS, presetRange, type DayRange, type PeriodSelection } from "../../lib/metrics";
import { IconCalendar, IconChevronDown } from "../ui/icons";

export type { PeriodSelection };

export function selectionRange(selection: PeriodSelection, today: string): DayRange {
  return selection.kind === "preset" ? presetRange(selection.preset, today) : selection.range;
}

const dayLabel = (day: string, today: string) => formatDue(day, new Date(`${today}T12:00:00`));

export function selectionLabel(selection: PeriodSelection, today: string): string {
  if (selection.kind === "preset") return PERIOD_PRESETS.find((p) => p.id === selection.preset)!.label;
  return `${dayLabel(selection.range.start, today)} – ${dayLabel(selection.range.end, today)}`;
}

/**
 * Filtro de período global do dashboard ("Últimas 12 semanas ▾"): atalhos e um intervalo
 * personalizado. `min` é o primeiro dia com dados completos.
 */
export function PeriodPicker({
  value,
  onChange,
  today,
  min,
}: {
  value: PeriodSelection;
  onChange: (v: PeriodSelection) => void;
  today: string;
  min: string;
}) {
  const [open, setOpen] = useState(false);
  const current = selectionRange(value, today);
  const [start, setStart] = useState(current.start);
  const [end, setEnd] = useState(current.end);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      setStart(current.start);
      setEnd(current.end);
    }
    setOpen((v) => !v);
  }

  function pick(selection: PeriodSelection) {
    onChange(selection);
    setOpen(false);
  }

  const customValid = start >= min && end <= today && start <= end;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-sm text-text-primary hover:border-primary"
      >
        <IconCalendar size={14} />
        {selectionLabel(value, today)}
        <IconChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Período"
          className="absolute right-0 z-20 mt-2 flex w-72 flex-col gap-1 rounded-xl border border-border bg-bg-surface p-2 shadow-lg"
        >
          <div role="radiogroup" aria-label="Atalhos de período" className="flex flex-col">
            {PERIOD_PRESETS.map((p) => {
              const checked = value.kind === "preset" && value.preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => pick({ kind: "preset", preset: p.id })}
                  className={`rounded-lg px-3 py-1.5 text-left text-sm ${checked ? "bg-primary text-on-accent" : "text-text-primary hover:bg-bg-elevated"}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <form
            className="mt-1 flex flex-col gap-2 border-t border-border px-1 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (customValid) pick({ kind: "custom", range: { start, end } });
            }}
          >
            <span className="px-2 text-xs font-semibold uppercase tracking-wider text-text-muted">Personalizado</span>
            <div className="flex items-center gap-2 px-2">
              <label className="flex flex-1 flex-col gap-1 text-xs text-text-muted">
                De
                <input
                  type="date"
                  value={start}
                  min={min}
                  max={end}
                  onChange={(e) => setStart(e.target.value)}
                  className="rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-text-muted">
                Até
                <input
                  type="date"
                  value={end}
                  min={start}
                  max={today}
                  onChange={(e) => setEnd(e.target.value)}
                  className="rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
                />
              </label>
            </div>
            <button type="submit" disabled={!customValid} className="btn-primary mx-2 mb-1 py-1.5 disabled:opacity-40">
              Aplicar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
