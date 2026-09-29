// Process-wide admission state. Initialization fails closed; shutdown is one-way.
let shuttingDown = false;

export function isServerShuttingDown(): boolean {
  return shuttingDown;
}

export function beginServerShutdown(): void {
  shuttingDown = true;
}

let initialized = false;
export function isServerInitialized(): boolean { return initialized; }
export function beginServerInitialization(): void { initialized = false; }
export function completeServerInitialization(): void { initialized = true; }
