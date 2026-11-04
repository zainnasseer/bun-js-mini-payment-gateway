export const INSPECTOR_PANEL_DEFAULT_W = 400;
export const INSPECTOR_PANEL_MIN_W = 280;
export const INSPECTOR_PANEL_MAX_VW = 0.55;

const LS_INSPECTOR_W = "pg_inspector_w";

export function inspectorPanelMaxWidth(viewportWidth = window.innerWidth): number {
  return Math.max(
    INSPECTOR_PANEL_MIN_W,
    Math.floor(viewportWidth * INSPECTOR_PANEL_MAX_VW)
  );
}

export function clampInspectorPanelWidth(
  width: number,
  viewportWidth = window.innerWidth
): number {
  const max = inspectorPanelMaxWidth(viewportWidth);
  return Math.min(max, Math.max(INSPECTOR_PANEL_MIN_W, width));
}

export function getInitialInspectorPanelWidth(): number {
  if (typeof window === "undefined") return INSPECTOR_PANEL_DEFAULT_W;
  const stored = localStorage.getItem(LS_INSPECTOR_W);
  if (stored) {
    const n = Number.parseInt(stored, 10);
    if (!Number.isNaN(n)) return clampInspectorPanelWidth(n);
  }
  return clampInspectorPanelWidth(INSPECTOR_PANEL_DEFAULT_W);
}

export function persistInspectorPanelWidth(width: number): void {
  localStorage.setItem(LS_INSPECTOR_W, String(width));
}
