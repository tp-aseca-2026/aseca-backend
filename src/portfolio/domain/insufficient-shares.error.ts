export class InsufficientSharesError extends Error {
  constructor() {
    super('Cannot sell more shares than currently owned');
    this.name = 'InsufficientSharesError';
  }
}
