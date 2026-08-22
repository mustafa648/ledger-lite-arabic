import { useEffect, useState } from "react";
import { pendingCount, syncQueue } from "@/lib/offline-queue";

export function useOnline() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = () => setPending(pendingCount());
    const up = async () => {
      setOnline(true);
      await syncQueue();
      refresh();
    };
    const down = () => setOnline(false);

    setOnline(navigator.onLine);
    refresh();
    void syncQueue().then(refresh);

    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener("sanad:queue-changed", refresh);
    const t = window.setInterval(() => {
      if (navigator.onLine) void syncQueue().then(refresh);
    }, 30000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.removeEventListener("sanad:queue-changed", refresh);
      window.clearInterval(t);
    };
  }, []);

  return { online, pending };
}
