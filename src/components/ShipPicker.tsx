import { useId, useMemo, useRef, useState } from "react";
import type { Ship } from "../lib/cargo";
import { fmt, sum } from "../lib/format";
import { filterByName, matchedParts } from "../lib/search";

/* The most SCU a ship carries: its biggest layout's total. */
const maxScu = (ship: Ship) => Math.max(0, ...ship.grids.map((g) => sum(g.positions, (p) => p.capacity)));

/* The ship, chosen by typing: the list narrows to ships with each typed word
   anywhere in their name, each shown with the most SCU it carries. Arrow keys
   move through it, Enter or a click picks, Escape gives up. While closed it
   shows the chosen ship's name. */
export function ShipPicker({
  ships,
  value,
  onChange,
}: {
  ships: Ship[];
  value: string;
  onChange: (shipId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  /* What's typed while the list is open; null while it's closed. */
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const selected = ships.find((s) => s.id === value);
  const open = query !== null;
  const matches = useMemo(() => (query === null ? [] : filterByName(ships, query)), [ships, query]);
  const optionId = (i: number) => `${listId}-${i}`;

  const show = (text: string) => {
    setQuery(text);
    setActive(0);
  };
  const pick = (ship: Ship | undefined) => {
    if (ship) onChange(ship.id);
    setQuery(null);
    input.current?.blur();
  };
  const move = (by: number) => {
    if (!matches.length) return;
    const next = (active + by + matches.length) % matches.length;
    setActive(next);
    list.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="picker ship-picker">
      {/* No visible label: the placeholder says what it's for, and screen
          readers hear "Ship". */}
      <div className="ship-field">
        <input
          ref={input}
          id="ship"
          aria-label="Ship"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && matches.length ? optionId(active) : undefined}
          placeholder="Enter or select a ship"
          value={open ? query : (selected?.name ?? "")}
          disabled={ships.length === 0}
          onFocus={() => show("")}
          onClick={() => !open && show("")}
          onBlur={() => setQuery(null)}
          onChange={(e) => show(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (open) move(e.key === "ArrowDown" ? 1 : -1);
              else show("");
            } else if (e.key === "Enter" && open) {
              e.preventDefault();
              pick(matches[active]);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              pick(undefined);
            }
          }}
        />
        {open && (
          <ul ref={list} className="ship-options" id={listId} role="listbox" aria-label="Ships">
            {matches.map((ship, i) => (
              <li
                key={ship.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                className={ship.id === value ? "is-current" : undefined}
                /* Keep focus in the input, so picking doesn't count as leaving it first. */
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(ship)}
              >
                <span>
                  {matchedParts(ship.name, query).map((part, j) =>
                    part.hit ? <mark key={j}>{part.text}</mark> : part.text,
                  )}
                </span>
                <span className="ship-scu">{fmt(maxScu(ship))} SCU</span>
              </li>
            ))}
            {!matches.length && (
              <li className="ship-none" role="option" aria-selected={false} aria-disabled>
                No ships match “{query}”
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
