import { useEffect, useRef } from "react";

/**
 * True while the component is mounted. Mutation hooks read it in their own callbacks:
 * a result that arrives after the page is gone goes to the global toaster, otherwise
 * the page shows it (never both). Set in the effect, so StrictMode's remount keeps it right.
 */
export function useMountedRef() {
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return mounted;
}
