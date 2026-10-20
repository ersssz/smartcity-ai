export type PriorityStopInputs = {
  stopNative: () => Promise<void>;
  stopAudio: () => Promise<void>;
  pending: Promise<void>;
  pause: () => Promise<void>;
};

/** Cancel tracking immediately; a pending operation must settle before durable pause. */
export async function runPriorityStop(inputs: PriorityStopInputs): Promise<{ cleanupFailed: boolean }> {
  const invoke = (cleanup: () => Promise<void>): Promise<void> => {
    try { return Promise.resolve(cleanup()); }
    catch (error) { return Promise.reject(error); }
  };
  const native = invoke(inputs.stopNative);
  const audio = invoke(inputs.stopAudio);
  const cleanup = Promise.allSettled([native, audio]);
  try { await inputs.pending; } catch { /* The operation owns its error; Stop must still pause. */ }
  const results = await cleanup;
  await inputs.pause();
  return { cleanupFailed: results.some(result => result.status === 'rejected') };
}
