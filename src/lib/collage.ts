import type { CollageCell, CollageLayout } from "./types";

export interface CollageTemplate {
  id: string;
  name: string;
  count: number; // exact photo count this template fits
  cols: number;
  rows: number;
  cells: CollageCell[];
}

const c = (
  col: number,
  row: number,
  colSpan = 1,
  rowSpan = 1,
): CollageCell => ({ col, row, colSpan, rowSpan });

const TEMPLATES: CollageTemplate[] = [
  // 1
  { id: "solo", name: "Tek", count: 1, cols: 1, rows: 1, cells: [c(1, 1)] },

  // 2
  {
    id: "duo-h",
    name: "Yan yana",
    count: 2,
    cols: 2,
    rows: 1,
    cells: [c(1, 1), c(2, 1)],
  },
  {
    id: "duo-v",
    name: "Alt alta",
    count: 2,
    cols: 1,
    rows: 2,
    cells: [c(1, 1), c(1, 2)],
  },

  // 3
  {
    id: "tri-left",
    name: "Solda büyük",
    count: 3,
    cols: 2,
    rows: 2,
    cells: [c(1, 1, 1, 2), c(2, 1), c(2, 2)],
  },
  {
    id: "tri-top",
    name: "Üstte büyük",
    count: 3,
    cols: 2,
    rows: 2,
    cells: [c(1, 1, 2, 1), c(1, 2), c(2, 2)],
  },
  {
    id: "tri-rows",
    name: "Üç satır",
    count: 3,
    cols: 1,
    rows: 3,
    cells: [c(1, 1), c(1, 2), c(1, 3)],
  },

  // 4
  {
    id: "quad",
    name: "2×2",
    count: 4,
    cols: 2,
    rows: 2,
    cells: [c(1, 1), c(2, 1), c(1, 2), c(2, 2)],
  },
  {
    id: "quad-top",
    name: "Üstte şerit",
    count: 4,
    cols: 3,
    rows: 2,
    cells: [c(1, 1, 3, 1), c(1, 2), c(2, 2), c(3, 2)],
  },

  // 5
  {
    id: "five-top",
    name: "Üstte büyük",
    count: 5,
    cols: 2,
    rows: 3,
    cells: [c(1, 1, 2, 1), c(1, 2), c(2, 2), c(1, 3), c(2, 3)],
  },
  {
    id: "five-left",
    name: "Solda büyük",
    count: 5,
    cols: 3,
    rows: 2,
    cells: [c(1, 1, 1, 2), c(2, 1), c(3, 1), c(2, 2), c(3, 2)],
  },

  // 6
  {
    id: "six-2x3",
    name: "2×3",
    count: 6,
    cols: 2,
    rows: 3,
    cells: [c(1, 1), c(2, 1), c(1, 2), c(2, 2), c(1, 3), c(2, 3)],
  },
  {
    id: "six-3x2",
    name: "3×2",
    count: 6,
    cols: 3,
    rows: 2,
    cells: [c(1, 1), c(2, 1), c(3, 1), c(1, 2), c(2, 2), c(3, 2)],
  },
];

/** Uniform grid template for any photo count (used for 7+ and as a fallback). */
function gridTemplate(n: number): CollageTemplate {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cells: CollageCell[] = [];
  for (let i = 0; i < n; i++) {
    cells.push(c((i % cols) + 1, Math.floor(i / cols) + 1));
  }
  return { id: `grid-${n}`, name: "Izgara", count: n, cols, rows, cells };
}

/** All templates that fit a given photo count. */
export function templatesForCount(n: number): CollageTemplate[] {
  if (n <= 0) return [];
  const exact = TEMPLATES.filter((t) => t.count === n);
  if (exact.length > 0) {
    return n <= 6 ? exact : [...exact, gridTemplate(n)];
  }
  return [gridTemplate(n)];
}

export function layoutFromTemplate(t: CollageTemplate): CollageLayout {
  return { templateId: t.id, cols: t.cols, rows: t.rows, cells: t.cells };
}

/** Default ("auto") layout for a photo count. */
export function autoLayout(n: number): CollageLayout {
  const list = templatesForCount(n);
  if (list.length === 0) {
    return { templateId: "empty", cols: 1, rows: 1, cells: [] };
  }
  return layoutFromTemplate(list[0]);
}

/** True when the saved layout still matches the current photo count. */
export function layoutFitsCount(layout: CollageLayout, n: number): boolean {
  return layout.cells.length === n;
}
