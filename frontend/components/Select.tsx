import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown } from "./icons";

export type SelectOption = {
  value: string;
  label: string;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

function computeMenuPosition(trigger: HTMLElement): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const viewportPad = 8;
  const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPad;
  const spaceAbove = rect.top - gap - viewportPad;
  const preferBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
  const maxHeight = Math.min(280, preferBelow ? spaceBelow : spaceAbove, window.innerHeight - viewportPad * 2);

  return {
    top: preferBelow ? rect.bottom + gap : rect.top - gap - maxHeight,
    left: rect.left,
    width: rect.width,
    maxHeight: Math.max(maxHeight, 80),
  };
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled = false,
  "aria-label": ariaLabel,
}: Props) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);

  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? (value === "" ? placeholder : value);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPos(null);
      return;
    }

    function syncPosition() {
      if (triggerRef.current) setMenuPos(computeMenuPosition(triggerRef.current));
    }

    syncPosition();
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: string) {
    onValueChange(next);
    setOpen(false);
  }

  const menu =
    open && menuPos
      ? createPortal(
          <ul
            ref={menuRef}
            id={listboxId}
            className="ui-select__menu ui-select__menu--portal"
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value || "__empty"} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={isSelected ? "ui-select__option ui-select__option--selected" : "ui-select__option"}
                    onClick={() => pick(opt.value)}
                  >
                    {opt.label}
                    {isSelected && (
                      <span className="ui-select__check" aria-hidden>
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )
      : null;

  return (
    <>
      <div
        ref={rootRef}
        className={`ui-select${open ? " ui-select--open" : ""}${disabled ? " ui-select--disabled" : ""}`}
      >
        <button
          ref={triggerRef}
          type="button"
          className="ui-select__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={`ui-select__value${!selected && value === "" ? " ui-select__value--placeholder" : ""}`}>
            {display}
          </span>
          <IconChevronDown className="ui-select__chevron" />
        </button>
      </div>
      {menu}
    </>
  );
}
