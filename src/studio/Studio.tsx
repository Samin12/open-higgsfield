"use client";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Workflow,
  Film,
  Users,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  X,
  ChevronRight,
  Play,
  Check,
  Upload,
  RefreshCw,
  MessageSquare,
  Search,
  Link2,
  LogOut,
  Wand2,
  Folder,
  CircleHelp,
  Download,
} from "lucide-react";
import { MODELS, getModel, parseSettings } from "@/generation/catalog";
import { versionFamily, canMoveStage } from "./security";
import { stages, workflows } from "./workflows";
import type { GenerationPlane, MediaRole } from "@/generation/catalog";
import "./studio.css";
type Job = {
  id: string;
  title: string;
  project_id: string;
  workflow: string;
  stage: string;
  status: string;
  plane: GenerationPlane;
  version: number;
  parent_id: string | null;
  result: string[] | null;
  quote: number | null;
  quoted_at: number | null;
  creator: string;
  created_at: number;
  error: string | null;
  request_id: string | null;
};
type Data = {
  user: { id: string; name: string; email: string };
  workspaces: any[];
  workspace: string;
  role: string;
  projects: any[];
  members: any[];
  assets: any[];
  jobs: Job[];
  comments: any[];
  keyConfigured: boolean;
  templates?: any[];
};
const money = (v: number | null) =>
  v === null ? "Not quoted" : "$" + v.toFixed(2);
async function call(body: any) {
  const r = await fetch("/api/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d: any = await r.json();
  if (!r.ok) throw Error(d.error || "Unable to complete this action.");
  return d;
}
export default function Studio({ signedIn }: { signedIn: boolean }) {
  const [data, setData] = useState<Data | null>(null),
    [view, setView] = useState("Board"),
    [workspace, setWorkspace] = useState(""),
    [project, setProject] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [modal, setModal] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [inviteURL, setInviteURL] = useState("");
  const [title, setTitle] = useState(""),
    [plane, setPlane] = useState<GenerationPlane | null>(null),
    [tab, setTab] = useState("Brief"),
    [newWorkflow, setNewWorkflow] = useState("character-recast");
  const load = useCallback(async () => {
    if (!signedIn) return;
    const q = new URLSearchParams();
    if (workspace) q.set("workspace", workspace);
    if (selected) q.set("job", selected);
    const r = await fetch("/api/studio?" + q);
    const d: any = await r.json();
    if (!r.ok) throw Error(d.error || "Unable to load your workspace.");
    setData(d);
  }, [workspace, selected, signedIn]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (!data?.jobs.some((j) => ["queued", "in_progress"].includes(j.status)))
      return;
    const t = setInterval(async () => {
      try {
        await Promise.all(
          data.jobs
            .filter((j) => ["queued", "in_progress"].includes(j.status))
            .map((j) => call({ op: "sync", id: j.id })),
        );
        await load();
      } catch (e) {
        setError((e as Error).message);
      }
    }, 8000);
    return () => clearInterval(t);
  }, [data?.jobs, load]);
  useEffect(() => {
    if (!signedIn) return;
    const token = new URLSearchParams(location.search).get("invite");
    if (token) {
      call({ op: "accept", token })
        .then((r) => {
          setWorkspace(r.workspace);
          history.replaceState({}, "", "/");
          setNotice("You joined the workspace.");
        })
        .catch((e) => setError(e.message));
    }
  }, [signedIn]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const job = data?.jobs.find((j) => j.id === selected);
  const editable = data?.role !== "client";
  async function action(body: any, done?: (r: any) => void) {
    setError("");
    setBusy(true);
    try {
      const r = await call(body);
      await load();
      done?.(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function openJob(j: Job) {
    setSelected(j.id);
    setTitle(j.title);
    setPlane(structuredClone(j.plane));
    setTab("Brief");
    setError("");
  }
  function start(w = "character-recast") {
    setNewWorkflow(w);
    setModal(data?.projects.length ? "generation" : "project");
  }
  const filtered =
    data?.jobs.filter(
      (j) =>
        (project === "all" || j.project_id === project) &&
        (j.title + " " + j.creator)
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  const canEditJob = editable && job?.status === "draft";
  const dirty =
    job &&
    plane &&
    (title !== job.title ||
      JSON.stringify(plane, (k, v) => (k === "url" ? undefined : v)) !==
        JSON.stringify(job.plane, (k, v) => (k === "url" ? undefined : v)));
  const currentWorkflow =
    [...workflows, ...(data?.templates ?? [])].find(
      (w) => w.id === job?.workflow,
    ) ?? workflows[0]!;
  async function upload(file: File, role: MediaRole) {
    if (!job || !plane) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/media?project=" + job.project_id, {
        method: "POST",
        body: form,
      });
      const a: any = await r.json();
      if (!r.ok) throw Error(a.error);
      setPlane((p) =>
        p
          ? {
              ...p,
              media: {
                ...p.media,
                [role]: [
                  ...(p.media[role] ?? []),
                  { id: a.id, url: a.url, role },
                ],
              },
            }
          : p,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveThen(op: string) {
    if (!job || !plane) return;
    setBusy(true);
    setError("");
    try {
      await call({ op: "save", id: job.id, title, plane });
      if (op !== "save") await call({ op, id: job.id, title });
      await load();
      setNotice(
        op === "quote"
          ? "Your quote is ready."
          : op === "template"
            ? "Reusable workflow saved."
            : "Draft saved.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const nav = [
    { name: "Board", icon: LayoutDashboard },
    { name: "Workflows", icon: Workflow },
    { name: "Generations", icon: Film },
    { name: "Projects", icon: Folder },
    { name: "People", icon: Users },
  ];
  if (!signedIn)
    return (
      <div className="ss login">
        <div className="login-visual">
          <img
            src="/workflows/character.jpg"
            alt="Samin recreated as the lead character in a cinematic scene"
          />
          <div className="login-caption">
            <span className="eyebrow">SAMIN STUDIO</span>
            <h1>
              Your next idea.
              <br />
              Your whole team.
            </h1>
            <p>
              Create videos, refine the likeness, and bring your clients into
              the review.
            </p>
          </div>
        </div>
        <div className="login-form">
          <a className="brand" href="/">
            <span className="brand-mark">S</span>Samin Studio
          </a>
          <span className="eyebrow">YOUR CREATIVE WORKSPACE</span>
          <h2>Let’s make it happen.</h2>
          <p>
            Sign in to create workflows, keep every version, and collaborate on
            the final cut.
          </p>
          <a
            className="primary large"
            href={
              "/signin-with-chatgpt?return_to=" +
              encodeURIComponent(
                typeof window !== "undefined"
                  ? window.location.pathname + window.location.search
                  : "/",
              )
            }
            target="_top"
          >
            Continue with ChatGPT <ArrowUpRight size={18} />
          </a>
          <div className="signin-note">
            Your projects stay private until you invite your team or client.
          </div>
          <a
            className="text-link"
            href="https://github.com/Samin12/open-higgsfield/tree/main/skills/samin-character-recreation"
            target="_blank"
            rel="noreferrer"
          >
            Explore the character workflow <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    );
  return (
    <div className="ss app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">S</span>
          <span>
            Samin<span className="brand-sub">STUDIO</span>
          </span>
        </a>
        <div className="workspace-select">
          <span className="eyebrow">WORKSPACE</span>
          <select
            aria-label="Workspace"
            value={data?.workspace ?? ""}
            onChange={(e) => {
              setWorkspace(e.target.value);
              setProject("all");
              setSelected(null);
            }}
          >
            {data?.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.name}
              className={view === n.name ? "active" : ""}
              onClick={() => {
                setView(n.name);
                setSelected(null);
              }}
            >
              <n.icon size={18} />
              {n.name}
              {n.name === "Generations" && (
                <span className="nav-count">{data?.jobs.length ?? 0}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="guide-card">
            <Wand2 size={20} />
            <strong>A better first take.</strong>
            <p>Start with a workflow. Make it your own.</p>
            <button onClick={() => setView("Workflows")}>
              Explore workflows <ChevronRight size={14} />
            </button>
          </div>
          <button
            className={view === "Settings" ? "active" : ""}
            onClick={() => setView("Settings")}
          >
            <Settings size={18} />
            Settings
          </button>
          <a
            href="https://github.com/Samin12/open-higgsfield/tree/main/skills/samin-character-recreation"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={18} />
            Workflow guide <ArrowUpRight size={13} />
          </a>
          <div className="account">
            <span className="avatar">
              {data?.user.name.slice(0, 2).toUpperCase() ?? "S"}
            </span>
            <span>
              <strong>{data?.user.name.split("@")[0] ?? "Loading…"}</strong>
              <small>{data?.role ?? "Your workspace"}</small>
            </span>
            <a
              href="/signout-with-chatgpt?return_to=/"
              target="_top"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </a>
          </div>
        </div>
      </aside>
      <main className="content">
        <header className="topline">
          <span>
            Samin Studio <ChevronRight size={13} /> {view}
          </span>
          <span className="team-label">
            <span className="avatar small">{data?.user.name[0] ?? "S"}</span>
            {data?.role === "client" ? "Client view" : "Team workspace"}
          </span>
        </header>
        <div className="page-head">
          <div>
            <span className="eyebrow">
              {view === "Board" ? "FROM BRIEF TO FINAL CUT" : "SAMIN STUDIO"}
            </span>
            <h1>
              {
                (
                  {
                    Board: "Production board",
                    Workflows: "Start with a workflow",
                    Generations: "Every take, together",
                    Projects: "Your client projects",
                    People: "Made with your people",
                    Settings: "Make this space yours",
                  } as any
                )[view]
              }
            </h1>
            <p>
              {
                (
                  {
                    Board:
                      "Keep the next step clear. Move work forward, one version at a time.",
                    Workflows:
                      "Proven creative steps, ready for your next idea.",
                    Generations:
                      "Find the keeper. Compare versions. Pick up where you left off.",
                    Projects:
                      "One home for each client, campaign, and creative brief.",
                    People:
                      "Invite your team to create. Give clients a place to review.",
                    Settings:
                      "Manage your workspace and your generation account.",
                  } as any
                )[view]
              }
            </p>
          </div>
          {editable && (
            <button className="primary" onClick={() => start()}>
              <Plus size={17} />
              New generation
            </button>
          )}
        </div>
        {error && (
          <div className="banner error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="banner" role="status">
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!data ? (
          <div className="loading-state">
            <RefreshCw size={22} />
            <p>Opening your workspace…</p>
            {error && (
              <button onClick={() => load().catch((e) => setError(e.message))}>
                Try again
              </button>
            )}
          </div>
        ) : (
          <>
            {["Board", "Generations"].includes(view) && (
              <>
                <div className="toolbar">
                  <div className="view-switch">
                    <button
                      className={view === "Board" ? "selected" : ""}
                      onClick={() => setView("Board")}
                    >
                      <LayoutDashboard size={15} />
                      Board
                    </button>
                    <button
                      className={view === "Generations" ? "selected" : ""}
                      onClick={() => setView("Generations")}
                    >
                      <Film size={15} />
                      Gallery
                    </button>
                  </div>
                  <select
                    aria-label="Filter by project"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  >
                    <option value="all">All projects</option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search generations"
                      placeholder="Find a generation…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                </div>
                {view === "Board" ? (
                  <div className="board">
                    {stages.map((s, i) => (
                      <section
                        className="column"
                        key={s}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData("text/plain");
                          if (id) action({ op: "stage", id, stage: s });
                        }}
                      >
                        <header>
                          <span className={"stage-dot stage-" + i} />
                          <strong>{s}</strong>
                          <span className="count">
                            {filtered.filter((j) => j.stage === s).length}
                          </span>
                          {editable && i === 0 && (
                            <button
                              aria-label="Add a brief"
                              onClick={() => start()}
                            >
                              <Plus size={16} />
                            </button>
                          )}
                        </header>
                        <div className="column-body">
                          {filtered
                            .filter((j) => j.stage === s)
                            .map((j) => (
                              <JobCard
                                key={j.id}
                                job={j}
                                project={
                                  data.projects.find(
                                    (p) => p.id === j.project_id,
                                  )?.name
                                }
                                onClick={() => openJob(j)}
                              />
                            ))}
                          {!filtered.some((j) => j.stage === s) && (
                            <div className="column-empty">
                              <span>0{i + 1}</span>
                              <p>
                                {
                                  [
                                    "New ideas start here",
                                    "Quoted and ready to create",
                                    "Your renders in motion",
                                    "Feedback before the final cut",
                                    "The takes you’re keeping",
                                  ][i]
                                }
                              </p>
                              {i === 0 && editable && (
                                <button onClick={() => start()}>
                                  Add your first brief <Plus size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="generation-grid">
                    {filtered.map((j) => (
                      <JobCard
                        key={j.id}
                        job={j}
                        project={
                          data.projects.find((p) => p.id === j.project_id)?.name
                        }
                        onClick={() => openJob(j)}
                      />
                    ))}
                    {!filtered.length && (
                      <div className="empty-wide">
                        <Film size={32} />
                        <h2>Your next great take starts here.</h2>
                        <p>
                          Choose a workflow to create your first generation.
                        </p>
                        {editable && (
                          <button
                            className="primary"
                            onClick={() => setView("Workflows")}
                          >
                            Explore workflows <ArrowUpRight size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!data.jobs.length && (
                  <div className="quick-start">
                    <img
                      src="/workflows/character.jpg"
                      alt="Character recreation workflow preview"
                    />
                    <div>
                      <span className="eyebrow">
                        TRY THE SIGNATURE WORKFLOW
                      </span>
                      <h2>You. In the scene.</h2>
                      <p>
                        Start with a reference video and your photos. Build the
                        likeness, transfer the motion, and review every take.
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        editable ? start() : setView("Workflows")
                      }
                    >
                      Explore workflow <ArrowUpRight size={17} />
                    </button>
                  </div>
                )}
              </>
            )}
            {view === "Workflows" && (
              <>
                <div className="workflow-grid">
                  {[...workflows, ...(data.templates ?? [])].map((w) => (
                    <article className="workflow-card" key={w.id}>
                      <div className="workflow-image">
                        <img
                          src={w.image || "/workflows/custom.jpg"}
                          alt={w.title}
                        />
                        <span>{w.category || "Your workflow"}</span>
                      </div>
                      <div>
                        <h2>{w.title}</h2>
                        <p>{w.description}</p>
                        <ol>
                          {w.steps.slice(0, 3).map((s: string) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ol>
                        <button
                          className="workflow-use"
                          onClick={() => start(w.id)}
                          disabled={!editable}
                        >
                          Use workflow <ArrowUpRight size={17} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="info-note">
                  Save any draft as a reusable workflow from its generation
                  panel. Your team can reuse the brief and model settings.
                </div>
              </>
            )}
            {view === "Projects" && (
              <>
                <div className="section-actions">
                  {editable && (
                    <button
                      className="secondary"
                      onClick={() => setModal("project")}
                    >
                      <Plus size={16} />
                      New project
                    </button>
                  )}
                </div>
                <div className="project-grid">
                  {data.projects.map((p) => (
                    <button
                      className="project-card"
                      key={p.id}
                      onClick={() => {
                        setProject(p.id);
                        setView("Board");
                      }}
                    >
                      <span className="project-icon">
                        <Folder size={23} />
                      </span>
                      <span className="eyebrow">
                        {p.client || "YOUR STUDIO"}
                      </span>
                      <h2>{p.name}</h2>
                      <p>
                        {data.jobs.filter((j) => j.project_id === p.id).length}{" "}
                        generations ·{" "}
                        {
                          data.jobs.filter(
                            (j) =>
                              j.project_id === p.id && j.stage === "Approved",
                          ).length
                        }{" "}
                        approved
                      </p>
                      <span className="text-link">
                        Open board <ArrowUpRight size={16} />
                      </span>
                    </button>
                  ))}
                  {!data.projects.length && (
                    <div className="empty-wide">
                      <Folder size={32} />
                      <h2>Give your next project a home.</h2>
                      <p>
                        Add a project, then bring its ideas and generations
                        together.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
            {view === "People" && (
              <>
                <div className="section-actions">
                  {data.role === "owner" && (
                    <button
                      className="secondary"
                      onClick={() => setModal("invite")}
                    >
                      <Plus size={16} />
                      Invite someone
                    </button>
                  )}
                </div>
                <div className="people-list">
                  {data.members.map((m) => (
                    <div className="person" key={m.id}>
                      <span className="avatar">
                        {m.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <strong>{m.name}</strong>
                        <small>{m.email}</small>
                      </div>
                      <span className="pill">{m.role}</span>
                      <span>
                        {m.role === "client"
                          ? data.projects.find((p) => p.id === m.project_id)
                              ?.name
                          : "All projects"}
                      </span>
                      {data.role === "owner" && m.role !== "owner" && (
                        <button
                          onClick={() =>
                            action({
                              op: "remove-member",
                              workspace: data.workspace,
                              user: m.id,
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="info-note">
                  Team members can create and review across the workspace.
                  Clients can see and review only their assigned project.
                  Invitations expire in seven days and can be used once.
                </div>
              </>
            )}
            {view === "Settings" && (
              <div className="settings-grid">
                <section className="settings-card">
                  <div className="section-icon">
                    <Link2 size={22} />
                  </div>
                  <h2>Your generation account</h2>
                  <p>
                    Connect your own Higgsfield API key. Quotes come from your
                    account and include any applicable discount.
                  </p>
                  <span
                    className={
                      "connection " + (data.keyConfigured ? "connected" : "")
                    }
                  >
                    {data.keyConfigured
                      ? "API key connected"
                      : "No API key connected"}
                  </span>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = e.currentTarget;
                      const key = new FormData(f).get("key");
                      action({ op: "key", key }, () => {
                        f.reset();
                        setNotice(
                          "API key saved securely. A live quote will verify access.",
                        );
                      });
                    }}
                  >
                    <label>
                      API key
                      <input
                        name="key"
                        type="password"
                        autoComplete="off"
                        placeholder="id:secret"
                        required
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Save key
                    </button>
                    {data.keyConfigured && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => action({ op: "disconnect" })}
                      >
                        Disconnect
                      </button>
                    )}
                  </form>
                  <small>
                    Your key is encrypted on the server and is never shared with
                    your team or clients.
                  </small>
                </section>
                <section className="settings-card">
                  <div className="section-icon">
                    <Users size={22} />
                  </div>
                  <h2>A fresh workspace</h2>
                  <p>
                    Keep a new business or team separate from your current
                    projects.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = new FormData(e.currentTarget).get("name");
                      action({ op: "workspace", name }, (r) => {
                        setWorkspace(r.id);
                        setNotice("Workspace created.");
                      });
                    }}
                  >
                    <label>
                      Workspace name
                      <input
                        name="name"
                        placeholder="My creative team"
                        required
                        maxLength={180}
                      />
                    </label>
                    <button className="secondary" disabled={busy}>
                      Create workspace
                    </button>
                  </form>
                </section>
              </div>
            )}
          </>
        )}
        <footer>
          Made for the way you create. <span>Samin Studio</span>
        </footer>
      </main>
      {job && plane && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Generation details"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="drawer-head">
              <button
                className="icon-button"
                aria-label="Close generation"
                onClick={() => setSelected(null)}
              >
                <ArrowLeft size={20} />
              </button>
              <span className="eyebrow">
                VERSION {job.version} · {job.status.replaceAll("_", " ")}
              </span>
              <button
                className="icon-button"
                aria-label="Close"
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="drawer-title">
              {error && (
                <div className="banner error" role="alert">
                  {error}
                </div>
              )}
              <h2>{job.title}</h2>
              <p>
                {data?.projects.find((p) => p.id === job.project_id)?.name} · by{" "}
                {job.creator}
              </p>
            </div>
            {job.result?.map((url, index) => (
              <div className="result-preview" key={url}>
                {getModel(job.plane.model).surface === "video" ? (
                  <video src={url} controls playsInline />
                ) : (
                  <img src={url} alt={job.title} />
                )}
                <a href={url} target="_blank" rel="noreferrer">
                  <Download size={14} />
                  Download result {job.result!.length > 1 ? index + 1 : ""}
                </a>
              </div>
            ))}
            {job.error && (
              <p className="inline-error">
                {job.error}
                {job.status === "completed" && (
                  <button
                    disabled={busy}
                    onClick={() => action({ op: "sync", id: job.id })}
                  >
                    Retry archiving
                  </button>
                )}
              </p>
            )}
            <div className="drawer-tabs">
              {["Brief", "References", "Review", "Versions"].map((t) => (
                <button
                  key={t}
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="drawer-body">
              {tab === "Brief" && (
                <>
                  <label>
                    Generation title
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={!canEditJob}
                    />
                  </label>
                  <label>
                    Model
                    <select
                      value={plane.model}
                      disabled={!canEditJob}
                      onChange={(e) =>
                        setPlane({
                          ...plane,
                          model: e.target.value,
                          settings: parseSettings(getModel(e.target.value), {}),
                          media: {},
                        })
                      }
                    >
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    What should happen?
                    <textarea
                      rows={6}
                      value={plane.prompt.text}
                      disabled={!canEditJob}
                      onChange={(e) =>
                        setPlane({ ...plane, prompt: { text: e.target.value } })
                      }
                    />
                  </label>
                  <div className="settings-fields">
                    {Object.entries(getModel(plane.model).settings).map(
                      ([key, s]) => (
                        <label key={key}>
                          {key.replace(/([A-Z])/g, " $1")}
                          {s.type === "enum" ? (
                            <select
                              disabled={!canEditJob}
                              value={String(plane.settings[key])}
                              onChange={(e) =>
                                setPlane({
                                  ...plane,
                                  settings: {
                                    ...plane.settings,
                                    [key]: e.target.value,
                                  },
                                })
                              }
                            >
                              {s.values.map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          ) : s.type === "boolean" ? (
                            <input
                              type="checkbox"
                              disabled={!canEditJob}
                              checked={!!plane.settings[key]}
                              onChange={(e) =>
                                setPlane({
                                  ...plane,
                                  settings: {
                                    ...plane.settings,
                                    [key]: e.target.checked,
                                  },
                                })
                              }
                            />
                          ) : (
                            <input
                              type="number"
                              disabled={!canEditJob}
                              min={s.min}
                              max={s.max}
                              step={s.step || 1}
                              value={Number(plane.settings[key])}
                              onChange={(e) =>
                                setPlane({
                                  ...plane,
                                  settings: {
                                    ...plane.settings,
                                    [key]: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          )}
                        </label>
                      ),
                    )}
                  </div>
                  <div className="workflow-checklist">
                    <span className="eyebrow">WORKFLOW STEPS</span>
                    <ol>
                      {currentWorkflow.steps.map((s: string) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </div>
                  {canEditJob && (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => saveThen("template")}
                    >
                      Save as a reusable workflow <Workflow size={15} />
                    </button>
                  )}
                </>
              )}
              {tab === "References" && (
                <>
                  <p className="info-note">
                    For the character workflow, upload a prepared 4–30 second
                    source clip and a scene keyframe showing the desired
                    likeness. Add clear face angles as supporting references.
                    Uploads are private to this project.
                  </p>
                  {Object.entries(getModel(plane.model).roles).map(
                    ([role, max]) => (
                      <div className="reference-group" key={role}>
                        <h3>
                          {
                            (
                              {
                                reference: "Identity / scene references",
                                video: "Source video",
                                start: "Starting frame",
                                end: "Ending frame",
                                audio: "Audio reference",
                              } as any
                            )[role]
                          }{" "}
                          <small>
                            {(plane.media[role as MediaRole] ?? []).length}/
                            {max}
                          </small>
                        </h3>
                        <div className="reference-grid">
                          {(plane.media[role as MediaRole] ?? []).map((a) => (
                            <div key={a.id}>
                              {role === "video" ? (
                                <video src={"/api/media/" + a.id} controls />
                              ) : role === "audio" ? (
                                <audio src={"/api/media/" + a.id} controls />
                              ) : (
                                <img
                                  src={"/api/media/" + a.id}
                                  alt="Uploaded reference"
                                />
                              )}
                              {canEditJob && (
                                <button
                                  aria-label="Remove reference"
                                  onClick={() =>
                                    setPlane({
                                      ...plane,
                                      media: {
                                        ...plane.media,
                                        [role]: (
                                          plane.media[role as MediaRole] ?? []
                                        ).filter((x) => x.id !== a.id),
                                      },
                                    })
                                  }
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {canEditJob &&
                          (plane.media[role as MediaRole] ?? []).length <
                            (max ?? 0) && (
                            <label className="reference-library">
                              Reuse a project asset
                              <select
                                value=""
                                onChange={(e) => {
                                  const a = data?.assets.find(
                                    (a) => a.id === e.target.value,
                                  );
                                  if (a)
                                    setPlane({
                                      ...plane,
                                      media: {
                                        ...plane.media,
                                        [role]: [
                                          ...(plane.media[role as MediaRole] ??
                                            []),
                                          {
                                            id: a.id,
                                            url: "/api/media/" + a.id,
                                            role: role as MediaRole,
                                          },
                                        ],
                                      },
                                    });
                                }}
                              >
                                <option value="">
                                  Choose an existing file…
                                </option>
                                {data?.assets
                                  .filter(
                                    (a) =>
                                      a.project_id === job.project_id &&
                                      a.content_type.startsWith(
                                        role === "video"
                                          ? "video/"
                                          : role === "audio"
                                            ? "audio/"
                                            : "image/",
                                      ) &&
                                      !(
                                        plane.media[role as MediaRole] ?? []
                                      ).some((m) => m.id === a.id),
                                  )
                                  .map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.filename}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          )}
                        {canEditJob &&
                          (plane.media[role as MediaRole] ?? []).length <
                            (max ?? 0) && (
                            <label className="upload-box">
                              <Upload size={21} />
                              <strong>
                                Add{" "}
                                {role === "video"
                                  ? "video"
                                  : role === "audio"
                                    ? "audio"
                                    : "image"}
                              </strong>
                              <span>Up to 40 MB</span>
                              <input
                                type="file"
                                disabled={busy}
                                accept={
                                  role === "video"
                                    ? "video/*"
                                    : role === "audio"
                                      ? "audio/*"
                                      : "image/png,image/jpeg,image/webp"
                                }
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) upload(f, role as MediaRole);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                      </div>
                    ),
                  )}
                </>
              )}
              {tab === "Review" && (
                <>
                  <div className="review-status">
                    <label>
                      Production stage
                      <select
                        value={job.stage}
                        disabled={busy}
                        onChange={(e) =>
                          action({
                            op: "stage",
                            id: job.id,
                            stage: e.target.value,
                          })
                        }
                      >
                        {stages
                          .filter(
                            (s) =>
                              s === job.stage ||
                              (canMoveStage(
                                job.status,
                                s,
                                !!job.quoted_at &&
                                  Date.now() - job.quoted_at <= 900000,
                              ) &&
                                (editable ||
                                  ["Review", "Approved"].includes(s))),
                          )
                          .map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                      </select>
                    </label>
                    {job.status === "completed" && (
                      <button
                        className="primary"
                        onClick={() =>
                          action({ op: "stage", id: job.id, stage: "Approved" })
                        }
                      >
                        <Check size={16} />
                        Approve this version
                      </button>
                    )}
                  </div>
                  <h3>Feedback</h3>
                  {data?.comments.length ? (
                    data.comments.map((c) => (
                      <div className="comment" key={c.id}>
                        <strong>{c.name}</strong>
                        <p>{c.body}</p>
                        <small>{new Date(c.created_at).toLocaleString()}</small>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      What works? What needs another take? Leave feedback for
                      the team.
                    </p>
                  )}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = e.currentTarget;
                      action(
                        {
                          op: "comment",
                          id: job.id,
                          body: new FormData(f).get("body"),
                        },
                        () => f.reset(),
                      );
                    }}
                  >
                    <textarea
                      name="body"
                      placeholder="Add your feedback…"
                      required
                      maxLength={4000}
                    />
                    <button className="secondary" disabled={busy}>
                      <MessageSquare size={16} />
                      Post feedback
                    </button>
                  </form>
                </>
              )}
              {tab === "Versions" && (
                <>
                  {versionFamily(data?.jobs ?? [], job.id).map((v) => (
                    <button
                      className="version-row"
                      key={v.id}
                      onClick={() => openJob(v)}
                    >
                      <span className="version-number">V{v.version}</span>
                      <div>
                        <strong>{v.title}</strong>
                        <small>
                          {v.status} · {money(v.quote)}
                        </small>
                      </div>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                  <p className="info-note">
                    Regenerating creates a new draft. Your original result,
                    settings and review stay intact.
                  </p>
                </>
              )}
            </div>
            <div className="drawer-footer">
              <div>
                <small>Quoted API cost</small>
                <strong>{money(job.quote)}</strong>
                <span>Final charge not yet verified</span>
              </div>
              <div className="footer-actions">
                {canEditJob ? (
                  <>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => saveThen("save")}
                    >
                      Save
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => saveThen("quote")}
                    >
                      Get quote
                    </button>
                    {job.quote !== null && (
                      <button
                        className="primary"
                        disabled={busy || !!dirty}
                        title={
                          dirty
                            ? "Save your changes and get a new quote first."
                            : undefined
                        }
                        onClick={() => action({ op: "generate", id: job.id })}
                      >
                        <Play size={15} />
                        Generate · {money(job.quote)}
                      </button>
                    )}
                  </>
                ) : (
                  editable &&
                  !["queued", "in_progress", "submitting", "unknown"].includes(
                    job.status,
                  ) && (
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        action({ op: "regenerate", id: job.id }, async (r) => {
                          const response = await fetch(
                            "/api/studio?workspace=" + data?.workspace,
                          );
                          const d: any = await response.json();
                          setData(d);
                          openJob(d.jobs.find((x: Job) => x.id === r.id));
                        })
                      }
                    >
                      <RefreshCw size={15} />
                      New version
                    </button>
                  )
                )}
              </div>
            </div>
          </section>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">SAMIN STUDIO</span>
            <h2>
              {modal === "project"
                ? "A new project"
                : modal === "invite"
                  ? "Bring someone in"
                  : "Your next generation"}
            </h2>
            {error && (
              <div className="banner error" role="alert">
                {error}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                if (modal === "project")
                  action(
                    {
                      op: "project",
                      workspace: data?.workspace,
                      name: f.get("name"),
                      client: f.get("client"),
                    },
                    (r) => {
                      setProject(r.id);
                      setModal("generation");
                    },
                  );
                else if (modal === "invite")
                  action(
                    {
                      op: "invite",
                      workspace: data?.workspace,
                      role: f.get("role"),
                      project: f.get("project"),
                    },
                    (r) => setInviteURL(r.url),
                  );
                else {
                  const w = [...workflows, ...(data?.templates ?? [])].find(
                    (w) => w.id === f.get("workflow"),
                  )!;
                  action(
                    {
                      op: "job",
                      project: f.get("project"),
                      title: f.get("title"),
                      workflow: w.id,
                      model: w.model,
                      prompt: w.prompt,
                    },
                    async (r) => {
                      setModal(null);
                      setView("Board");
                      const d: any = await (
                        await fetch("/api/studio?workspace=" + data?.workspace)
                      ).json();
                      setData(d);
                      openJob(d.jobs.find((x: Job) => x.id === r.id));
                    },
                  );
                }
              }}
            >
              {modal === "project" ? (
                <>
                  <label>
                    Project name
                    <input
                      name="name"
                      placeholder="September launch films"
                      required
                      maxLength={180}
                    />
                  </label>
                  <label>
                    Client or brand
                    <input
                      name="client"
                      placeholder="Your brand or client name"
                      maxLength={120}
                    />
                  </label>
                </>
              ) : modal === "invite" ? (
                <>
                  <label>
                    Access
                    <select name="role">
                      <option value="editor">
                        Team member — create and review
                      </option>
                      <option value="client">
                        Client — review one project
                      </option>
                    </select>
                  </label>
                  <label>
                    Client project
                    <select name="project">
                      {data?.projects.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {inviteURL && (
                    <div className="invite-result">
                      <p>Share this private invitation link:</p>
                      <input readOnly value={inviteURL} />
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard
                            .writeText(inviteURL)
                            .then(() => setNotice("Invitation link copied."))
                        }
                      >
                        Copy link
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <label>
                    Generation title
                    <input
                      name="title"
                      placeholder="My character scene — first take"
                      required
                      maxLength={180}
                    />
                  </label>
                  <label>
                    Project
                    <select
                      name="project"
                      defaultValue={
                        project === "all" ? data?.projects[0]?.id : project
                      }
                    >
                      {data?.projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Workflow
                    <select name="workflow" defaultValue={newWorkflow}>
                      {[...workflows, ...(data?.templates ?? [])].map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <button className="primary large" disabled={busy}>
                {busy
                  ? "Saving…"
                  : modal === "project"
                    ? "Create project"
                    : modal === "invite"
                      ? "Create invitation link"
                      : "Create draft"}
                <ArrowUpRight size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function JobCard({
  job,
  project,
  onClick,
}: {
  job: Job;
  project?: string;
  onClick: () => void;
}) {
  const video = getModel(job.plane.model).surface === "video";
  return (
    <button
      className="job-card"
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", job.id)}
      onClick={onClick}
    >
      {job.result?.[0] ? (
        <div className="job-preview">
          {video ? (
            <video src={job.result[0]} muted preload="metadata" />
          ) : (
            <img src={job.result[0]} alt="Generation result" />
          )}
          {video && (
            <span className="play-badge">
              <Play size={15} />
            </span>
          )}
        </div>
      ) : (
        <div className={"job-placeholder " + job.status}>
          <Wand2 size={25} />
          <span>
            {job.status === "draft"
              ? "Your next take"
              : job.status.replaceAll("_", " ")}
          </span>
        </div>
      )}
      <div className="job-copy">
        <span className="project-tag">{project}</span>
        <h3>{job.title}</h3>
        <p>{getModel(job.plane.model).label}</p>
        <div className="job-meta">
          <span>V{job.version}</span>
          <span>{job.quote === null ? "Draft" : money(job.quote)}</span>
          <span className="avatar tiny" title={job.creator}>
            {job.creator[0]}
          </span>
        </div>
      </div>
    </button>
  );
}
