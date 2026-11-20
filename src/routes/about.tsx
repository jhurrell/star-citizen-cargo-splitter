import { createFileRoute } from "@tanstack/react-router";

const REPO = "https://github.com/jhurrell/star-citizen-cargo-visualizer";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About · Star Citizen Cargo Visualizer" }] }),
  component: About,
});

function About() {
  return (
    <div className="wrap about">
      <header className="page-head">
        <h1>About</h1>
      </header>

      <section>
        <h2>What it is</h2>
        <p>
          Star Citizen Cargo Visualizer is a planner for hauling contracts. Enter each delivery's SCU and it splits the
          cargo into containers the way the game does, largest first. Then choose which of your ship's cargo grids each
          delivery goes on, and see how it all packs in 3D. Planning the load before you fly keeps each drop-off's cargo
          together, so you know which grid to unload at each stop.
        </p>
      </section>

      <section>
        <h2>Another tool?</h2>
        <p>
          Yes. While we appreciate the work that went into{" "}
          <a href="https://sc-cargo.space/#/viewer/hermes-official">Cargo Grid Viewer</a> and the{" "}
          <a href="https://sc-cargo-grid-optimizer.alwaysdata.net/loader.html">SC Cargo Grid Optimizer</a>, we wanted a
          tool that lets you visualize the containers as they would apper in 3D space on the ship. This tool does that,
          and lets you plan your load before you fly, so you know exactly where each delivery's cargo is going to go.
        </p>
      </section>

      <section>
        <h2>Ships and grids</h2>
        <p>
          87 ships are included. The MISC Hull B and C, RSI Hermes and Argo RAFT were configured to match the ships; the
          rest use the grid sizes and SCU from the{" "}
          <a href="https://github.com/frosty024/Cargo_Grid_Reference_Guide">ITG Cargo Grid Reference Guide</a>, laid out
          roughly as its drawings show. Game updates can change a ship's grids, so check against the game if something
          looks off. Also, we don't own all the ships, so if you find a grid that doesn't match the game, please{" "}
          <a href={`${REPO}/issues`}>open an issue</a> and we'll do our best to fix it.
        </p>
      </section>

      <section>
        <h2>Feedback</h2>
        <p>
          The code is open source on <a href={REPO}>GitHub</a>.
        </p>
        <p>
          In addition to <a href={`${REPO}/issues`}>contacting us with issues on GitHub</a>, you can also reach out to
          us with suggestions on how to improve the site. We welcome feedback and are always looking for ways to make
          the tool more useful for the Star Citizen community.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          Your contracts and loading plans are saved in this browser only; nothing you enter is sent anywhere. The site
          counts visits anonymously with Cloudflare Web Analytics, which uses no cookies.
        </p>
      </section>

      <section>
        <h2>Disclaimer</h2>
        <p>
          This is an unofficial Star Citizen fan site, not affiliated with the Cloud Imperium group of companies. Star
          Citizen® is a registered trademark of Cloud Imperium Rights LLC.
        </p>
      </section>
    </div>
  );
}
