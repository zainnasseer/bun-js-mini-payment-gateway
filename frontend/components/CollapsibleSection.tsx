import { useState, type ReactNode } from "react";
import { IconChevronDown } from "./icons";

type Props = {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  variant?: "default" | "inline-head";
  /** Extra content on the right of the toggle (e.g. action buttons) when variant is inline-head */
  actions?: ReactNode;
};

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
  className = "",
  variant = "default",
  actions,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (variant === "inline-head") {
    return (
      <div className={`collapsible collapsible--inline${open ? " collapsible--open" : ""} ${className}`.trim()}>
        <div className="collapsible__head-row">
          <button
            type="button"
            className="collapsible__toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="collapsible__toggle-label">
              {title}
              {count !== undefined && <span className="collapsible__count">{count}</span>}
            </span>
            <IconChevronDown className="collapsible__chevron" />
          </button>
          {actions && <div className="collapsible__actions">{actions}</div>}
        </div>
        {open && <div className="collapsible__body">{children}</div>}
      </div>
    );
  }

  return (
    <div className={`collapsible${open ? " collapsible--open" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="collapsible__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="collapsible__toggle-label">
          {title}
          {count !== undefined && <span className="collapsible__count">{count}</span>}
        </span>
        <IconChevronDown className="collapsible__chevron" />
      </button>
      {open && <div className="collapsible__body">{children}</div>}
    </div>
  );
}
