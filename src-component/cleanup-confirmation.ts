export type CleanupTarget = Readonly<{ projectId: string; title: string; kind: 'media' | 'dubbing' }>;

/** One explicit request, bound to the project shown in the confirmation. */
export class CleanupConfirmation {
  target: CleanupTarget | null = null;
  pending = false;

  open(target: CleanupTarget): void {
    if (!this.pending) this.target = Object.freeze({ ...target });
  }

  cancel(): void {
    if (!this.pending) this.target = null;
  }

  async confirm(clear: (target: CleanupTarget) => Promise<void>): Promise<void> {
    const target = this.target;
    if (!target || this.pending) return;
    this.pending = true;
    try { await clear(target); this.target = null; }
    finally { this.pending = false; }
  }
}
