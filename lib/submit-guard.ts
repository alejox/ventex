/** Synchronous acquisition prevents duplicate submits before React rerenders. */
export function createSubmitGuard() {
  let busy = false;
  return {
    acquire() {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() { busy = false; },
  };
}
