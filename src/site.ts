/* One source of truth for the site's identity and its canonical origin.
   Server-only by intent: VERCEL_PROJECT_PRODUCTION_URL is not exposed to the
   browser, so importing SITE_URL into a client component would resolve
   differently on each side. Keep this module out of "use client" files. */

function resolveOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return "https://samin-studio.saminxd.chatgpt.site";
}

export const SITE_URL = resolveOrigin();

export const SITE_NAME = "Samin Studio";
export const SITE_DESCRIPTOR = "Creative workflows for your team";
export const SITE_TITLE = `${SITE_NAME} — ${SITE_DESCRIPTOR}`;

export const SITE_DESCRIPTION =
  "Create video workflows, manage client projects, and review every generation together in Samin Studio.";

/** Near-black studio ground; also the installed-app and browser-chrome color. */
export const STUDIO_BG = "#0a0a0b";

/* Next replaces the whole `openGraph` (and `twitter`) object when a route
   defines one, so a route that only wants its own url would silently drop
   og:type, og:site_name, og:locale and the card. Overrides go through here. */
export function openGraphFor({
  path,
  title = SITE_TITLE,
  description = SITE_DESCRIPTION,
}: {
  path: string;
  title?: string;
  description?: string;
}) {
  return {
    type: "website" as const,
    siteName: SITE_NAME,
    locale: "en_US",
    url: path,
    title,
    description,
    images: [{url: "/workflows/character.jpg", width: 1280, height: 720, alt: "Samin Studio character recreation workflow"}],
  };
}

export function twitterFor({
  title = SITE_TITLE,
  description = SITE_DESCRIPTION,
}: { title?: string; description?: string } = {}) {
  return {
    card: "summary_large_image" as const,
    title,
    description,
    images: ["/workflows/character.jpg"],
  };
}
