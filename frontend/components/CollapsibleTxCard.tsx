import { useState, type ReactNode } from "react";
import { IconChevronDown } from "./icons";

type Props = {
  selected: boolean;
  onSelect: () => void;
  summary: ReactNode;
  children: ReactNode;
};

/** List row — compact summary by default; chevron expands extra details. */
export function CollapsibleTxCard({ selected, onSelect, summary, children }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`tx-card${selected ? " selected" : ""}`}>
      <div className="tx-card__main">
        <button type="button" className="tx-card__hit" onClick={onSelect}>
          {summary}
        </button>
        <button
          type="button"
          className={`tx-card__expand${expanded ? " tx-card__expand--open" : ""}`}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          onClick={() => setExpanded((v) => !v)}
        >
          <IconChevronDown />
        </button>
      </div>
      {expanded && <div className="tx-card__details">{children}</div>}
    </div>
  );
}
