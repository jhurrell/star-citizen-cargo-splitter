import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../styles.css?url";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@400;500;600;700&family=Montserrat:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap";

/* Cloudflare Web Analytics: counts visits without cookies. The token only
   names the site, so it isn't a secret. */
const ANALYTICS_BEACON = "https://static.cloudflareinsights.com/beacon.min.js";
const ANALYTICS_TOKEN = "98017f0e99014c47af7665d4d07c9c68";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONTS },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        {/* Only in the built site, so local testing isn't counted. */}
        {import.meta.env.PROD && (
          <script type="module" src={ANALYTICS_BEACON} data-cf-beacon={JSON.stringify({ token: ANALYTICS_TOKEN })} />
        )}
      </body>
    </html>
  );
}
