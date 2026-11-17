// Structural subset of Pi's public terminal API. Pi owns support detection,
// encoding and delivery. No terminal escapes are written by extensions.
export interface ProgramStatus {
  state: "idle" | "working" | "blocked" | "done" | "error" | "clear";
  app?: string;
  kind?: "permission" | "question" | "auth";
  message?: string;
}
export interface StatusTerminal {
  setProgramStatus?: (status: ProgramStatus) => void;
}

// Pi loads extensions with moduleCache disabled. A terminal-owned symbol shares
// the compositor across independently evaluated copies of this module.
const HUB = Symbol.for("toolkit.pi.program-status.v1");
type ComposedTerminal = StatusTerminal & { [HUB]?: StatusHub };
const rank = { blocked: 0, error: 0, working: 1, done: 2, idle: 3, clear: 4 };

class StatusHub {
  readonly sources = new Set<BackgroundTerminalStatus>();
  private native: ProgramStatus;
  private last?: string;
  private readonly original: (status: ProgramStatus) => void;
  readonly wrapper: (status: ProgramStatus) => void;

  readonly terminal: ComposedTerminal;

  constructor(terminal: ComposedTerminal, initial: ProgramStatus) {
    this.terminal = terminal;
    this.native = { ...initial };
    this.original = terminal.setProgramStatus!;
    this.wrapper = (status) => {
      // Preserve wrappers retained by another extension after our final detach.
      if (terminal.setProgramStatus !== this.wrapper || !this.sources.size) {
        this.original.call(terminal, status);
        return;
      }
      this.native = { ...status };
      this.publish();
    };
    terminal.setProgramStatus = this.wrapper;
  }

  agentStarted(message?: string): void {
    this.native = { state: "working", app: "pi", message };
    this.publish();
  }

  publish(): void {
    if (this.terminal.setProgramStatus !== this.wrapper) return;
    const reports = [...this.sources]
      .flatMap((source) => (source.status ? [source.status] : []))
      .sort((a, b) => rank[a.state] - rank[b.state]);
    const nativeOwns = ["working", "blocked", "error", "clear"].includes(this.native.state);
    const status = nativeOwns
      ? this.native
      : [...this.sources].some((source) => source.active)
        ? { state: "working" as const, app: "pi" }
        : reports[0]
          ? { ...reports[0], app: "pi" }
          : this.native;
    const key = JSON.stringify(status);
    if (key === this.last) return;
    this.last = key;
    this.original.call(this.terminal, status);
  }

  remove(source: BackgroundTerminalStatus): void {
    this.sources.delete(source);
    if (this.sources.size) {
      this.publish();
      return;
    }
    if (this.terminal[HUB] === this) delete this.terminal[HUB];
    if (this.terminal.setProgramStatus === this.wrapper) {
      this.terminal.setProgramStatus = this.original;
      this.original.call(this.terminal, this.native);
    }
  }
}

/** One compositor per terminal, with independent lifetime and attention sources.
 * Native work, dialogs and errors win. Resting Pi reflects background attention.
 * The final subscriber restores the original setter and last native report. */
export class BackgroundTerminalStatus {
  private hub?: StatusHub;
  status?: ProgramStatus;
  active = false;

  attach(terminal: StatusTerminal, initial: ProgramStatus): boolean {
    if (this.hub?.terminal === terminal && terminal.setProgramStatus === this.hub.wrapper)
      return true;
    this.detach();
    if (typeof terminal.setProgramStatus !== "function") return false;
    const shared = terminal as ComposedTerminal;
    let hub = shared[HUB];
    if (!hub) {
      hub = new StatusHub(shared, initial);
      shared[HUB] = hub;
    }
    this.hub = hub;
    hub.sources.add(this);
    hub.publish();
    return true;
  }

  updateStatus(status?: ProgramStatus): void {
    this.status = status;
    this.hub?.publish();
  }

  agentStarted(message?: string): void {
    this.active = true;
    this.hub?.agentStarted(message);
  }

  agentQueued(): void {
    this.active = true;
    this.hub?.publish();
  }

  agentSettled(): void {
    this.active = false;
    this.hub?.publish();
  }

  detach(): void {
    this.hub?.remove(this);
    this.hub = undefined;
  }
}
