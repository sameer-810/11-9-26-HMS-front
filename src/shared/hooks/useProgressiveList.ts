import { useState } from "react";

/**
 * Renders a long list a page at a time.
 *
 * The queues and lists this is used on sit inside the screen's ScrollView,
 * where a FlatList cannot virtualise — it would still build every row, inside a
 * scroll view it does not own. At hospital volume those lists reach hundreds of
 * rows (an outstanding-bills list of a thousand, a morning's OPD queue of eight
 * hundred), and building every card before the first one can be read is what
 * makes a ward tablet feel frozen.
 *
 * The server already orders these lists — most urgent first, oldest first — so
 * the rows that matter are the ones on screen, and the rest are one press away.
 */
export function useProgressiveList<T>(rows: readonly T[], pageSize = 50) {
  const [count, setCount] = useState(pageSize);
  return {
    visible: rows.length > count ? rows.slice(0, count) : rows,
    hidden: Math.max(0, rows.length - count),
    pageSize,
    showMore: () => setCount((c) => c + pageSize),
  };
}
