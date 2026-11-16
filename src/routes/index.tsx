import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { CargoVisualizer } from "../components/CargoVisualizer";
import { Help } from "../components/Help";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Star Citizen Cargo Visualizer" }] }),
  component: Home,
});

function Home() {
  return (
    <div className="wrap">
      <header className="page-head">
        <h1>Star Citizen Cargo Visualizer</h1>
        <Help />
      </header>
      {/* The table lives in this browser's localStorage, so the server renders
          only the heading and the browser renders the rest. */}
      <ClientOnly fallback={<p className="hint">Loading…</p>}>
        <CargoVisualizer />
      </ClientOnly>
    </div>
  );
}
