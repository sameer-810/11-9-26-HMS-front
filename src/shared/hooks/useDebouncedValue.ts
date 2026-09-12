import { useEffect, useState } from "react";

/**
 * Delays a value until it stops changing.
 *
 * Used on search boxes so a receptionist typing a ten-digit mobile number
 * causes one request rather than ten, each of which would land out of order.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
