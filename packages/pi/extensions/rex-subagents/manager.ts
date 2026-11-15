import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clampThinkingLevel, getSupportedThinkingLevels } from "@earendil-works/pi-ai/models";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { piCommand } from "../delegate/index.ts";
import { identity, placement, view, type RexCall, type RexIdentity, type RexView } from "./rex.ts";
import { requestChild, type ChildRequest } from "./transport.ts";
import {
  CHILD_ENV,
  NAME,
  configurations,
  key,
  optionalJSON,
  parseConfig,
  privateDirectory,
  record,
  reports,
  saveJSON,
  validateText,
  type ChildConfig,
  type ChildStatus,
  type Launch,
} from "./storage.ts";

export interface SpawnOptions {
  model?: string;
  effort?: ModelThinkingLevel;
  defaultEffort?: ModelThinkingLevel;
}

export interface Origin {
  server: string;
  session: string;
  block: string;
}

export interface ChildSummary {
  name: string;
  file: string;
  config: ChildConfig;
  launch: Launch;
  placement: string;
  status?: ChildStatus;
  warning?: string;
}

/** All state is scoped to one saved parent conversation and one Rex instance. */
export class SubagentManager {
  readonly call: RexCall;
  readonly origin: Origin;
  readonly parent: string;
  readonly base: string;
  root = "";
  private host: RexIdentity | undefined;
  constructor(call: RexCall, origin: Origin, parent: string, base?: string) {
    this.call = call;
    this.origin = origin;
    this.parent = parent;
    this.base =
      base ||
      join(
        process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
        "toolkit",
        "rex-subagents",
      );
  }

  async initialize(): Promise<void> {
    const host = await identity(this.call);
    if (this.host && host.instance !== this.host.instance)
      throw new Error("Rex server restarted. Reload Pi before managing subagents.");
    this.host = host;
    this.root = join(
      this.base,
      key(JSON.stringify([host.instance, this.origin.session, this.parent])),
    );
    await privateDirectory(this.root);
  }

  private async current(): Promise<RexView> {
    await this.initialize();
    return view(this.call, this.origin.session);
  }

  private async launch(file: string): Promise<Launch> {
    const value = await optionalJSON(join(dirname(file), "launch.json"));
    if (
      !record(value) ||
      typeof value.label !== "string" ||
      !["creating", "launched", "uncertain"].includes(String(value.state)) ||
      (value.block !== undefined && typeof value.block !== "string")
    )
      throw new Error("Invalid subagent launch record");
    return value as unknown as Launch;
  }

  async list(): Promise<ChildSummary[]> {
    const current = await this.current();
    const inventory = await this.call("session.list_blocks", { session_id: this.origin.session });
    if (!record(inventory) || !Array.isArray(inventory.blocks))
      throw new Error("Rex block inventory was incomplete");
    const present = new Set(inventory.blocks.filter(record).map((block) => block.block_id));
    const summaries: ChildSummary[] = [];
    for (const { file, config } of await configurations(this.root)) {
      if (
        config.parent !== this.parent ||
        config.serverInstance !== this.host!.instance ||
        config.rexSession !== this.origin.session ||
        config.server !== this.origin.server
      ) {
        throw new Error("Subagent registry does not match this parent and Rex server");
      }
      const launch = await this.launch(file);
      if (!launch.block) {
        // Only the opaque creation label can recover a lost creation response.
        // Never infer ownership from a human-facing pane name or re-hide a pane.
        const matches = current.windows
          .flatMap((window) => window.layers.flatMap((layer) => layer.blocks))
          .filter((block) => block.label === launch.label);
        if (matches.length === 1 && matches[0]!.host_id === this.host!.host) {
          launch.block = matches[0]!.block_id;
          launch.state = "launched";
          await saveJSON(join(dirname(file), "launch.json"), launch);
        }
      }
      const where = launch.block ? placement(current, launch.block) : undefined;
      const summary: ChildSummary = {
        name: config.name,
        file,
        config,
        launch,
        placement: !launch.block
          ? "uncertain"
          : !present.has(launch.block)
            ? "closed"
            : where?.layer.kind || "detached",
      };
      if (summary.placement !== "closed") {
        try {
          const status = await requestChild(config, {
            child: config.id,
            session: config.session,
            op: "status",
            id: randomUUID(),
          });
          if (
            !record(status) ||
            status.child !== config.id ||
            typeof status.session !== "string" ||
            typeof status.state !== "string" ||
            status.block !== launch.block
          ) {
            throw new Error("Child identity or placement is not confirmed");
          }
          summary.status = status as unknown as ChildStatus;
        } catch (error) {
          summary.warning = String(error);
        }
      }
      summaries.push(summary);
    }
    return summaries;
  }

  async find(name: string): Promise<ChildSummary> {
    if (!NAME.test(name)) throw new Error("Invalid subagent name");
    const summary = (await this.list()).find((child) => child.name === name);
    if (!summary) throw new Error(`No subagent named ${name} belongs to this conversation`);
    return summary;
  }

  async spawn(
    request: string,
    name: string,
    text: string,
    cwd: string,
    ctx: ExtensionContext,
    options: SpawnOptions = {},
    signal?: AbortSignal,
  ): Promise<ChildSummary> {
    if (!NAME.test(name))
      throw new Error("Use a lowercase subagent name containing letters, digits and hyphens");
    validateText(text);
    let model = ctx.model;
    if (options.model !== undefined) {
      const slash = options.model.indexOf("/");
      if (slash <= 0 || slash === options.model.length - 1)
        throw new Error("Use an exact provider/model-id for the subagent model");
      model = ctx.modelRegistry.find(options.model.slice(0, slash), options.model.slice(slash + 1));
      if (!model) throw new Error(`Unknown subagent model: ${options.model}`);
    }
    if (!model) throw new Error("Select a model before spawning a subagent");
    const modelId = `${model.provider}/${model.id}`;
    if (options.effort !== undefined && !getSupportedThinkingLevels(model).includes(options.effort))
      throw new Error(`Model ${modelId} does not support effort ${options.effort}`);
    const effort =
      options.effort ??
      clampThinkingLevel(model, options.defaultEffort ?? ctx.thinkingLevel ?? "off");
    cwd = resolve(ctx.cwd, cwd);
    if (!(await stat(cwd)).isDirectory())
      throw new Error("Child cwd must be an existing directory");
    const current = await this.current();
    const source = placement(current, this.origin.block);
    if (!source || source.block.host_id !== this.host!.host)
      throw new Error("Calling pane must be on the local Rex server's host");
    const folder = join(this.root, name);
    const file = join(folder, "config.json");
    const existing = await optionalJSON(file);
    if (existing !== undefined) {
      const config = parseConfig(existing);
      if (
        config.request === key(request) &&
        config.initial.text === text &&
        config.cwd === cwd &&
        (options.model === undefined || config.model === modelId) &&
        (options.effort === undefined || config.effort === effort)
      )
        return this.find(name);
      throw new Error(
        `Name ${name} is already reserved. Inspect it; do not retry an uncertain launch under another name.`,
      );
    }
    const children = await this.list();
    if (children.filter((child) => child.placement !== "closed").length >= 4)
      throw new Error(
        "This parent already owns four open or uncertain children. Close a finished child in Rex before spawning another.",
      );
    signal?.throwIfAborted();
    // An exclusive directory reserves the name even if later creation is uncertain.
    await mkdir(folder, { mode: 0o700 });
    await privateDirectory(join(folder, "results"));
    await privateDirectory(join(folder, "receipts"));
    await privateDirectory(join(folder, "parent-requests"));
    const socketDirectory = await mkdtemp(join(tmpdir(), "pi-rex-"));
    await privateDirectory(socketDirectory);
    const config: ChildConfig = {
      version: 1,
      id: randomUUID(),
      name,
      parent: this.parent,
      session: randomUUID(),
      server: this.origin.server,
      serverInstance: this.host!.instance,
      rexSession: this.origin.session,
      socketDirectory,
      cwd,
      model: modelId,
      effort,
      initial: { id: randomUUID(), text },
      request: key(request),
    };
    await saveJSON(file, config);
    const launch: Launch = { label: `pi-subagent-${config.id}`, state: "creating" };
    await saveJSON(join(folder, "launch.json"), launch);
    const command = [
      "env",
      `${CHILD_ENV}=${file}`,
      "PI_PROGRAM_STATUS=0",
      ...piCommand(process.execPath, process.argv),
      "--extension",
      fileURLToPath(new URL("./child.ts", import.meta.url)),
      "--no-mcp",
      "--session-dir",
      join(this.root, "sessions"),
      "--session-id",
      config.session,
      "--name",
      name,
      "--model",
      modelId,
      "--thinking",
      effort,
      "--append-system-prompt",
      "You are a delegated Pi subagent. Carry out the bounded assignment. Your final answer is sent to the parent automatically. Do not start other agents. Report blockers and unverified claims explicitly. Shared files are not isolated; edit only the files assigned to you.",
      "--",
      text,
    ];
    try {
      const created = await this.call(
        "session.new_layer",
        {
          session_id: this.origin.session,
          window_id: source.window.window_id,
          bounds: [0.1, 0.12, 0.8, 0.76],
          focus: false,
          layout: {
            block: {
              flavor: "com.superlogical.terminal.shell",
              label: launch.label,
              options: {
                cwd,
                shell: "none",
                login: false,
                command,
                exit: { on_completion: false },
              },
            },
          },
        },
        signal,
      );
      if (
        !record(created) ||
        !Array.isArray(created.block_ids) ||
        typeof created.block_ids[0] !== "string" ||
        typeof created.layer_id !== "string"
      ) {
        throw new Error("Rex did not return the new child block and layer");
      }
      launch.block = created.block_ids[0];
      launch.state = "launched";
      await saveJSON(join(folder, "launch.json"), launch);
      await this.call(
        "session.set_layer_state",
        { session_id: this.origin.session, layer_id: created.layer_id, state: "minimized" },
        signal,
      );
      await this.call(
        "session.set_block_label",
        { session_id: this.origin.session, block_id: launch.block, label: name },
        signal,
      );
    } catch (error) {
      launch.state = "uncertain";
      await saveJSON(join(folder, "launch.json"), launch);
      throw new Error(
        `Launch outcome is uncertain. Use list and inspect Rex before retrying. Registry: ${file}. ${String(error)}`,
      );
    }
    return { name, file, config, launch, placement: "floating" };
  }

  async send(
    request: string,
    name: string,
    text: string,
    delivery: "followUp" | "steer",
  ): Promise<unknown> {
    validateText(text);
    const child = await this.find(name);
    if (
      !child.status ||
      child.status.session !== child.config.session ||
      child.placement === "closed"
    )
      throw new Error("Child identity is not confirmed. Inspect it before delivery.");
    const path = join(dirname(child.file), "parent-requests", `${key(request)}.json`);
    const fingerprint = key(JSON.stringify([text, delivery]));
    const prior = await optionalJSON(path);
    if (prior !== undefined) {
      if (!record(prior) || prior.fingerprint !== fingerprint)
        throw new Error("Request ID was reused with different input");
      if (prior.state !== "accepted")
        throw new Error(
          "Previous delivery is uncertain. Inspect the child and saved reports; it was not resubmitted.",
        );
      return prior.reply;
    }
    const input: ChildRequest = {
      child: child.config.id,
      session: child.config.session,
      op: "send",
      id: key(request),
      task: { id: randomUUID(), text },
      delivery,
    };
    await saveJSON(path, { fingerprint, state: "submitting", input });
    const reply = await requestChild(child.config, input);
    await saveJSON(path, { fingerprint, state: "accepted", input, reply });
    return reply;
  }

  async cancel(name: string): Promise<unknown> {
    const child = await this.find(name);
    if (!child.status || child.status.session !== child.config.session)
      throw new Error("Child identity is not confirmed");
    return requestChild(child.config, {
      child: child.config.id,
      session: child.config.session,
      op: "cancel",
      id: randomUUID(),
    });
  }

  async open(name: string): Promise<void> {
    const child = await this.find(name);
    if (!child.launch.block) throw new Error("Child placement is not confirmed");
    const where = placement(await this.current(), child.launch.block);
    if (!where) throw new Error("Child is closed or detached");
    await this.call(
      where.layer.kind === "floating" ? "session.set_layer_state" : "session.focus_block",
      where.layer.kind === "floating"
        ? {
            session_id: this.origin.session,
            layer_id: where.layer.layer_id,
            state: "normal",
            focus: true,
          }
        : { session_id: this.origin.session, block_id: child.launch.block },
    );
  }

  async completed() {
    if (!this.root) return [];
    const result = [];
    for (const { file, config } of await configurations(this.root)) {
      if (config.parent !== this.parent || config.serverInstance !== this.host?.instance)
        throw new Error("Subagent result owner changed");
      result.push(...(await reports(file, config)));
    }
    return result;
  }
}
