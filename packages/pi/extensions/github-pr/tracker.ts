import { followsHead, structuredTarget, targetState, workingEntries } from "./working-set.ts";
import { GitHubError, type GitHubClient } from "./github.ts";
import {
  checkKey,
  executionKey,
  fingerprint,
  observationKey,
  syncReceipt,
  unseenProblems,
  type AutomaticState,
} from "./auto-watch.ts";
import {
  checkSummary,
  evaluate,
  label,
  type Outcome,
  type Snapshot,
  type Target,
  type Tracked,
  type Watch,
} from "./model.ts";

export interface TrackerHooks {
  changed(): void;
  persist(watches: Watch[], automatic: AutomaticState): void;
  /** One delivery per poll cycle. Throwing pauses affected watches without retrying. */
  outcomes(results: { watch: Watch; outcome: Outcome }[], allPassed: boolean): void;
}
const signature = (s: Snapshot, failedOnly = false) =>
  observationKey(failedOnly ? { ...s, checks: s.checks.filter((c) => c.state === "failed") } : s);

/** One owner for automatic current-PR subscriptions, passive observations, and
 * bounded explicit waits. Subscription receipts are separate from wait lifetimes. */
export class Tracker {
  readonly entries = new Map<string, Tracked>();
  current?: string;
  discoveryError?: string;
  autoWatch = true;
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private flights = new Map<string, Promise<void>>();
  private discovery?: Promise<void>;
  private discoveryDue = 0;
  private running = false;
  private disposed = false;
  private cancellations = new Map<string, number>();
  private pending: { entry: Tracked; watch: Watch; outcome: Outcome }[] = [];
  private workingSetCompleted?: string;
  private ticking?: Promise<void>;

  private client: GitHubClient;
  private hooks: TrackerHooks;
  private now: () => number;
  constructor(client: GitHubClient, hooks: TrackerHooks, now = Date.now) {
    this.client = client;
    this.hooks = hooks;
    this.now = now;
  }

  restore(watches: Watch[], automatic?: AutomaticState): void {
    if (automatic) {
      this.autoWatch = automatic.enabled;
      this.workingSetCompleted = automatic.workingSetCompleted;
    }
    for (const watch of watches)
      this.entries.set(watch.target.url, {
        target: watch.target,
        watch: { ...watch, status: watch.subscription ? watch.status : "paused" },
        due: 0,
        failures: 0,
      });
    for (const saved of automatic?.receipts || []) {
      let entry = this.entries.get(saved.target.url);
      if (!entry && this.entries.size < 8) {
        entry = { target: saved.target, due: 0, failures: 0 };
        this.entries.set(saved.target.url, entry);
      }
      if (entry) entry.receipt = saved.receipt;
    }
  }
  setAutoWatch(enabled: boolean): void {
    if (this.disposed) return;
    this.autoWatch = enabled;
    for (const entry of this.entries.values()) {
      if (entry.watch?.automatic)
        entry.watch = {
          ...entry.watch,
          status: enabled && entry.target.url === this.current ? "watching" : "cancelled",
        };
      if (enabled && entry.receipt && !entry.watch?.subscription) entry.receipt.paused = false;
      if (entry.target.url === this.current) entry.due = 0;
    }
    this.discoveryDue = 0;
    this.changed(true);
  }
  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    void this.loop();
  }
  private async loop(): Promise<void> {
    try {
      await this.tick();
    } catch (error) {
      if (!this.disposed) {
        this.discoveryError = error instanceof Error ? error.message : String(error);
        this.hooks.changed();
      }
    } finally {
      if (!this.disposed && this.running) {
        this.timer = setTimeout(() => void this.loop(), 5_000);
        this.timer.unref();
      }
    }
  }
  dispose(): void {
    this.disposed = true;
    this.running = false;
    clearTimeout(this.timer);
    this.controller.abort();
  }
  private changed(persist = false): void {
    if (this.disposed) return;
    if (persist)
      this.hooks.persist(
        [...this.entries.values()].flatMap((e) =>
          e.watch && !e.watch.automatic ? [{ ...e.watch }] : [],
        ),
        {
          enabled: this.autoWatch,
          workingSetCompleted: this.workingSetCompleted,
          receipts: [...this.entries.values()].flatMap((e) =>
            e.receipt ? [{ target: e.target, receipt: structuredClone(e.receipt) }] : [],
          ),
        },
      );
    this.hooks.changed();
  }
  private ensure(target: Target): Tracked {
    let entry = this.entries.get(target.url);
    if (entry) return entry;
    if (this.entries.size >= 8) {
      const discard = [...this.entries.values()].find(
        (e) =>
          e.target.url !== this.current &&
          e.watch?.status !== "watching" &&
          e.watch?.status !== "paused",
      );
      if (discard) this.entries.delete(discard.target.url);
      else throw new Error("Eight targets are already tracked. Cancel an unused watch first.");
    }
    entry = { target, due: 0, failures: 0 };
    this.entries.set(target.url, entry);
    return entry;
  }
  async discover(): Promise<void> {
    if (this.disposed) return;
    if (this.discovery) return this.discovery;
    this.discovery = (async () => {
      try {
        const target = await this.client.discover(this.controller.signal, () => {
          if (this.disposed) return;
          const previous = this.current;
          this.current = undefined;
          const old = previous ? this.entries.get(previous) : undefined;
          if (old?.watch?.automatic) {
            old.watch = undefined;
            old.settled = undefined;
          }
          if (old && !old.watch && !old.receipt) this.entries.delete(old.target.url);
          this.changed();
        });
        if (this.disposed) return;
        this.discoveryError = undefined;
        const old = this.current && this.entries.get(this.current);
        if (old && old.target.url !== target?.url) {
          if (old.watch?.automatic) {
            old.watch = undefined;
            old.settled = undefined;
          }
          if (!old.watch && !old.receipt) this.entries.delete(old.target.url);
        }
        this.current = target?.url;
        if (target) this.ensure(target);
      } catch (error) {
        if (!this.disposed)
          this.discoveryError = error instanceof Error ? error.message : String(error);
      } finally {
        this.discoveryDue = this.now() + 15_000;
        this.discovery = undefined;
        this.changed();
      }
    })();
    return this.discovery;
  }
  async tick(): Promise<void> {
    if (this.ticking) return this.ticking;
    this.ticking = this.cycle().finally(() => {
      this.ticking = undefined;
    });
    return this.ticking;
  }
  private async cycle(): Promise<void> {
    if (this.disposed) return;
    if (this.now() >= this.discoveryDue) await this.discover();
    await Promise.all(
      [...this.entries.values()]
        .filter(
          (e) =>
            (e.target.url === this.current || e.watch?.status === "watching") &&
            (this.now() >= e.due ||
              (e.watch?.status === "watching" &&
                e.watch.deadline !== undefined &&
                this.now() >= e.watch.deadline)),
        )
        .map((e) => this.refresh(e)),
    );
    if (this.pending.some((result) => result.watch.automatic)) await this.discover();
    this.flush();
  }
  async subscribe(
    target: Target,
    metadata: { label?: string; order?: number } = {},
    signal?: AbortSignal,
  ): Promise<Watch> {
    if (target.kind !== "pr") throw new Error("Persistent subscriptions require a PR URL.");
    if (this.disposed || signal?.aborted) throw new Error("Watch setup cancelled.");
    const entry = this.ensure(target);
    const cancellation = this.cancellations.get(target.url);
    await this.refresh(entry, true);
    if (
      !this.valid(entry) ||
      signal?.aborted ||
      this.cancellations.get(target.url) !== cancellation
    )
      throw new Error("Watch setup cancelled.");
    if (!entry.snapshot || entry.error) throw new Error(entry.error || "Cannot read target.");
    entry.receipt = syncReceipt(entry.snapshot, entry.receipt);
    entry.receipt.paused = false;
    if (entry.watch?.subscription && entry.watch.status === "watching") {
      entry.watch.label = metadata.label ?? entry.watch.label;
      entry.watch.order = metadata.order ?? entry.watch.order;
      this.changed(true);
      return { ...entry.watch };
    }
    entry.watch = {
      target,
      head: entry.snapshot.head,
      startedAt: this.now(),
      subscription: true,
      label: metadata.label ?? entry.watch?.label,
      order: metadata.order ?? entry.watch?.order,
      status: "watching",
    };
    entry.settled = undefined;
    entry.due = this.now();
    this.changed(true);
    return { ...entry.watch };
  }
  async startWatch(
    target?: Target,
    timeoutMinutes = 60,
    resume = false,
    signal?: AbortSignal,
  ): Promise<Watch> {
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes < 1 || timeoutMinutes > 240)
      throw new Error("Timeout must be between 1 and 240 minutes.");
    if (this.disposed || signal?.aborted) throw new Error("Watch setup cancelled.");
    if (target?.kind === "pr" && this.autoWatch && !this.current) await this.discover();
    if (!target) {
      await this.discover();
      target = this.current ? this.entries.get(this.current)?.target : undefined;
      if (!target)
        throw new Error(
          this.discoveryError || "No current-branch PR. Supply an explicit PR or Actions run URL.",
        );
    }
    const entry = this.ensure(target);
    if (resume && entry.watch?.subscription && entry.watch.status === "paused")
      return this.subscribe(target, entry.watch, signal);
    if (
      this.autoWatch &&
      target.url === this.current &&
      entry.watch?.automatic &&
      entry.watch.status === "paused"
    )
      this.setAutoWatch(true);
    if (entry.watch?.status === "watching") return { ...entry.watch };
    const saved = resume ? entry.watch : undefined;
    if (resume && saved?.status !== "paused") throw new Error("This target has no paused watch.");
    // Cancellation also invalidates starts that have not finished their initial read.
    const cancellation = this.cancellations.get(target.url);
    // Share an in-flight passive read, but never arm a wait from cached state.
    await this.refresh(entry, true);
    if (
      !this.valid(entry) ||
      signal?.aborted ||
      this.cancellations.get(target.url) !== cancellation
    )
      throw new Error("Watch setup cancelled.");
    if (!entry.snapshot || entry.error) throw new Error(entry.error || "Cannot read target.");
    // Another concurrent start may have armed the same target while we read it.
    const concurrent = this.entries.get(target.url)?.watch;
    if (concurrent?.status === "watching") return { ...concurrent };
    const now = this.now();
    entry.watch = saved
      ? { ...saved, status: "watching", outcome: undefined }
      : {
          target,
          head: entry.snapshot.head,
          startedAt: now,
          deadline: now + timeoutMinutes * 60_000,
          status: "watching",
        };
    entry.settled = undefined;
    entry.due = now;
    this.changed(true);
    return { ...entry.watch };
  }
  cancel(url?: string): number {
    let count = 0;
    const disable = !url || url === this.current;
    const preferenceChanged = disable && this.autoWatch;
    if (disable) this.autoWatch = false;
    for (const entry of this.entries.values()) {
      if (url && url !== entry.target.url) continue;
      this.cancellations.set(entry.target.url, (this.cancellations.get(entry.target.url) || 0) + 1);
      // Unwatch also dismisses terminal attention from an already-ended wait.
      // Keep the observation and outcome for the inline display and diagnostics.
      if (!entry.watch || entry.watch.status === "cancelled") continue;
      entry.watch.status = "cancelled";
      count++;
    }
    if (count || preferenceChanged) this.changed(true);
    return count;
  }
  private async refresh(entry: Tracked, setup = false): Promise<void> {
    const existing = this.flights.get(entry.target.url);
    if (existing) return existing;
    const promise = this.poll(entry, setup).finally(() => this.flights.delete(entry.target.url));
    this.flights.set(entry.target.url, promise);
    return promise;
  }
  private valid(entry: Tracked, watch?: Watch): boolean {
    return (
      !this.disposed &&
      this.entries.get(entry.target.url) === entry &&
      (!watch ||
        (entry.watch === watch &&
          watch.status === "watching" &&
          (!followsHead(watch) ||
            (!entry.receipt?.paused &&
              (watch.subscription || (this.autoWatch && this.current === entry.target.url))))))
    );
  }
  private syncAutomatic(entry: Tracked, snapshot: Snapshot): void {
    if (
      (!(entry.watch?.subscription && entry.watch.status !== "cancelled") &&
        (!this.autoWatch || entry.target.url !== this.current)) ||
      snapshot.target.kind !== "pr" ||
      snapshot.lifecycle !== "open"
    )
      return;
    const subscription = entry.watch?.subscription && entry.watch.status !== "cancelled";
    const previous = entry.receipt;
    const recovered = previous?.error !== undefined;
    entry.receipt = syncReceipt(snapshot, previous);
    entry.receipt.error = undefined;
    const invalidated =
      entry.receipt.completed !== undefined && entry.receipt.completed !== observationKey(snapshot);
    if (invalidated) entry.receipt.completed = undefined;
    if (
      !entry.watch ||
      !followsHead(entry.watch) ||
      entry.watch.head !== snapshot.head ||
      entry.watch.status === "cancelled"
    ) {
      entry.watch = {
        target: entry.target,
        head: snapshot.head,
        startedAt: this.now(),
        automatic: subscription ? undefined : true,
        subscription: subscription || undefined,
        label: entry.watch?.label,
        order: entry.watch?.order,
        status: entry.receipt.paused ? "paused" : "watching",
      };
      entry.settled = undefined;
    }
    if (previous !== entry.receipt || recovered || invalidated) this.changed(true);
  }
  private decision(entry: Tracked, watch: Watch, snapshot: Snapshot): Outcome | undefined {
    const now = this.now();
    if (followsHead(watch) && snapshot.lifecycle !== "open") return evaluate(watch, snapshot, now);
    if (followsHead(watch) && entry.receipt) {
      const problems = unseenProblems(snapshot, entry.receipt);
      if (problems.length) return evaluate(watch, { ...snapshot, checks: problems }, now);
      if (snapshot.checks.some((c) => c.state === "failed" || c.state === "blocked"))
        return undefined;
      if (entry.receipt.completed === observationKey(snapshot)) return undefined;
    }
    const direct = evaluate(watch, snapshot, now);
    if (direct) return direct;
    // Actions may schedule more jobs after the visible jobs finish. Only the run
    // conclusion can complete a workflow wait; PR waits cover observed contexts.
    if (snapshot.target.kind === "run") return undefined;
    const settled =
      snapshot.checks.length > 0 && snapshot.checks.every((c) => c.state !== "pending");
    if (!settled) {
      entry.settled = undefined;
      return undefined;
    }
    const key = signature(snapshot);
    if (entry.settled?.signature !== key) {
      entry.settled = { signature: key, since: now };
      return undefined;
    }
    // Check registration can lag after a push. Require two stable observations.
    if (now - entry.settled.since < 15_000) return undefined;
    const passed =
      snapshot.checks.some((c) => c.state === "passed") &&
      snapshot.checks.every((c) => c.state === "passed" || c.state === "skipped");
    return {
      kind: passed ? "passed" : "completed",
      summary: `Observed checks settled: ${checkSummary(snapshot)}. This is not merge authorization; additional checks can still be registered.`,
    };
  }
  private async poll(entry: Tracked, setup: boolean): Promise<void> {
    let watch = entry.watch?.status === "watching" ? entry.watch : undefined;
    if (!setup && watch && watch.deadline !== undefined && this.now() >= watch.deadline) {
      this.finish(entry, watch, {
        kind: "timeout",
        summary: `Monitoring deadline reached. Last observation: ${entry.error || (entry.snapshot ? checkSummary(entry.snapshot) : "no checks observed")}.`,
      });
      return;
    }
    const budget =
      !setup && watch?.deadline !== undefined
        ? Math.min(60_000, Math.max(1, watch.deadline - this.now()))
        : 60_000;
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(budget)]);
    try {
      const snapshot = await this.client.snapshot(entry.target, signal);
      if (!this.valid(entry)) return;
      entry.snapshot = snapshot;
      entry.error = undefined;
      entry.failures = 0;
      this.syncAutomatic(entry, snapshot);
      watch = entry.watch?.status === "watching" ? entry.watch : undefined;
      entry.due = this.now() + (entry.watch?.status === "watching" ? 15_000 : 60_000);
      if (!setup && watch && this.valid(entry, watch)) {
        let outcome = this.decision(entry, watch, snapshot);
        if (outcome) {
          if (outcome.kind === "failed") {
            const diagnostics =
              followsHead(watch) && entry.receipt
                ? {
                    ...snapshot,
                    checks: unseenProblems(snapshot, entry.receipt).filter(
                      (c) => c.state === "failed",
                    ),
                  }
                : snapshot;
            outcome.diagnostics = await this.client.diagnostics(diagnostics, signal);
            if (!this.valid(entry, watch)) return;
            // A rerun can supersede a failure while its logs are being fetched.
            const fresh = await this.client.snapshot(entry.target, signal);
            if (!this.valid(entry, watch)) return;
            entry.snapshot = fresh;
            // Unrelated jobs finishing must not starve an unchanged failure.
            if (signature(fresh, true) !== signature(snapshot, true)) {
              entry.settled = undefined;
              entry.due = this.now();
              return;
            }
          }
          if (!this.valid(entry, watch)) return;
          const identity = await this.client.identity(entry.target, signal);
          if (!this.valid(entry, watch)) return;
          if (identity.head !== watch.head && followsHead(watch)) {
            entry.snapshot = undefined;
            entry.due = this.now();
            entry.settled = undefined;
            return;
          }
          if (identity.head !== watch.head)
            outcome = {
              kind: "superseded",
              summary: `Head changed to ${identity.head.slice(0, 7)}. Start a new watch for that commit.`,
            };
          else if (identity.lifecycle !== "open")
            outcome = { kind: identity.lifecycle, summary: `PR ${identity.lifecycle}.` };
          else if (snapshot.attempt && identity.attempt !== snapshot.attempt) {
            entry.due = this.now();
            entry.settled = undefined;
            return;
          }
          if (watch.automatic) {
            // A local branch switch can happen while logs or identity are read.
            // Re-resolve immediately before waking the current conversation.
            await this.discover();
            if (!this.valid(entry, watch)) return;
          }
          this.finish(entry, watch, outcome);
        }
      }
    } catch (error) {
      if (!this.valid(entry)) return;
      entry.error = error instanceof Error ? error.message : String(error);
      entry.failures++;
      entry.settled = undefined;
      entry.due = this.now() + Math.min(120_000, 15_000 * 2 ** Math.min(entry.failures, 3));
      if (!setup && watch && this.valid(entry, watch)) {
        if (watch.deadline !== undefined && this.now() >= watch.deadline)
          this.finish(entry, watch, {
            kind: "timeout",
            summary: `Monitoring deadline reached while GitHub was unavailable. ${entry.error}`,
          });
        else if (
          !signal.aborted &&
          !(error instanceof GitHubError && error.transient) &&
          (!followsHead(watch) || entry.receipt?.error !== fingerprint(entry.error))
        ) {
          if (watch.automatic) await this.discover();
          if (this.valid(entry, watch))
            this.finish(entry, watch, { kind: "error", summary: entry.error });
        }
      }
    } finally {
      this.changed();
    }
  }
  private finish(entry: Tracked, watch: Watch, outcome: Outcome): void {
    if (!this.valid(entry, watch)) return;
    watch.outcome = outcome;
    if (followsHead(watch)) {
      // Restored subscriptions have intent and receipts before their first
      // snapshot. Access errors must stay recoverable even without observations.
      const receipt = (entry.receipt ??= { head: watch.head, problems: {} });
      if (entry.snapshot && (outcome.kind === "failed" || outcome.kind === "blocked")) {
        for (const check of unseenProblems(entry.snapshot, receipt)) {
          if (
            (outcome.kind === "failed" && check.state === "failed") ||
            (outcome.kind === "blocked" && check.state === "blocked")
          )
            receipt.problems[checkKey(check)] = executionKey(check);
        }
      } else if (entry.snapshot && (outcome.kind === "passed" || outcome.kind === "completed"))
        receipt.completed = observationKey(entry.snapshot);
      else if (outcome.kind === "error")
        receipt.error = fingerprint(entry.error || outcome.summary);
      else if (outcome.kind === "closed" || outcome.kind === "merged") watch.status = "ended";
    } else watch.status = "ended";
    this.changed(true);
    this.pending.push({ entry, watch, outcome });
  }
  private deliver(
    results: { entry: Tracked; watch: Watch; outcome: Outcome }[],
    allPassed: boolean,
  ): void {
    try {
      this.hooks.outcomes(
        results.map((r) => ({ watch: { ...r.watch }, outcome: r.outcome })),
        allPassed,
      );
    } catch {
      for (const { entry, watch } of results) {
        watch.status = "paused";
        if (followsHead(watch) && entry.receipt) entry.receipt.paused = true;
        entry.error = "Agent notification could not be delivered. Resume explicitly.";
      }
      this.changed(true);
    }
  }
  private flush(): void {
    const results = this.pending
      .splice(0)
      .filter(
        (r) =>
          !this.disposed &&
          this.entries.get(r.entry.target.url) === r.entry &&
          r.entry.watch === r.watch &&
          ["watching", "ended"].includes(r.watch.status),
      );
    const active = workingEntries(this.entries.values(), this.current).filter(
      (e) =>
        e.watch &&
        e.watch.status !== "cancelled" &&
        e.target.kind === "pr" &&
        e.snapshot?.lifecycle !== "closed" &&
        e.snapshot?.lifecycle !== "merged",
    );
    const key =
      active.length > 1 && active.every((e) => targetState(e, this.now()) === "passed")
        ? fingerprint(
            active
              .map((e) => [e.target.url, observationKey(e.snapshot!)])
              .sort((a, b) => a[0].localeCompare(b[0])),
          )
        : undefined;
    if (!key && this.workingSetCompleted) {
      this.workingSetCompleted = undefined;
      this.changed(true);
    }
    if (!results.length) return;
    const allPassed = !!key && key !== this.workingSetCompleted;
    if (key && allPassed) {
      this.workingSetCompleted = key;
      this.changed(true);
    }
    this.deliver(results, allPassed);
  }
  structuredStatus(urls?: string[]) {
    return {
      automatic: this.autoWatch,
      current: this.current,
      discoveryError: this.discoveryError,
      targets: [...this.entries.values()]
        .filter((e) => !urls || urls.includes(e.target.url))
        .map((e) => structuredTarget(e, this.now(), this.current)),
    };
  }
  status(): string {
    const rows = [...this.entries.values()].map((entry) => {
      const watch = entry.watch;
      const state = targetState(entry, this.now());
      const summary =
        entry.error ||
        (watch?.status === "ended" ? watch.outcome?.summary : undefined) ||
        (entry.snapshot ? checkSummary(entry.snapshot) : "not yet observed");
      return `${label(entry.target)}${watch?.label ? ` · ${watch.label}` : ""} ${watch ? `${watch.status} at ${watch.head.slice(0, 7)}` : "passive"} · ${state}: ${summary.slice(0, 1000)}`;
    });
    return `Automatic current-PR watching: ${this.autoWatch ? "on" : "off"}\n${rows.join("\n") || this.discoveryError || "No PR or CI watches."}`;
  }
}
