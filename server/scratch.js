// Scratch/debug utility removed from the production server tree.
// If this behavior is still needed for local experimentation, move it to a
// documented development-only script outside production code paths.
export async function runScratchRequest() {
  throw new Error('runScratchRequest has been removed from production code.');
}
