export class MimoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MimoError";
  }

  get retryable(): boolean {
    return this.status === 429 || (this.status !== undefined && this.status >= 500);
  }
}
