import Reactotron from "../ReactotronConfig";

/**
 * Safe wrapper for Reactotron methods that only executes in development
 */
export const safeReactotron = {
  display: (config: { name: string; value: any; preview?: string }) => {
    if (__DEV__ && Reactotron.display) {
      Reactotron.display(config);
    }
  },
  log: (...args: any[]) => {
    if (__DEV__ && Reactotron.log) {
      Reactotron.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (__DEV__ && Reactotron.warn) {
      Reactotron.warn(...args);
    }
  },
  error: (...args: any[]) => {
    if (__DEV__ && Reactotron.error) {
      Reactotron.error(...args);
    }
  },
};
