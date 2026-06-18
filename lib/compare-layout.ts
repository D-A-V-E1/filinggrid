/** Column layout for the compare grid — tuned so financial tables stay readable at 6–8 tickers. */

export type CompareColumnDensity = "comfortable" | "compact";

export interface CompareColumnLayout {
  minWidth: number;
  density: CompareColumnDensity;
  /** Fixed pixel columns (horizontal scroll) instead of flexing with 1fr. */
  fixedColumns: boolean;
}

export function getCompareColumnLayout(columnCount: number): CompareColumnLayout {
  if (columnCount <= 3) {
    return { minWidth: 300, density: "comfortable", fixedColumns: false };
  }
  if (columnCount === 4) {
    return { minWidth: 320, density: "compact", fixedColumns: true };
  }
  if (columnCount === 5) {
    return { minWidth: 320, density: "compact", fixedColumns: true };
  }
  if (columnCount === 6) {
    return { minWidth: 308, density: "compact", fixedColumns: true };
  }
  if (columnCount === 7) {
    return { minWidth: 316, density: "compact", fixedColumns: true };
  }
  return { minWidth: 328, density: "compact", fixedColumns: true };
}

export function compareGridTemplateColumns(
  columnCount: number,
  layout: CompareColumnLayout
): string {
  if (layout.fixedColumns) {
    return `repeat(${columnCount}, ${layout.minWidth}px)`;
  }
  return `repeat(${columnCount}, minmax(${layout.minWidth}px, 1fr))`;
}
