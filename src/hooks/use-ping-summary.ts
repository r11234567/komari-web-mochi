import { useEffect, useState } from "react";
import { requestPingSummary, type PingSummaryItem } from "@/api/pingSummary";

type PingSummary = {
  items: PingSummaryItem[];
  loading: boolean;
};

const emptySummary: PingSummary = {
  items: [],
  loading: true,
};

const idleSummary: PingSummary = {
  items: [],
  loading: false,
};

/**
 * Probe summary for one node.
 *
 * Every card asking within the same frame is answered by one batched query
 * (see `requestPingSummary`), and the underlying query itself is shared and
 * cached, so remounting a card costs nothing until the window moves on.
 */
export function usePingSummary(uuid?: string, hours = 1) {
  const [summary, setSummary] = useState<PingSummary>(emptySummary);

  useEffect(() => {
    if (!uuid) {
      setSummary(idleSummary);
      return;
    }

    let active = true;
    setSummary((prev) => (prev.loading ? prev : { ...prev, loading: true }));

    requestPingSummary(uuid, hours).then(
      (items) => {
        if (active) setSummary({ items, loading: false });
      },
      () => {
        if (active) setSummary(idleSummary);
      },
    );

    return () => {
      active = false;
    };
  }, [uuid, hours]);

  return summary;
}
