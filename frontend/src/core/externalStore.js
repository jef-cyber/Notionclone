/* Tiny framework-agnostic external store used by UI queues. */
export function createStore(initial) {
  let value = initial;
  const listeners = new Set();
  const get = () => value;
  const set = (next) => {
    value = next;
    listeners.forEach((fn) => fn());
  };
  const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  return { get, set, subscribe };
}
