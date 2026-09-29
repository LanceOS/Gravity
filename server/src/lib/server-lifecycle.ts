// Process-wide admission state. Shutdown is one-way; a new process starts ready.
let shuttingDown = false;

export function isServerShuttingDown(): boolean {
  return shuttingDown;
}

export function beginServerShutdown(): void {
  shuttingDown = true;
}
