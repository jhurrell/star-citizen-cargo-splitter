import { useCallback, useEffect, useMemo, useState } from "react";
import { emphasize, type Slots } from "./emphasis";
import type { Haul } from "./haul";
import type { Row } from "./state";

/* A message that clears itself `ms` after it was last shown. */
export function useTimedMessage(ms: number): [string, (message: string) => void] {
  /* `shown` counts showings, so the same message twice restarts the timer. */
  const [message, setMessage] = useState({ text: "", shown: 0 });
  useEffect(() => {
    if (!message.text) return;
    const timer = setTimeout(() => setMessage((m) => ({ ...m, text: "" })), ms);
    return () => clearTimeout(timer);
  }, [message, ms]);
  return [message.text, (text) => setMessage((m) => ({ text, shown: m.shown + 1 }))];
}

/* A flag that turns itself off `ms` after it was turned on, for two-step
   actions such as Clear table. */
export function useTimedFlag(ms: number): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return [on, setOn];
}

/* The page's emphasis (see emphasize), with the state it needs: the rows
   turned off in the legend, the rows pointed at, and the colors handed out.
   The colors are remembered from render to render, never saved. */
export function useEmphasis(rows: Row[], haul: Haul) {
  const [turnedOff, setTurnedOff] = useState<ReadonlySet<number>>(() => new Set());
  const [pointed, point] = useState<number[] | null>(null);
  const [slots, setSlots] = useState<Slots>(() => new Map());
  const inView = useMemo(() => new Set(haul.grids.flatMap((g) => g.placed.map((p) => p.tag))), [haul]);
  const emphasis = useMemo(
    () => emphasize({ rows, inView, slots, turnedOff, pointed }),
    [rows, inView, slots, turnedOff, pointed],
  );
  /* Remember newly handed-out colors; React re-renders straight away. */
  if (emphasis.slots !== slots) setSlots(emphasis.slots);

  /* Turn rows off in the legend, or (with false) back on. */
  const turnOff = useCallback(
    (ids: number[], off: boolean) =>
      setTurnedOff((before) => {
        const after = new Set(before);
        for (const id of ids) {
          if (off) after.add(id);
          else after.delete(id);
        }
        return after;
      }),
    [],
  );
  return { ...emphasis, turnOff, point };
}
