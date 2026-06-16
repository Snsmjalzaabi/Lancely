/**
 * Stable client-side keys for editable line items.
 * Backend line items don't carry an id, so we attach one client-side
 * to give React a stable key (prevents focus/state issues on reorder/remove).
 */
let counter = 0;
export function makeItemKey() {
  counter += 1;
  return `item-${Date.now().toString(36)}-${counter}`;
}

export function withKey(item) {
  return { _key: makeItemKey(), ...item };
}

export function withKeys(items) {
  return (items || []).map((it) => ({ _key: makeItemKey(), ...it }));
}
