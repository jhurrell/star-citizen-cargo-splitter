import { useEffect, useState } from "react";

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
