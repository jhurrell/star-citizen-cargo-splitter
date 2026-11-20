import { Link } from "@tanstack/react-router";

/* The site's pages, in the order the footer lists them. */
const PAGES = [
  { to: "/", label: "Cargo Visualizer" },
  { to: "/about", label: "About" },
] as const;

/* The foot of every page: a link to each page, kept in view at the bottom of
   the window as the page scrolls. The current page's link is marked (the
   router sets aria-current on it). */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <nav aria-label="Pages">
        <ul>
          {PAGES.map(({ to, label }) => (
            <li key={to}>
              <Link to={to} activeOptions={{ exact: true }}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
