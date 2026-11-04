import { View, div, svg } from "gpui-kit";
import {
  h_flex,
  v_flex,
  InputState,
  Input,
  v_virtual_list,
  VirtualListScrollHandle,
  Scrollbar,
} from "gpui-base";
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
  exec,
  appHome,
  props,
  openOverlay,
  closeOverlay,
  pickFolder,
} from "herdr";
import { initialState, reconcile, stateKey } from "./model.js";
import { matches, workRows, openRows, selectedRow, plain } from "./picker-model.js";

const world = () => ({
  spaces: spaces(),
  panes: panes(),
  agents: agents(),
  terminals: terminals(),
  machines: machines(),
});
const activationKey = "toolkit.picker.activate";
const historyKey = "toolkit.picker.previous";
const jobKey = "toolkit.picker.job";

export async function helper(command, data = {}) {
  const result = await exec("env", [
    `HERDR_APP_HOME=${appHome()}`,
    "python3",
    `${appHome()}/bin/toolkit-picker`,
    command,
    JSON.stringify(data),
  ]);
  if (result.code !== 0) throw new Error(result.stderr || `Picker ${command} failed`);
  return JSON.parse(result.stdout);
}

async function appCommand(name, args) {
  const result = await exec("env", [
    `HERDR_APP_HOME=${appHome()}`,
    "herdr-app",
    "do",
    name,
    JSON.stringify(args),
  ]);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout);
  const data = JSON.parse(result.stdout);
  if (data.error) throw new Error(data.error);
}

export function openPicker(kind = "work") {
  openOverlay({
    mod: "toolkit-workbench",
    kind: "dialog",
    modal: true,
    width: 1040,
    height: 680,
    props: { role: "picker", kind, origin: focused()?.tab },
  });
}

export async function selectWork(tab, origin, activate = false) {
  if (!spaces().some((s) => s.tabs.some((t) => t.id === tab)))
    throw new Error("This tab has closed. Refresh the picker.");
  await appCommand("tab.select", { id: tab });
  if (origin && origin !== tab && spaces().some((s) => s.tabs.some((t) => t.id === origin)))
    setShared(historyKey, origin);
  if (activate) setShared(activationKey, { ...shared(activationKey), [tab]: true });
}

export async function previousWork() {
  const previous = shared(historyKey);
  if (!previous) throw new Error("No previous picker-selected tab yet.");
  await selectWork(previous, focused()?.tab);
}

function action(id, text, callback, disabled = false, danger = false) {
  const t = theme();
  return h_flex()
    .id(id)
    .h(32)
    .px(10)
    .rounded(5)
    .items_center()
    .flex_none()
    .text_size(12)
    .text_color(disabled ? t.dim : danger ? t.ansi1 : t.foreground)
    .when(!disabled, (el) =>
      el
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => callback(cx)),
    )
    .child(text);
}

export default class Picker extends View {
  init(_p, cx) {
    this.origin = props()?.origin || focused()?.tab;
    this.kind = props()?.kind || "work";
    this.location = null;
    this.items = [];
    this.query = "";
    this.selected = this.kind === "work" ? this.origin : null;
    this.preview = "";
    this.previewKey = null;
    this.previewGeneration = 0;
    this.error = "";
    this.loading = false;
    this.form = null;
    this.job = null;
    this.polling = false;
    this.scroll = VirtualListScrollHandle.new();
    this.focus = cx.focus_handle();
    this.input = InputState.new({
      placeholder: this.kind === "work" ? "Find open work…" : "Find a repository or scratch root…",
    });
    this.input.on("change", (_e, current) => {
      this.query = this.input.value();
      this.selected = null;
      this.scroll.scroll_to_item(0);
      current.notify();
    });
    this.input.on("submit", (_e, current) => this.choose(current));
    this.input.focus();
    this.refresh(cx);
    // Poll only expensive preview data and explicit jobs. Live Herdr rows redraw
    // from native data subscriptions; no agent-status polling or screen inference.
    this.tick = 0;
    cx.timer.every(1000, (current) => {
      this.tick++;
      if (this.job?.state === "running") this.pollJob(current);
      else if (!this.job && !this.form) {
        this.requestPreview(this.currentRow(), current, true);
        if (this.kind === "projects" && (this.location || this.tick % 10 === 0))
          this.refresh(current);
      }
    });
    const job = shared(jobKey);
    if (job) {
      this.job = { job, state: "running" };
      this.resume = true;
      this.pollJob(cx);
    }
  }
  rows() {
    let rows = this.items;
    if (this.kind === "work") {
      const w = world();
      rows = workRows(reconcile(initialState(shared(stateKey)), w), w, this.origin);
    }
    if (this.location) rows = openRows(rows, initialState(shared(stateKey)), world());
    return rows.filter((row) => matches(`${row.name} ${row.detail}`, this.query));
  }
  currentRow() {
    return selectedRow(this.rows(), this.selected);
  }
  refresh(cx) {
    if (this.kind === "work") {
      cx.notify();
      return;
    }
    if (this.loading) return;
    this.loading = true;
    this.error = "";
    const location = this.location;
    cx.spawn(async (current) => {
      try {
        this.items = await helper(
          location ? (location.kind === "git" ? "worktrees" : "scratch") : "projects",
          location ? { path: location.path } : {},
        );
      } catch (error) {
        this.error = String(error.message || error);
      }
      this.loading = false;
      current.notify();
    });
  }
  requestPreview(row, cx, force = false) {
    if (!row || this.form || this.job || this.previewBusy) return;
    const key = `${row.id}:${row.status || ""}`;
    if (!force && this.previewKey === key) return;
    this.previewKey = key;
    this.previewBusy = true;
    const generation = ++this.previewGeneration;
    if (!force) this.preview = "Loading preview…";
    cx.spawn(async (current) => {
      let text;
      try {
        if (row.kind === "work") {
          const members = panes().filter((p) => p.tab === row.tab);
          const primary = [...members]
            .sort((a, b) => {
              const rank = { done: 0, blocked: 1, working: 2, idle: 3 };
              return (rank[a.status] ?? 4) - (rank[b.status] ?? 4);
            })
            .find((p) => p.terminal);
          text = [
            row.name,
            row.detail,
            "",
            "Panes",
            ...members.map(
              (p) =>
                `${p.program?.name || p.app || "Terminal"} · ${p.status || "idle"} · ${p.cwd || p.title || ""}`,
            ),
          ].join("\n");
          if (primary?.cwd && !row.machine) {
            const git = await exec(
              "git",
              ["--no-optional-locks", "status", "--short", "--branch"],
              { cwd: primary.cwd },
            );
            text +=
              git.code === 0
                ? `\n\n${git.stdout}`
                : /not a git repository/i.test(git.stderr)
                  ? ""
                  : `\nGit preview error: ${git.stderr}`;
          }
          if (primary) {
            const result = await exec("hc", ["read", primary.terminal, "--lines", "0", "--json"]);
            if (result.code !== 0) throw new Error(result.stderr);
            text +=
              "\n\nCurrent screen\n──────────────\n" +
              JSON.parse(result.stdout).text.split("\n").slice(-80).join("\n");
          }
        } else text = await helper("preview", row);
      } catch (error) {
        text = `Preview unavailable: ${error.message || error}`;
      }
      if (generation === this.previewGeneration && this.currentRow()?.id === row.id)
        this.preview = plain(text);
      else this.previewKey = null;
      this.previewBusy = false;
      current.notify();
    });
  }
  choose(cx) {
    if (this.form) {
      this.submitForm(cx);
      return;
    }
    if (this.job || this.loading) return;
    const row = this.currentRow();
    if (!row) return;
    if (row.kind === "work") {
      cx.spawn(async (current) => {
        try {
          await selectWork(row.tab, this.origin);
          closeOverlay(props().overlay);
        } catch (error) {
          this.error = String(error.message || error);
          current.notify();
        }
      });
    } else this.start({ action: "open", path: row.path, origin: this.origin }, cx);
  }
  browse(cx) {
    if (this.kind !== "projects" || this.location || this.job || this.form) return;
    const row = this.currentRow();
    if (!row) return;
    this.location = row;
    this.query = "";
    this.input.set_value("");
    this.selected = null;
    this.items = [];
    this.previewKey = null;
    this.scroll.scroll_to_item(0);
    this.refresh(cx);
  }
  back(cx) {
    if (this.job?.state === "running") return;
    if (this.job) {
      this.job = null;
      setShared(jobKey, null);
    } else if (this.form) {
      this.form = null;
      this.plan = null;
    } else if (this.location) {
      this.location = null;
      this.items = [];
      this.query = "";
      this.input.set_value("");
      this.selected = null;
      this.refresh(cx);
    } else {
      closeOverlay(props().overlay);
      return;
    }
    this.error = "";
    this.previewKey = null;
    this.input.focus();
    cx.notify();
  }
  create(cx) {
    if (this.kind !== "projects" || this.job || this.form || this.loading) return;
    const project = this.location || this.currentRow();
    if (!project) return;
    this.form = { action: project.kind === "git" ? "create" : "scratch", project };
    this.formInput = InputState.new({
      placeholder: project.kind === "git" ? "New branch name" : "New scratch directory name",
    });
    this.formInput.on("submit", (_e, current) => this.submitForm(current));
    this.formInput.focus();
    this.error = "";
    cx.notify();
  }
  prepareRemoval(mode, cx) {
    const row = this.currentRow();
    if (
      this.kind !== "projects" ||
      this.location?.kind !== "git" ||
      !row ||
      this.form ||
      this.job ||
      this.loading
    )
      return;
    this.loading = true;
    this.error = "";
    cx.spawn(async (current) => {
      try {
        this.plan = await helper("plan", {
          repo: this.location.path,
          path: row.path,
          mode,
          origin: this.origin,
        });
        this.form = { action: "remove" };
        this.formInput = InputState.new({ placeholder: "Type yes to remove" });
        this.formInput.on("submit", (_e, now) => this.submitForm(now));
        this.formInput.focus();
      } catch (error) {
        this.error = String(error.message || error);
      }
      this.loading = false;
      current.notify();
    });
  }
  submitForm(cx) {
    if (!this.form || this.job || this.loading) return;
    const value = this.formInput.value().trim();
    if (!value) {
      this.error = "A name is required.";
      cx.notify();
      return;
    }
    if (this.form.action === "remove") {
      if (value !== "yes") {
        this.error = "Type yes to confirm removal.";
        cx.notify();
        return;
      }
      this.start({ action: "remove", plan: this.plan, confirmation: value }, cx);
    } else {
      const { project, action: operation } = this.form;
      this.start(
        {
          action: operation,
          name: value,
          repo: project.path,
          root: project.path,
          origin: this.origin,
        },
        cx,
      );
    }
  }
  start(data, cx) {
    if (this.loading || this.job) return;
    this.loading = true;
    this.error = "";
    cx.spawn(async (current) => {
      try {
        const job = await helper("submit", data);
        setShared(jobKey, job.job);
        this.job = { ...job, state: "running" };
        this.form = null;
        this.resume = false;
      } catch (error) {
        this.error = String(error.message || error);
      }
      this.loading = false;
      current.notify();
    });
  }
  pollJob(cx) {
    if (this.polling || !this.job) return;
    this.polling = true;
    const ident = this.job.job;
    cx.spawn(async (current) => {
      try {
        const job = await helper("job", { job: ident });
        this.job = job;
        if (job.state === "done" && !this.resume) {
          if (job.result?.tab) {
            await selectWork(job.result.tab, this.origin, true);
            setShared(jobKey, null);
            closeOverlay(props().overlay);
          } else {
            this.items = [];
            this.refresh(current);
          }
        }
      } catch (error) {
        this.error = `Could not inspect job ${ident}: ${error.message || error}. Inspect data/toolkit-picker/jobs before starting another operation.`;
      }
      this.polling = false;
      current.notify();
    });
  }
  openResult(cx) {
    cx.spawn(async (current) => {
      try {
        await selectWork(this.job.result.tab, this.origin, true);
        setShared(jobKey, null);
        closeOverlay(props().overlay);
      } catch (error) {
        this.error = String(error.message || error);
        current.notify();
      }
    });
  }
  goPrevious(cx) {
    cx.spawn(async (current) => {
      try {
        await previousWork();
        closeOverlay(props().overlay);
      } catch (error) {
        this.error = String(error.message || error);
        current.notify();
      }
    });
  }
  openFolder(cx) {
    cx.spawn(async (current) => {
      try {
        const path = await pickFolder({ prompt: "Open folder" });
        if (path) this.start({ action: "open", path, origin: this.origin }, current);
      } catch (error) {
        this.error = String(error.message || error);
        current.notify();
      }
    });
  }
  key(event, cx) {
    const key = event.key;
    if (key === "escape") {
      this.back(cx);
      cx.stop_propagation();
      return;
    }
    if (this.form || this.job || this.loading) return;
    const control = event.modifiers.control;
    if (control && key === "w") this.browse(cx);
    else if (control && key === "g") this.create(cx);
    else if (control && key === "r") this.refresh(cx);
    else if (control && this.location?.kind === "git" && ["d", "k", "x"].includes(key))
      this.prepareRemoval({ d: "normal", k: "keep", x: "force" }[key], cx);
    else if (["down", "up"].includes(key) || (control && ["n", "j", "p", "k"].includes(key))) {
      const rows = this.rows();
      if (!rows.length) return;
      const at = rows.findIndex((r) => r.id === this.currentRow()?.id);
      const next = (at + (["up", "p", "k"].includes(key) ? rows.length - 1 : 1)) % rows.length;
      this.selected = rows[next].id;
      this.scroll.scroll_to_item(next, "center");
      this.previewKey = null;
    } else return;
    cx.stop_propagation();
    cx.notify();
  }
  formView() {
    const t = theme();
    const removing = this.form.action === "remove";
    const mode = this.plan?.mode;
    const description = removing
      ? `${this.plan.path}\n${mode === "force" ? "FORCE: delete dirty files and the unmerged branch." : mode === "keep" ? "Remove checkout, retain its branch." : "Remove checkout; delete branch only when Worktrunk considers it integrated."}\n\nClose these tabs first:\n${this.plan.tabs.map((tab) => `${tab.name} · ${tab.terminals.length} terminals`).join("\n") || "No open tabs"}\n\nThis is separate from dismissing or closing a tracked session. Files in this checkout will be removed.`
      : `${this.form.project.path}\n\n${this.form.action === "create" ? "Fetch origin's current default branch, create with Worktrunk, then open a tab and run setup hooks. pre-start must succeed before the shell opens. The checkout is preserved on failure." : "Create a new directory and open it as tracked work. Existing directories are never replaced."}`;
    return v_flex()
      .flex_1()
      .min_h(0)
      .gap(16)
      .p(22)
      .child(
        div()
          .text_size(18)
          .child(
            removing
              ? "Remove worktree?"
              : this.form.action === "create"
                ? "Create worktree"
                : "Create scratch work",
          ),
      )
      .child(
        v_flex()
          .id("picker-confirmation-scope")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .gap(5)
          .children(
            description.split("\n").map((line) =>
              div()
                .text_size(13)
                .text_color(removing && mode === "force" ? t.ansi1 : t.muted)
                .child(line || " "),
            ),
          ),
      )
      .child(Input.new(this.formInput).w_full())
      .child(
        h_flex()
          .gap(8)
          .child(action("form-cancel", "Back", (cx) => this.back(cx), this.loading))
          .child(
            action(
              "form-submit",
              this.loading ? "Starting…" : removing ? "Remove worktree" : "Create and open",
              (cx) => this.submitForm(cx),
              this.loading,
              removing,
            ),
          ),
      );
  }
  jobView() {
    const t = theme(),
      job = this.job;
    return v_flex()
      .flex_1()
      .min_h(0)
      .gap(12)
      .p(20)
      .child(
        div()
          .text_size(18)
          .child(
            job.state === "running"
              ? "Operation running…"
              : job.state === "failed"
                ? "Operation stopped"
                : "Operation complete",
          ),
      )
      .child(
        div()
          .text_size(12)
          .text_color(t.muted)
          .child(
            `Job ${job.job}. Closing this dialog does not cancel it. Reopen either picker to inspect it.`,
          ),
      )
      .when(Boolean(job.error), (el) => el.child(div().text_color(t.ansi1).child(job.error)))
      .child(
        v_flex()
          .id("job-output")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .children(
            plain(job.log || "Waiting for output…")
              .split("\n")
              .map((line) =>
                div()
                  .text_size(12)
                  .font_family("monospace")
                  .child(line || " "),
              ),
          ),
      )
      .child(
        h_flex()
          .gap(8)
          .when(job.state === "done" && Boolean(job.result?.tab), (bar) =>
            bar.child(action("job-open-result", "Open result", (cx) => this.openResult(cx))),
          )
          .child(action("job-close", "Close dialog", () => closeOverlay(props().overlay)))
          .when(job.state !== "running", (el) =>
            el.child(action("job-back", "Back to picker", (cx) => this.back(cx))),
          ),
      );
  }
  render(cx) {
    const t = theme();
    const rows = this.rows(),
      row = selectedRow(rows, this.selected);
    if (row && row.id !== this.selected) this.selected = row.id;
    this.requestPreview(row, cx);
    const removal = this.location?.kind === "git";
    return v_flex()
      .id("native-picker")
      .track_focus(this.focus)
      .on_key_down((e, current) => this.key(e, current))
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .text_color(t.foreground)
      .text_size(13)
      .child(
        h_flex()
          .h(52)
          .px(18)
          .items_center()
          .justify_between()
          .child(
            div()
              .font_semibold()
              .text_size(16)
              .child(
                this.kind === "work"
                  ? "Open work"
                  : this.location
                    ? this.location.name
                    : "Projects",
              ),
          )
          .child(action("picker-close", "Close", () => closeOverlay(props().overlay))),
      )
      .when(Boolean(this.error), (el) =>
        el.child(div().px(20).py(8).text_color(t.ansi1).child(this.error)),
      )
      .when(Boolean(this.job), (el) => el.child(this.jobView()))
      .when(!this.job && Boolean(this.form), (el) => el.child(this.formView()))
      .when(!this.job && !this.form, (el) =>
        el
          .child(div().px(16).pb(12).child(Input.new(this.input).w_full()))
          .child(
            h_flex()
              .flex_1()
              .min_h(0)
              .items_stretch()
              .gap(1)
              .child(
                v_flex()
                  .w("43%")
                  .h_full()
                  .min_h(0)
                  .bg(t.chrome)
                  .when(rows.length === 0, (column) =>
                    column.child(
                      div()
                        .p(20)
                        .text_color(t.muted)
                        .child(this.loading ? "Loading…" : "No matches"),
                    ),
                  )
                  .when(rows.length > 0, (column) =>
                    column.child(
                      v_flex()
                        .relative()
                        .size_full()
                        .flex_1()
                        .min_h(0)
                        .child(
                          v_virtual_list(
                            "picker-rows",
                            rows.length,
                            62,
                            (index) => rows[index].id,
                            (range) =>
                              rows.slice(range.start, range.end).map((item) =>
                                h_flex()
                                  .id(`pick-${item.id}`)
                                  .h(62)
                                  .px(12)
                                  .gap(9)
                                  .items_center()
                                  .rounded(5)
                                  .when(item.id === row?.id, (itemEl) => itemEl.bg(t.selected))
                                  .cursor_pointer()
                                  .hover((s) => s.bg(t.hover))
                                  .child(
                                    svg(
                                      `assets/toolkit-workbench/${item.status || (item.kind === "git" ? "pr" : "terminal")}.svg`,
                                    )
                                      .size(18)
                                      .flex_none()
                                      .text_color(t[item.status] || t.muted)
                                      .when(item.status === "working", (icon) => icon.spin(1000)),
                                  )
                                  .child(
                                    v_flex()
                                      .flex_1()
                                      .min_w(0)
                                      .gap(5)
                                      .child(div().truncate().child(item.name))
                                      .child(
                                        div()
                                          .truncate()
                                          .text_size(11)
                                          .text_color(t.muted)
                                          .child(item.detail),
                                      ),
                                  ),
                              ),
                          )
                            // Lazy rows cannot register callbacks. Keep one keyed
                            // handler on the list so stale clicks cannot select a
                            // different row after a refresh or filter.
                            .on_item_click((key, current) => {
                              if (!this.rows().some((item) => item.id === key)) return;
                              this.selected = key;
                              this.previewKey = null;
                              current.notify();
                            })
                            .track_scroll(this.scroll)
                            .size_full()
                            .flex_1(),
                        )
                        .child(Scrollbar.vertical("picker-rows").absolute().inset_0()),
                    ),
                  ),
              )
              .child(
                v_flex()
                  .id("picker-preview")
                  .flex_1()
                  .min_w(0)
                  .min_h(0)
                  .p(16)
                  .overflow_y_scrollbar()
                  .children(
                    this.preview.split("\n").map((line) =>
                      div()
                        .text_size(11)
                        .font_family("monospace")
                        .child(line || " "),
                    ),
                  ),
              ),
          )
          .child(
            h_flex()
              .px(10)
              .py(8)
              .gap(3)
              .items_center()
              .flex_wrap()
              .child(
                action(
                  "pick-open",
                  "Open ↵",
                  (current) => this.choose(current),
                  !row || this.loading,
                ),
              )
              .when(this.kind === "projects", (bar) =>
                bar
                  .child(
                    action(
                      "pick-back",
                      "Back",
                      (current) => this.back(current),
                      !this.location || this.loading,
                    ),
                  )
                  .when(!this.location, (buttons) =>
                    buttons.child(
                      action(
                        "pick-browse",
                        "Browse Ctrl+W",
                        (current) => this.browse(current),
                        !row || this.loading,
                      ),
                    ),
                  )
                  .child(
                    action(
                      "pick-create",
                      "New Ctrl+G",
                      (current) => this.create(current),
                      !row || this.loading,
                    ),
                  )
                  .child(
                    action(
                      "pick-folder",
                      "Open folder…",
                      (current) => this.openFolder(current),
                      this.loading,
                    ),
                  )
                  .when(removal, (buttons) =>
                    buttons
                      .child(
                        action(
                          "pick-remove",
                          "Remove Ctrl+D",
                          (current) => this.prepareRemoval("normal", current),
                          !row || this.loading,
                        ),
                      )
                      .child(
                        action(
                          "pick-keep",
                          "Keep branch Ctrl+K",
                          (current) => this.prepareRemoval("keep", current),
                          !row || this.loading,
                        ),
                      )
                      .child(
                        action(
                          "pick-force",
                          "Force Ctrl+X",
                          (current) => this.prepareRemoval("force", current),
                          !row || this.loading,
                          true,
                        ),
                      ),
                  ),
              )
              .when(this.kind === "work", (bar) =>
                bar.child(
                  action(
                    "pick-previous",
                    "Previous tab",
                    (current) => this.goPrevious(current),
                    !shared(historyKey),
                  ),
                ),
              )
              .child(
                action(
                  "pick-refresh",
                  "Refresh Ctrl+R",
                  (current) => this.refresh(current),
                  this.loading,
                ),
              ),
          ),
      );
  }
}
