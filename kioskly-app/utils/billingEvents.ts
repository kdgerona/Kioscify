// Lets utils/api.ts (outside React) tell BillingContext that the API answered
// SUBSCRIPTION_LOCKED, mirroring utils/authEvents.ts.
type LockedHandler = () => void;

let handler: LockedHandler | null = null;

export const setBillingLockedHandler = (fn: LockedHandler | null) => {
  handler = fn;
};

export const notifyBillingLocked = () => {
  handler?.();
};
