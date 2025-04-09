// SPDX-FileCopyrightText: Copyright (C) 2025 Takayuki Honda <takayuki.honda@tier4.jp>
// SPDX-License-Identifier: MPL-2.0

import { useEffect, useState } from "react";
import { getLegendCount, setLegendCount, subscribeLegendCount } from "./legendCountStore";

export function useLegendCount(chartType: string) {
  const [count, setCount] = useState(getLegendCount(chartType));

  useEffect(() => {
    const unsubscribe = subscribeLegendCount(chartType, setCount);
    return unsubscribe;
  }, [chartType]);

  return {
    legendCount: count,
    setLegendCount: (newCount: number) => setLegendCount(chartType, newCount),
    increment: () => setLegendCount(chartType, getLegendCount(chartType) + 1),
    decrement: () => setLegendCount(chartType, Math.max(1, getLegendCount(chartType) - 1)),
  };
}
