// Lets utils/api.ts (outside React) notify AuthContext (inside React) when a
// request comes back 401, without importing React context machinery into a plain module.
type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

export const setUnauthorizedHandler = (fn: UnauthorizedHandler | null) => {
  handler = fn;
};

export const notifyUnauthorized = () => {
  handler?.();
};
