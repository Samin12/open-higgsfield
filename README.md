# Samin Studio

A shared creative workspace for making AI videos with clients: prepare the brief, attach references, get an account-specific quote, generate, and review every version together.

[Open Samin Studio](https://samin-studio.saminxd.chatgpt.site) · [Character recreation skill](skills/samin-character-recreation/SKILL.md)

![Character recreation workflow](public/workflows/character.jpg)

## What you can do

- Sign in with ChatGPT and create separate workspaces and client projects.
- Use the **Brief → Ready → In progress → Review → Approved** production board or generation gallery.
- Start from character recreation, video recasting, still animation, or a custom workflow. Save your own model settings and brief as a team template.
- Keep generation references, prompts, quotes, provider request IDs, feedback and version ancestry together. Regeneration creates a new draft rather than overwriting the original.
- Invite editors to the workspace or clients to one specific project. Clients can review and approve completed work, but cannot generate, manage members or access other projects.
- Use your own Higgsfield API account. Keys are encrypted at rest, never returned to the browser, and never shared with teammates. A quote is rechecked before a single submission; uncertain submissions are held for reconciliation rather than automatically retried.
- Upload private reference media (up to 40 MB each). Successful provider outputs are streamed into private storage when supported; an explicit warning and archive retry appear if a result cannot be retained.

The original image/video model catalog is retained, with Genjutsu Motion Transfer and Object Swap added. Availability and pricing depend on the connected provider account. Quoted cost is an estimate, not a verified invoice; account discounts are not subtracted a second time.

## The character workflow

Choose **Put yourself in the scene**, upload a prepared 4–30 second source clip and a scene keyframe with your likeness, then add clear identity angles. Quote and generate, inspect face drift and timing, and create another version when needed. Share the project with the client for comments and approval.

The [included skill](skills/samin-character-recreation/SKILL.md) documents the actual example, images, prompts, limitations and repeatable commands. Its Python helper trims exact clips and restores original audio using FFmpeg. The website accepts prepared media; it does not download YouTube videos, create identity keyframes automatically, or perform the final audio mix in the browser.

## Local development

Requires Node.js 22+, pnpm and a Cloudflare Workers-compatible environment. FFmpeg is needed only for the skill's local video helper.

```sh
pnpm install --frozen-lockfile
# Create .dev.vars with a strong random STUDIO_SECRET. Never commit it.
pnpm build
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_red_madrox.sql
pnpm dev
```

Open http://localhost:5173 and use the local **Continue with ChatGPT** sign-in. The development-only identity is `seedy@sites.test`. Mock authentication strips caller-supplied identity headers and is limited to local hosts; it is not part of the production sign-in flow.

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm build
# With pnpm dev running, test real local routes and D1 isolation:
node scripts/test-local-api.mjs
```

## Hosting and data

React 19 / Next App Router source runs through vinext on ChatGPT Sites. Sites provides the production Sign in with ChatGPT flow, trusted identity headers, D1 (`DB`) and private R2 (`BUCKET`) bindings. Application membership checks apply to every project, generation and media request.

- `src/studio/`: interface, access policies, encrypted credentials and result archival.
- `src/app/api/studio/`: projects, memberships, invitations, workflows, versions and provider lifecycle.
- `src/app/api/media/`: private uploads, range playback and time-limited provider access.
- `src/generation/`: retained model catalog and provider input mapping.
- `db/schema.ts`, `drizzle/`: database schema and versioned migrations.
- `skills/samin-character-recreation/`: reusable workflow skill with example images.

Configure `STUDIO_SECRET` as a **Sites runtime secret** before publishing. Keep it stable: rotating it requires re-encrypting saved API keys. Never place API keys or private reference videos in Git. Deploy this app behind Sites dispatch; a generic server must not trust public callers' `oai-authenticated-user-*` headers.

Jobs refresh while a workspace is open; reopening resumes polling. This initial release does not have a background scheduler, billing dashboard, or automatic provider-charge reconciliation. A submission with an uncertain response must be checked in the provider console before another request is made. Result archival is capped at 250 MB per output; unsupported/oversized provider responses remain temporary links with a visible warning.

## Attribution

Samin Studio is a branded fork of [OpenHiggsfield](https://github.com/wide-trace/open-higgsfield). Existing model integrations and legacy source are retained. Bundled Sites build helpers preserve their upstream license notices. Product branding does not imply affiliation with the model providers.
