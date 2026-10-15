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
  private pendingRevision = 0;

  constructor(options: LocalWorkspaceOverwriteOptions) {
    this.saveLocal = options.saveLocal;
    this.onStateChange = options.onStateChange;
  }

  getState(): LocalWorkspaceOverwriteState {
    return { ...this.state };
  }

  /** Hydration adopts an existing persisted version without writing it again. */
  restoreSaved(savedAt: string): void {
    if (this.active || this.queued || this.state.status === "saving") {
      // The write owns an older snapshot. Adopting another workspace must not
      // announce its contents as saved before that newer version has been written.
      this.markPending();
      return;
    }
    this.update({ status: "saved", savedAt });
  }

  markPending(): void {
    this.pendingRevision += 1;
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
      const savingRevision = this.pendingRevision;
      this.update({ status: "saving" });
      try {
        await this.saveLocal(current);
        // An edit during this write is newer than its snapshot. A queued overwrite
        // will catch up in the next iteration; otherwise keep the editor pending.
        const hasNewerVersion = this.queued || this.pendingRevision !== savingRevision;
        this.update({ status: hasNewerVersion ? "pending" : "saved", savedAt: current.exportedAt });
      } catch (reason) {
        console.error("Failed to persist workspace", reason);
        this.update({ status: "failed" });
      }
    }
  }
}
