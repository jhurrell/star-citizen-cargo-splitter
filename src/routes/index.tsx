import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CargoSplitter } from "../components/CargoSplitter";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Cargo Splitter" }] }),
  component: Home,
});

function Home() {
  return (
    <div className="wrap">
      <header>
        <h1>Cargo Splitter</h1>
        <p>
          Enter the SCU on each row. Each row is filled with the biggest checked container size that fits its grid
          first, then the next size down, until every SCU is placed. Uncheck a size in the header to skip it.
        </p>
      </header>
      {/* The table lives in this browser's localStorage, so the server renders
          only the heading and the browser renders the rest. */}
      <ClientOnly fallback={<p className="hint">Loading…</p>}>
        <CargoSplitter />
      </ClientOnly>
    </div>
  );
}
