import { useCallback, useEffect, useState } from "react";
import type { PushState } from "@/lib/push";
import { getPushState, subscribeToPush, unsubscribeFromPush } from "@/lib/push";

export function usePush() {
  const [state, setState] = useState<PushState>("prompt");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    void getPushState().then(setState);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    try {
      await subscribeToPush();
      await getPushState().then(setState);
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      await unsubscribeFromPush();
      await getPushState().then(setState);
    } finally {
      setLoading(false);
    }
  }, []);

  return { state, loading, subscribe, unsubscribe, refresh };
}
