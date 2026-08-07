import type { ProjectPackage } from "./project-package";

export type LocalOverwriteStatus = "idle" | "pending" | "saving" | "saved" | "failed";

export interface LocalWorkspaceOverwriteState {
  status: LocalOverwriteStatus;
  savedAt: string | null;
}

interface LocalWorkspaceOverwriteOptions {
  saveLocal(pack: ProjectPackage): Promise<void>;
  onStateChange?(state: LocalWorkspaceOverwriteState): void;
}

const INITIAL_STATE: LocalWorkspaceOverwriteState = {
  status: "idle",
  savedAt: null,
};

export class LocalWorkspaceOverwrite {
  private readonly saveLocal: LocalWorkspaceOverwriteOptions["saveLocal"];
  private readonly onStateChange?: LocalWorkspaceOverwriteOptions["onStateChange"];
  private state: LocalWorkspaceOverwriteState = { ...INITIAL_STATE };
  private queued: ProjectPackage | null = null;
  private active: Promise<void> | null = null;

  constructor(options: LocalWorkspaceOverwriteOptions) {
    this.saveLocal = options.saveLocal;
    this.onStateChange = options.onStateChange;
  }

  getState(): LocalWorkspaceOverwriteState {
    return { ...this.state };
  }

  markPending(): void {
    if (this.state.status !== "saving") this.update({ status: "pending" });
  }

  overwrite(pack: ProjectPackage): Promise<void> {
    this.queued = pack;
    if (!this.active) {
      this.active = this.drain().finally(() => {
        this.active = null;
      });
    }
    return this.active;
  }

  private update(patch: Partial<LocalWorkspaceOverwriteState>): void {
    this.state = { ...this.state, ...patch };
    this.onStateChange?.(this.getState());
  }

  private async drain(): Promise<void> {
    while (this.queued) {
      const current = this.queued;
      this.queued = null;
      this.update({ status: "saving" });
      try {
        await this.saveLocal(current);
        this.update({ status: this.queued ? "pending" : "saved", savedAt: current.exportedAt });
      } catch (reason) {
        console.error("Failed to persist workspace", reason);
        this.update({ status: "failed" });
      }
    }
  }
}