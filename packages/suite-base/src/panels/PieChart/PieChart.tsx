// SPDX-FileCopyrightText: Copyright (C) 2023-2024 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as _ from "lodash-es";
import { useCallback, useEffect, useLayoutEffect, useReducer, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import Logger from "@lichtblick/log";
import { parseMessagePath, MessagePath } from "@lichtblick/message-path";
import { MessageEvent, PanelExtensionContext, SettingsTreeAction } from "@lichtblick/suite";
import { simpleGetMessagePathDataItems } from "@lichtblick/suite-base/components/MessagePathSyntax/simpleGetMessagePathDataItems";
import { turboColorString } from "@lichtblick/suite-base/util/colorUtils";

import { settingsActionReducer, useSettingsTree } from "./settings";
import type { Config } from "./types";

const log = Logger.getLogger(__filename);

type Props = {
  context: PanelExtensionContext;
};

const defaultConfig: Config = {
  path: "",
  minValue: 0,
  maxValue: 1,
  colorMap: "red-yellow-green",
  colorMode: "colormap",
  gradient: ["#0000ff", "#ff00ff"],
  reverse: false,
};

type State = {
  path: string;
  parsedPath: MessagePath | undefined;
  latestMessage: MessageEvent | undefined;
  latestMatchingQueriedData: unknown;
  error: Error | undefined;
  pathParseError: string | undefined;
};

type Action =
  | { type: "frame"; messages: readonly MessageEvent[] }
  | { type: "path"; path: string }
  | { type: "seek" };

// function getSingleDataItem(results: unknown[]) {
//   if (results.length <= 1) {
//     return results[0];
//   }
//   throw new Error("Message path produced multiple results");
// }

function reducer(state: State, action: Action): State {
  // log.info("reducer: New data received", state.latestMatchingQueriedData);
  log.info("reducer2: New data received", state);
  log.info("reducer3: New data received", action);
  try {
    switch (action.type) {
      case "frame": {
        if (state.pathParseError != undefined) {
          return { ...state, latestMessage: _.last(action.messages), error: undefined };
        }
        let latestMatchingQueriedData = state.latestMatchingQueriedData;
        let latestMessage = state.latestMessage;
        if (state.parsedPath) {

          for (const message of action.messages) {
            if (message.topic !== state.parsedPath.topicName) {
              continue;
            }
            log.info("reducer6: New data received", message.receiveTime);


            // const data = getSingleDataItem(
            //   simpleGetMessagePathDataItems(message, state.parsedPath),
            // );
            const data = (message.message as { data: Float32Array }).data;
            log.info("reducer7: New data received", data);

            if (data != undefined) {
              latestMatchingQueriedData = data;
              latestMessage = message;
            }
          }
        }
        return { ...state, latestMessage, latestMatchingQueriedData, error: undefined };
      }
      case "path": {
        const newPath = parseMessagePath(action.path);
        let pathParseError: string | undefined;
        if (
          newPath?.messagePath.some(
            (part) =>
              (part.type === "filter" && typeof part.value === "object") ||
              (part.type === "slice" &&
                (typeof part.start === "object" || typeof part.end === "object")),
          ) === true
        ) {
          pathParseError = "Message paths using variables are not currently supported";
        }
        let latestMatchingQueriedData: unknown;
        let error: Error | undefined;
        try {
          // latestMatchingQueriedData =
          //   newPath && pathParseError == undefined && state.latestMessage
          //     ? getSingleDataItem(simpleGetMessagePathDataItems(state.latestMessage, newPath))
          //     : undefined;
            latestMatchingQueriedData =
              newPath && pathParseError == undefined && state.latestMessage
                ? simpleGetMessagePathDataItems(state.latestMessage, newPath)
                : undefined;
          } catch (err: unknown) {
          error = err as Error;
        }
        return {
          ...state,
          path: action.path,
          parsedPath: newPath,
          latestMatchingQueriedData,
          error,
          pathParseError,
        };
      }
      case "seek":
        return {
          ...state,
          latestMessage: undefined,
          latestMatchingQueriedData: undefined,
          error: undefined,
        };
    }
  } catch (error) {
    return { ...state, latestMatchingQueriedData: undefined, error };
  }
}

function getConicGradient(config: Config, width: number, height: number, pieChartAngle: number) {
  let colorStops: { color: string; location: number }[];
  switch (config.colorMode) {
    case "colormap":
      switch (config.colorMap) {
        case "red-yellow-green":
          colorStops = [
            { color: "#f00", location: 0 },
            { color: "#ff0", location: 0.5 },
            { color: "#0c0", location: 1 },
          ];
          break;
        case "rainbow":
          colorStops = [
            { color: "#f0f", location: 0 },
            { color: "#00f", location: 1 / 5 },
            { color: "#0ff", location: 2 / 5 },
            { color: "#0f0", location: 3 / 5 },
            { color: "#ff0", location: 4 / 5 },
            { color: "#f00", location: 5 / 5 },
          ];
          break;
        case "turbo": {
          const numStops = 20;
          colorStops = new Array(numStops).fill(undefined).map((_x, i) => ({
            color: turboColorString(i / (numStops - 1)),
            location: i / (numStops - 1),
          }));
          break;
        }
      }
      break;
    case "gradient":
      colorStops = [
        { color: config.gradient[0], location: 0 },
        { color: config.gradient[1], location: 1 },
      ];
      break;
  }
  if (config.reverse) {
    colorStops = colorStops
      .map((stop) => ({ color: stop.color, location: 1 - stop.location }))
      .reverse();
  }

  return `conic-gradient(from ${-Math.PI / 2 + pieChartAngle}rad at 50% ${
    100 * (width / 2 / height)
  }%, ${colorStops
    .map((stop) => `${stop.color} ${stop.location * 2 * (Math.PI / 2 - pieChartAngle)}rad`)
    .join(",")}, ${colorStops[0]!.color})`;
}

export function PieChart({ context }: Props): React.JSX.Element {
  // panel extensions must notify when they've completed rendering
  // onRender will setRenderDone to a done callback which we can invoke after we've rendered
  const [renderDone, setRenderDone] = useState<() => void>(() => () => {});

  const [config, setConfig] = useState(() => ({
    ...defaultConfig,
    ...(context.initialState as Partial<Config>),
  }));

  const [state, dispatch] = useReducer(
    reducer,
    config,
    ({ path }): State => ({
      path,
      parsedPath: parseMessagePath(path),
      latestMessage: undefined,
      latestMatchingQueriedData: undefined,
      pathParseError: undefined,
      error: undefined,
    }),
  );

  useLayoutEffect(() => {
    dispatch({ type: "path", path: config.path });
  }, [config.path]);

  useEffect(() => {
    context.saveState(config);
    context.setDefaultPanelTitle(config.path === "" ? undefined : config.path);
  }, [config, context]);

  useEffect(() => {
    context.onRender = (renderState, done) => {
      setRenderDone(() => done);

      if (renderState.didSeek === true) {
        dispatch({ type: "seek" });
      }

      if (renderState.currentFrame) {
        dispatch({ type: "frame", messages: renderState.currentFrame });
      }
    };
    context.watch("currentFrame");
    context.watch("didSeek");

    return () => {
      context.onRender = undefined;
    };
  }, [context]);

  const settingsActionHandler = useCallback(
    (action: SettingsTreeAction) => {
      setConfig((prevConfig) => settingsActionReducer(prevConfig, action));
    },
    [setConfig],
  );

  const settingsTree = useSettingsTree(config, state.pathParseError, state.error?.message);
  useEffect(() => {
    context.updatePanelSettingsEditor({
      actionHandler: settingsActionHandler,
      nodes: settingsTree,
    });
  }, [context, settingsActionHandler, settingsTree]);

  useEffect(() => {
    if (state.parsedPath?.topicName != undefined) {
      context.subscribe([{ topic: state.parsedPath.topicName, preload: false }]);
    }
    return () => {
      context.unsubscribeAll();
    };
  }, [context, state.parsedPath?.topicName]);

  // Indicate render is complete - the effect runs after the dom is updated
  useEffect(() => {
    renderDone();
  }, [renderDone]);
  log.info("reducer10: New data received", state.latestMatchingQueriedData);

  const rawValue =
    state.latestMatchingQueriedData instanceof Float32Array
      ? state.latestMatchingQueriedData
      : [];


  log.info("reducer11: New data received", rawValue);





  const padding = 0.1;
  const centerX = 0.5 + padding;
  const centerY = 0.5 + padding;
  const pieChartAngle = -Math.PI / 8;
  const radius = 0.5;
  const innerRadius = 0.4;
  const width = 1 + 2 * padding;
  const height =
    Math.max(
      centerY - radius * Math.sin(pieChartAngle),
      centerY - innerRadius * Math.sin(pieChartAngle),
    ) + padding;
  const [clipPathId] = useState(() => `pieChart-clip-path-${uuidv4()}`);

  // rawValueが空でない場合のみ計算
  if (rawValue.length > 0) {
    // 全ての値の合計を計算
    const total = (rawValue as number[]).reduce((sum: number, value: number) => sum + value, 0);

    const percentages = Array.from(rawValue).map((value: number) => (value / total) * 100);

    const colorStops = percentages.map((percentage: number, index: number) => {
      const color = turboColorString(index / (percentages.length - 1));
      return { color, percentage };
    });

    // 円グラフの色を適用するために、conic-gradientを変更
    const getConicGradientWithData = () => {
      let angleStart = -Math.PI / 2;
      return `conic-gradient(${colorStops
        .map(({ color, percentage }) => {
          const angleEnd = angleStart + (percentage / 100) * (2 * Math.PI);
          const segment = `${color} ${angleStart}rad ${angleEnd}rad`;
          angleStart = angleEnd;
          return segment;
        })
        .join(",")}`;
    };

    // グラフに適用するための関数を呼び出し
    const conicGradient = getConicGradientWithData();

    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          overflow: "hidden",
          padding: 8,
        }}
      >
        <div style={{ width: "100%", overflow: "hidden" }}>
          <div
            style={{
              position: "relative",
              maxWidth: "100%",
              maxHeight: "100%",
              aspectRatio: `${width} / ${height}`,
              margin: "0 auto",
              transform: "scale(1)", // Work around a Safari bug: https://bugs.webkit.org/show_bug.cgi?id=231849
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: conicGradient,
                clipPath: `url(#${clipPathId})`,
                opacity: state.latestMatchingQueriedData == undefined ? 0.5 : 1,
              }}
            />
          </div>
          <svg style={{ position: "absolute" }}>
            <clipPath id={clipPathId} clipPathUnits="objectBoundingBox">
              <path
                transform={`scale(${1 / width}, ${1 / height})`}
                d={[
                  `M ${centerX - radius * Math.cos(pieChartAngle)},${
                    centerY - radius * Math.sin(pieChartAngle)
                  }`,
                  `A 0.5,0.5 0 ${pieChartAngle < 0 ? 1 : 0} 1 ${
                    centerX + radius * Math.cos(pieChartAngle)
                  },${centerY - radius * Math.sin(pieChartAngle)}`,
                  `L ${centerX + innerRadius * Math.cos(pieChartAngle)},${
                    centerY - innerRadius * Math.sin(pieChartAngle)
                  }`,
                  `A ${innerRadius},${innerRadius} 0 ${pieChartAngle < 0 ? 1 : 0} 0 ${
                    centerX - innerRadius * Math.cos(pieChartAngle)
                  },${centerY - innerRadius * Math.sin(pieChartAngle)}`,
                  `Z`,
                ].join(" ")}
              />
            </clipPath>
          </svg>
        </div>
      </div>
    );
  } else {
    return <div>No data available</div>;
  }

}
