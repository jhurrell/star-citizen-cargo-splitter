import { useTimedFlag } from "./hooks";

const DISARM_MS = 3000; // how long it waits for the second click

/* A button for something that can't be undone. The first click turns it into
   an amber "Confirm" for a few seconds; only a second click in that time does
   it. Give it a fixed width in CSS, so changing its label moves nothing. */
export function ConfirmButton({
  label,
  ariaLabel,
  confirmAriaLabel,
  className,
  disabled = false,
  onConfirm,
}: {
  label: string;
  /* What screen readers hear, when `label` alone doesn't say enough. */
  ariaLabel?: string;
  /* What screen readers hear while it waits for the second click. */
  confirmAriaLabel: string;
  className: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useTimedFlag(DISARM_MS);
  return (
    <button
      type="button"
      className={`btn ${className}${armed ? " is-armed" : ""}`}
      disabled={disabled && !armed}
      aria-label={armed ? confirmAriaLabel : ariaLabel}
      onClick={() => {
        setArmed(!armed);
        if (armed) onConfirm();
      }}
    >
      {armed ? "Confirm" : label}
    </button>
  );
}
