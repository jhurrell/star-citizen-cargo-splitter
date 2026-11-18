import { useCallback, useEffect, useMemo, useState } from "react";
import { emphasize, type Slots, type View } from "../lib/emphasis";
import type { Haul } from "../lib/haul";
import type { Row } from "../lib/state";

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
   actions such as Reset all. */
export function useTimedFlag(ms: number): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return [on, setOn];
}

/* The page's emphasis (see emphasize), with the state it needs: the view,
   the legend entries picked out, the rows pointed at, and each view's colors
   as handed out. None of it is saved: the view starts on Drop-off. */
export function useEmphasis(rows: Row[], haul: Haul) {
  const [view, setView] = useState<View>("dropoff");
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [pointed, point] = useState<number[] | null>(null);
  const [slotsByView, setSlotsByView] = useState<ReadonlyMap<View, Slots>>(() => new Map());
  const slots = slotsByView.get(view) ?? NO_SLOTS;
  const inView = useMemo(() => new Set(haul.grids.flatMap((g) => g.placed.map((p) => p.tag))), [haul]);
  const emphasis = useMemo(
    () => emphasize({ rows, inView, view, slots, picked, pointed }),
    [rows, inView, view, slots, picked, pointed],
  );
  /* Remember newly handed-out colors; React re-renders straight away. */
  if (emphasis.slots !== slots) setSlotsByView(new Map(slotsByView).set(view, emphasis.slots));

  /* Switch the view; what was picked out was in the old one, so none is now. */
  const changeView = useCallback((next: View) => {
    setView(next);
    setPicked(new Set());
  }, []);
  /* Pick a legend entry out, or (again) stop picking it out. */
  const togglePicked = useCallback(
    (key: string) =>
      setPicked((before) => {
        const after = new Set(before);
        if (!after.delete(key)) after.add(key);
        return after;
      }),
    [],
  );
  return { ...emphasis, view, changeView, togglePicked, point };
}

const NO_SLOTS: Slots = new Map();
