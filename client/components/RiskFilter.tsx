import { useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const labels = {
  all: 'All messages',
  high: 'High risk',
  medium: 'Medium risk',
  low: 'Low risk',
  none: 'No risk detected',
  pending: 'Awaiting analysis',
  failed: 'Analysis failed',
};
type Filter = keyof typeof labels;

export function RiskFilter({
  value,
  counts,
  onChange,
}: {
  value: Filter;
  counts: Record<Filter, number>;
  onChange: (value: Filter) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  function toggle() {
    const popup = panel.current!;
    if (popup.matches(':popover-open')) {
      popup.hidePopover();
      return;
    }
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(240, window.innerWidth - 24);
    popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upward = below < 300 && above > below;
    popup.style.top = upward ? 'auto' : `${rect.bottom + 6}px`;
    popup.style.bottom = upward ? `${window.innerHeight - rect.top + 6}px` : 'auto';
    popup.style.maxHeight = `${Math.max(80, (upward ? above : below) - 6)}px`;
    popup.showPopover();
    popup.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="risk-filter-trigger"
        aria-label={`Filter messages: ${labels[value]}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        {labels[value]} ({counts[value]}) <ChevronDown size={13} />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="risk-filter-popover"
        role="dialog"
        aria-label="Filter messages"
        onToggle={(event) => setOpen(event.newState === 'open')}
      >
        {Object.entries(labels).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={key === value}
            onClick={() => {
              onChange(key as Filter);
              panel.current?.hidePopover();
              trigger.current?.focus();
            }}
          >
            <span>{label}</span>
            <span>{counts[key as Filter]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
