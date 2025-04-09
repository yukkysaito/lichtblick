// SPDX-FileCopyrightText: Copyright (C) 2025 Takayuki Honda <takayuki.honda@tier4.jp>

// SPDX-License-Identifier: MPL-2.0

type LegendCountMap = {
  [chartType: string]: number;
};

let legendCounts: LegendCountMap = {
  pie: 10,
  bar: 10,
};

const listeners: ((chartType: string, count: number) => void)[] = [];

export function getLegendCount(chartType: string): number {
  return legendCounts[chartType] ?? 10;
}

export function setLegendCount(chartType: string, count: number): void {
  legendCounts[chartType] = count;
  listeners.forEach((listener) => listener(chartType, count));
}

export function subscribeLegendCount(chartType: string, cb: (count: number) => void): () => void {
  const listener = (type: string, count: number) => {
    if (type === chartType) cb(count);
  };
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}
