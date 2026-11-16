/* Icons for buttons, drawn with the button's text color. Each is decorative:
   the button it's in carries the name. */

/* A table: copy for a spreadsheet. */
export function SpreadsheetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="btn-icon">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M3 15h18M9 10v10M15 10v10" />
    </svg>
  );
}

/* The Markdown mark: an M and a down arrow in a box. */
export function MarkdownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="btn-icon">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 15V9l2.5 3L11 9v6M16 9v6M13.5 12.5 16 15l2.5-2.5" />
    </svg>
  );
}
