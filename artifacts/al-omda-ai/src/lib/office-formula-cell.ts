export type WorksheetCell = { t?: string; v?: string | number | boolean | null; f?: string; [key: string]: unknown };

/**
 * Build the worksheet cell for a model-supplied Excel formula.
 *
 * XLSX.write drops a cell that carries only `{ f }` (no cached value), so the
 * formula cell disappears from the saved workbook entirely. That both breaks
 * the round-trip validation in AIChat and silently loses the formula for the
 * user. Keeping the model's cached value (when it provided one) preserves the
 * displayed result for viewers that do not recalculate; when the model left
 * the cell empty we store an empty-string placeholder so the cell survives the
 * write/read round trip. Excel still recalculates on load because the workbook
 * sets fullCalcOnLoad.
 */
export function buildFormulaWorksheetCell(existingCell: WorksheetCell | undefined, formula: string): WorksheetCell {
  const cell: WorksheetCell = { f: formula };
  if (existingCell && existingCell.v !== undefined && existingCell.v !== null && existingCell.v !== "") {
    cell.t = existingCell.t;
    cell.v = existingCell.v;
  } else {
    cell.t = "str";
    cell.v = "";
  }
  return cell;
}
