import { div, svg } from "gpui-kit";
import Picker, { openPicker, previousWork } from "./picker.js";
import { h_flex, v_flex } from "gpui-base";
import {
  spaces,
  panes,
  agents,
  terminals,
  machines,
  focused,
  theme,
  shared,
  setShared,
  run,
  exec,
  appHome,
  readTextFile,
  nextCommand,
  openOverlay,
  closeOverlay,
  props,
  notify,
  setAgentOrder,
} from "herdr";
import {
  stateKey,
  initialState,
  reconcile,
  visibleSessions,
  liveTabs,
  owner,
  mainAgents,
  sessionStatus,
  canDismiss,
  track,
  graduate,
  makeMain,
  ordered,
  reorder,
  closePlan,
  metadataFor,
  stale,
} from "./model.js";
import { executeClose } from "./close.js";

const world = () => ({
  spaces: spaces(),
  panes: panes(),
  agents: agents(),
  terminals: terminals(),
  machines: machines(),
});
const load = () => initialState(shared(stateKey));
const save = (state) => setShared(stateKey, state);
const asset = (name) => `assets/toolkit-workbench/${name}.svg`;
const fail = (error) =>
  notify({ title: "Workbench", body: String(error?.message || error), level: "error" });
function picture(name, color, size = 17, spinning = false) {
  return h_flex()
    .size(size + 6)
    .items_center()
    .justify_center()
    .flex_none()
    .child(
      svg(asset(name))
        .size(size)
        .flex_none()
        .text_color(color)
        // Native rotation belongs to the SVG, not its hover-target container.
        .when(spinning, (el) => el.spin(1000)),
    );
}
function button(id, label, action, { text, icon, color, disabled = false } = {}) {
  const t = theme();
  return h_flex()
    .id(id)
    .h(30)
    .px(5)
    .gap(4)
    .items_center()
    .rounded(4)
    .text_size(10)
    .text_color(disabled ? t.dim : color || t.muted)
    .tooltip(label)
    .accessibility_label(label)
    .when(!disabled, (el) =>
      el
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          try {
            action(cx);
          } catch (e) {
            fail(e);
          }
        }),
    )
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .when(Boolean(icon), (el) => el.child(picture(icon, disabled ? t.dim : color || t.muted)))
    .when(Boolean(text), (el) => el.child(text));
}
const appExec = (args) => exec("env", [`HERDR_APP_HOME=${appHome()}`, "herdr-app", ...args]);
async function command(name, args) {
  const result = await appExec(["do", name, JSON.stringify(args)]);
  let data;
  try {
    data = JSON.parse(result.stdout || "{}");
  } catch {
    throw new Error(`Invalid response from ${name}`);
  }
  if (result.code !== 0 || data.error)
    throw new Error(data.error || result.stderr || `${name} failed`);
  return data;
}

export default class Workbench extends Picker {
  init(_props, cx) {
    if (props()?.role === "picker") {
      super.init(_props, cx);
      return;
    }
    this.cache = { entries: {} };
    this.focus = cx.focus_handle();
    this.mode = "activity";
    this.folded = new Set();
    this.expanded = new Set();
    this.drag = null;
    this.over = null;
    this.closing = false;
    this.cacheError = null;
    if (props()?.role === "close") return;
    this.readCache(cx);
    cx.timer.every(5000, (current) => this.readCache(current));
    cx.spawn(async (current) => {
      for (;;) {
        const command = await nextCommand();
        try {
          if (command === "projects") openPicker("projects");
          else if (command === "work") openPicker("work");
          else if (command === "previous") await previousWork();
        } catch (error) {
          fail(error);
        }
        current.notify();
      }
    });
  }
  readCache(cx) {
    if (this.reading) return;
    this.reading = true;
    cx.spawn(async (current) => {
      try {
        const text = await readTextFile(`${appHome()}/data/toolkit-github-status/status.json`);
        const cache = text ? JSON.parse(text) : { version: 1, entries: {} };
        if (cache.version !== 1 || !cache.entries || typeof cache.entries !== "object")
          throw new Error("Unsupported GitHub cache");
        this.cache = cache;
        this.cacheError = text ? null : "GitHub collector has not published a snapshot.";
      } catch (e) {
        this.cacheError = String(e.message || e);
      }
      this.reading = false;
      current.notify();
    });
  }
  current() {
    const w = world(),
      before = load(),
      state = reconcile(before, w, this.cache.entries);
    const activations = shared("toolkit.picker.activate") || {};
    for (const tab of Object.keys(activations)) {
      const session = owner(state, tab);
      if (session) {
        session.tracked = true;
        delete activations[tab];
        setShared("toolkit.picker.activate", activations);
      }
    }
    if (JSON.stringify(before) !== JSON.stringify(state)) save(state);
    return { w, state };
  }
  select(session, tab = session.main) {
    const w = world();
    const target =
      liveTabs(w).find((t) => t.id === tab) || liveTabs(w).find((t) => session.tabs.includes(t.id));
    if (!target) throw new Error("Session is unavailable. Its machine may be offline.");
    run("space.select", { id: target.space });
    run("tab.select", { id: target.id });
  }
  startDrag(type, id, cx) {
    this.focus.focus();
    this.drag = { type, id };
    this.suppressClick = false;
    this.over = null;
    cx.notify();
  }
  drop(type, id, cx) {
    if (!this.drag || this.drag.type !== type) return;
    try {
      save(reorder(load(), type, this.drag.id, id));
    } catch (e) {
      fail(e);
    }
    this.drag = null;
    this.over = null;
    this.suppressClick = true;
    cx.timer.after(100, () => {
      this.suppressClick = false;
    });
    cx.notify();
  }
  grip(type, id) {
    const t = theme();
    return div()
      .id(`grip-${type}-${id}`)
      .w(12)
      .text_size(12)
      .text_color(t.dim)
      .child("⠿")
      .tooltip("Drag to reorder")
      .cursor_pointer()
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation();
        this.startDrag(type, id, cx);
      });
  }
  dropTarget(el, type, id) {
    const t = theme();
    return el
      .when(this.over === id, (e) => e.border_t(2).border_color(t.accent))
      .on_mouse_move((_e, cx) => {
        if (this.drag?.type === type && this.over !== id) {
          this.over = id;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        if (this.drag) {
          cx.stop_propagation();
          this.drop(type, id, cx);
        }
      });
  }
  status(session, w) {
    const t = theme(),
      status = sessionStatus(session, w);
    return picture(
      mainAgents(session, w).length ? status : "terminal",
      t[status] || t.dim,
      20,
      status === "working",
    ).tooltip(`Main tab: ${mainAgents(session, w).length ? status : "no agent"}`);
  }
  metadata(session, w) {
    const t = theme(),
      m = metadataFor(session, w, this.cache),
      pr = m?.pr;
    const parts = [];
    if (m?.dirty != null)
      parts.push(
        picture(m.dirty ? "dirty" : "clean", m.dirty ? t.blocked : t.dim).tooltip(
          m.dirty ? "Uncommitted changes" : "Working tree clean",
        ),
      );
    if (pr) {
      const color =
        pr.state === "MERGED"
          ? t.ansi5
          : pr.state === "CLOSED"
            ? t.ansi1
            : pr.isDraft
              ? t.dim
              : t.done;
      parts.push(
        h_flex()
          .gap(3)
          .items_center()
          .child(picture("pr", color))
          .child(div().text_size(12).text_color(color).child(`#${pr.number}`))
          .tooltip(`${pr.isDraft ? "Draft" : pr.state} PR: ${pr.title}`),
      );
      if (pr.reviewDecision)
        parts.push(
          picture(
            "review",
            pr.reviewDecision === "CHANGES_REQUESTED"
              ? t.ansi1
              : pr.reviewDecision === "APPROVED"
                ? t.done
                : t.blocked,
          ).tooltip(`Review: ${pr.reviewDecision}`),
        );
      if (pr.checks !== "none")
        parts.push(
          picture(
            pr.checks === "passing" ? "checks" : pr.checks === "failed" ? "error" : "pending",
            pr.checks === "failed" ? t.ansi1 : pr.checks === "passing" ? t.done : t.blocked,
          ).tooltip(`All checks: ${pr.checks}`),
        );
    }
    if (this.cacheError || stale(m))
      parts.push(
        h_flex()
          .gap(3)
          .items_center()
          .text_size(11)
          .text_color(t.blocked)
          .child(picture("unknown", t.blocked))
          .child(m ? "Stale metadata" : "No Git data")
          .tooltip(
            `Git metadata is stale or unavailable. ${m?.gitError || m?.prError || this.cacheError || "Waiting for collector."}`,
          ),
      );
    return h_flex().gap(6).h(26).items_center().children(parts);
  }
  row(session, w) {
    const t = theme(),
      active = session.tabs.includes(focused()?.tab);
    const controls = [
      button(
        `track-${session.id}`,
        session.tracked
          ? canDismiss(session, w)
            ? "Dismiss from Activity, leaving terminals running"
            : `Cannot dismiss while the main agent is ${sessionStatus(session, w)}. Wait until idle.`
          : "Activate in Activity",
        () => save(track(load(), world(), session.id, !session.tracked)),
        session.tracked
          ? { icon: "dismiss", disabled: !canDismiss(session, w) }
          : { text: "Activate" },
      ),
      button(
        `close-${session.id}`,
        "Close session and terminate its main and auxiliary terminals. Confirmation required.",
        () => {
          const plan = closePlan(load(), world(), session.id);
          openOverlay({
            mod: "toolkit-workbench",
            kind: "dialog",
            modal: true,
            width: 470,
            props: { role: "close", session: session.id, plan },
          });
        },
        { icon: "close" },
      ),
    ];
    const row = this.dropTarget(
      h_flex()
        .id(`session-${session.id}`)
        .min_h(66)
        .px(5)
        .gap(6)
        .rounded(6)
        .items_center()
        .when(active, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .cursor_pointer()
        .on_click(() => {
          if (this.suppressClick) {
            this.suppressClick = false;
            return;
          }
          if (!this.drag) {
            try {
              this.select(session);
            } catch (e) {
              fail(e);
            }
          }
        })
        .child(this.grip("work", session.id))
        .child(this.status(session, w))
        .child(
          v_flex()
            .flex_1()
            .min_w(0)
            .gap(4)
            .child(div().text_size(14).truncate().child(session.title))
            .child(this.metadata(session, w)),
        )
        .children(controls),
      "work",
      session.id,
    );
    const result = [row];
    if (this.mode !== "full") return result;
    const tabs = liveTabs(w).filter((tab) => session.tabs.includes(tab.id));
    const aux = tabs.filter((tab) => tab.id !== session.main);
    if (aux.length)
      result.push(
        button(
          `expand-${session.id}`,
          "Show auxiliary tabs",
          (cx) => {
            if (this.expanded.has(session.id)) this.expanded.delete(session.id);
            else this.expanded.add(session.id);
            cx.notify();
          },
          {
            text: `${this.expanded.has(session.id) ? "⌄" : "›"} ${aux.length} auxiliary tabs · not tracked`,
          },
        ).ml(32),
      );
    // A missing main remains explicit; choosing another tab is never automatic.
    if (!tabs.some((tab) => tab.id === session.main))
      result.push(
        div()
          .ml(32)
          .text_size(10)
          .text_color(t.blocked)
          .child("Main tab closed. Choose Make main below."),
      );
    if (this.expanded.has(session.id) || !tabs.some((tab) => tab.id === session.main))
      for (const tab of aux) {
        result.push(
          h_flex()
            .id(`aux-${tab.id}`)
            .ml(32)
            .gap(3)
            .items_center()
            .child(
              div()
                .flex_1()
                .min_w(0)
                .truncate()
                .text_size(10)
                .text_color(t.muted)
                .child(tab.name)
                .cursor_pointer()
                .on_click(() => this.select(session, tab.id)),
            )
            .child(
              button(
                `main-${tab.id}`,
                "Make this the main tab",
                () => save(makeMain(load(), session.id, tab.id)),
                { text: "Main" },
              ),
            )
            .child(
              button(
                `graduate-${tab.id}`,
                "Graduate into an independent tracked session",
                () => save(graduate(load(), tab.id)),
                { text: "Graduate", color: t.accent },
              ),
            ),
        );
      }
    return result;
  }
  confirmClose(cx) {
    if (this.closing) return;
    this.closing = true;
    cx.notify();
    cx.spawn(async (current) => {
      try {
        const expected = this.confirmedPlan || props().plan;
        const result = await executeClose(expected, {
          readState: load,
          readWorld: world,
          kill: async (address) => {
            const r = await exec("hc", ["kill", address]);
            if (r.code !== 0) throw new Error(r.stderr || `Could not terminate ${address}`);
          },
          closeTab: (id) => command("tab.close", { id, confirmed: true }),
          verify: async (plan, descendants) => {
            const response = await appExec(["ls"]);
            if (response.code !== 0) throw new Error("Final verification failed");
            const layout = JSON.parse(response.stdout);
            if (!Array.isArray(layout.spaces) || layout.spaces.some((s) => !Array.isArray(s.tabs)))
              throw new Error("Invalid final layout response");
            if (layout.spaces.some((s) => s.tabs.some((tab) => plan.tabs.includes(tab.id))))
              throw new Error("Some tabs are still closing");
            if (terminals().some((t) => descendants.includes(t.address) && t.state === "live"))
              throw new Error("A descendant terminal is still live");
          },
        });
        if (result.changed) {
          this.confirmedPlan = result.changed;
          this.message = "Session contents changed. Review the updated scope and confirm again.";
        } else closeOverlay(props().overlay);
      } catch (e) {
        this.message = String(e.message || e);
      }
      this.closing = false;
      current.notify();
    });
  }
  closeView() {
    const t = theme(),
      state = load(),
      w = world(),
      session = state.sessions[props().session];
    let plan;
    try {
      plan = closePlan(state, w, props().session);
    } catch (e) {
      return v_flex()
        .p(24)
        .gap(12)
        .child(this.message || String(e.message))
        .child(
          button("close-dialog", "Close dialog", () => closeOverlay(props().overlay), {
            text: "Back",
          }),
        );
    }
    const names = liveTabs(w);
    return v_flex()
      .p(24)
      .gap(14)
      .text_color(t.foreground)
      .child(div().text_size(18).child(`Close ${session.title}?`))
      .child(
        div()
          .text_size(12)
          .child("Terminate the main tab, auxiliary tabs, and their descendant terminals."),
      )
      .child(
        v_flex()
          .max_h(220)
          .overflow_y_scrollbar()
          .gap(8)
          .children(
            plan.tabs.map((id) =>
              div()
                .text_size(12)
                .child(
                  `${id === plan.main ? "Main" : "Auxiliary"} · ${names.find((tab) => tab.id === id)?.name || id}`,
                ),
            ),
          ),
      )
      .child(
        div()
          .text_size(11)
          .text_color(t.muted)
          .child(`${plan.tabs.length} tabs · ${plan.terminals.length} terminals`),
      )
      .when(plan.warnings.length > 0, (el) =>
        el.child(
          div()
            .text_size(12)
            .text_color(t.blocked)
            .child("Non-idle agents are present. Closing will interrupt them."),
        ),
      )
      .child(
        div()
          .text_size(11)
          .text_color(t.muted)
          .child(
            "Graduated sessions stay open. Worktree files and saved agent history stay on disk.",
          ),
      )
      .when(Boolean(this.message), (el) =>
        el.child(div().text_size(11).text_color(t.blocked).child(this.message)),
      )
      .child(
        h_flex()
          .justify_end()
          .gap(8)
          .child(
            button("cancel-close", "Cancel", () => closeOverlay(props().overlay), {
              text: "Cancel",
              disabled: this.closing,
            }),
          )
          .child(
            button("confirm-close", "Terminate this session", (cx) => this.confirmClose(cx), {
              text: this.closing ? "Closing…" : "Close session",
              color: t.ansi1,
              disabled: this.closing,
            }),
          ),
      );
  }
  render(cx) {
    if (props()?.role === "picker") return super.render(cx);
    if (props()?.role === "close") return this.closeView();
    const t = theme();
    let state, w;
    try {
      ({ state, w } = this.current());
    } catch (e) {
      return div().p(16).text_color(t.blocked).child(`Workbench state error: ${e.message}`);
    }
    const sessions = visibleSessions(state, w, this.mode);
    // Work ordering must not implicitly reorder its repository headings.
    const visibleProjects = new Set(sessions.map((s) => s.projectId));
    const projects = ordered(
      [...new Set(Object.values(state.sessions).map((s) => s.projectId))].filter((id) =>
        visibleProjects.has(id),
      ),
      state.projectOrder,
      (x) => x,
    );
    setAgentOrder(sessions.flatMap((s) => mainAgents(s, w).map((a) => a.address)));
    const rows = projects.flatMap((id) => {
      const members = sessions.filter((s) => s.projectId === id),
        first = members[0];
      const header = this.dropTarget(
        h_flex()
          .id(`project-${id}`)
          .h(33)
          .gap(5)
          .items_center()
          .text_size(10)
          .text_color(t.muted)
          .child(this.grip("project", id))
          .child(
            div()
              .child(
                `${this.folded.has(id) ? "›" : "⌄"}  ${props()?.repoAliases?.[first.project] || first.project}${first.machine ? ` · ${first.machine}` : ""}`,
              )
              .truncate()
              .flex_1(),
          )
          .child(div().child(String(members.length)))
          .cursor_pointer()
          .on_click((_e, cx) => {
            if (this.suppressClick) {
              this.suppressClick = false;
              return;
            }
            if (this.folded.has(id)) this.folded.delete(id);
            else this.folded.add(id);
            cx.notify();
          }),
        "project",
        id,
      );
      return [header, ...(this.folded.has(id) ? [] : members.flatMap((s) => this.row(s, w)))];
    });
    return v_flex()
      .id("workbench-root")
      .track_focus(this.focus)
      .on_key_down((event, cx) => {
        if (event.key === "escape" && this.drag) {
          this.drag = null;
          this.over = null;
          cx.notify();
        }
      })
      .on_mouse_down_out((_e, cx) => {
        if (this.drag) {
          this.drag = null;
          this.over = null;
          cx.notify();
        }
      })
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .text_color(t.foreground)
      .on_mouse_up("left", (_e, cx) => {
        if (this.drag) {
          this.drag = null;
          this.over = null;
          cx.notify();
        }
      })
      .child(
        h_flex()
          .h(48)
          .px(14)
          .items_center()
          .justify_between()
          .child(div().text_size(14).font_medium().child("Workbench"))
          .child(
            h_flex()
              .gap(5)
              .items_center()
              .child(
                button(
                  "toggle-view",
                  this.mode === "activity"
                    ? "Activity: tracked work. Click to show Full."
                    : "Full: all tabs. Click to show Activity.",
                  (cx) => {
                    this.mode = this.mode === "activity" ? "full" : "activity";
                    cx.notify();
                  },
                  { icon: "eye-filled", color: this.mode === "activity" ? t.accent : t.dim },
                )
                  .rounded(13)
                  .when(this.mode === "activity", (el) => el.bg(t.selected)),
              )
              .child(
                button("pick-work", "Find open work", () => openPicker("work"), { text: "Work" }),
              )
              .child(
                button(
                  "open-projects",
                  "Browse projects, worktrees, and scratch work",
                  () => openPicker("projects"),
                  {
                    icon: "plus",
                  },
                ),
              ),
          ),
      )
      .child(
        v_flex()
          .id("workbench-list")
          .flex_1()
          .min_h(0)
          .px(8)
          .pt(12)
          .overflow_y_scrollbar()
          .children(rows)
          .when(rows.length === 0, (el) =>
            el.child(
              div()
                .p(12)
                .text_size(12)
                .text_color(t.muted)
                .child("No tracked work. Use Full to activate a session, or + to open a folder."),
            ),
          ),
      )
      .child(
        h_flex()
          .h(30)
          .px(12)
          .items_center()
          .justify_between()
          .text_size(9)
          .text_color(t.dim)
          .child(div().child("⠿ Drag to reorder"))
          .child(
            div()
              .child("Main tab only")
              .tooltip(
                "Only main-tab agents contribute state. GitHub data comes from the shared collector.",
              ),
          ),
      );
  }
}
