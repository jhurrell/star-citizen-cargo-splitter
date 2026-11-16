import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CargoVisualizer } from "../components/CargoVisualizer";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Star Citizen Cargo Visualizer" }] }),
  component: Home,
});

function Home() {
  return (
    <div className="wrap">
      <header>
        <h1>Star Citizen Cargo Visualizer</h1>
        <p>
          Enter the SCU on each row. Each row is filled with the biggest container size that's turned on and fits its
          grid first, then the next size down, until every SCU is placed. Click a size in the header to turn it off and
          skip it.
        </p>
      </header>
      {/* The table lives in this browser's localStorage, so the server renders
          only the heading and the browser renders the rest. */}
      <ClientOnly fallback={<p className="hint">Loading…</p>}>
        <CargoVisualizer />
      </ClientOnly>
    </div>
  );
}
