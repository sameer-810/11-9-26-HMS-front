import { useState } from "react";

/**
 * renders a long list a page at a time. these lists sit inside a ScrollView,
 * where a FlatList cannot virtualise and would build every row up front.
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
