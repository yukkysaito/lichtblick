// SPDX-FileCopyrightText: Copyright (C) 2023-2024 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import Chart from "chart.js/auto";
import * as _ from "lodash-es";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import Logger from "@lichtblick/log";
import { parseMessagePath, MessagePath } from "@lichtblick/message-path";
import { MessageEvent, PanelExtensionContext, SettingsTreeAction } from "@lichtblick/suite";
import { simpleGetMessagePathDataItems } from "@lichtblick/suite-base/components/MessagePathSyntax/simpleGetMessagePathDataItems";
// import { turboColorString } from "@lichtblick/suite-base/util/colorUtils";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef(null);

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
  // ------------------------------------------------------------

  useEffect(() => {
    if (!canvasRef.current || rawValue.length === 0) {return;}

    // 既存のチャートを破棄
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const total = Array.from(rawValue).reduce((sum, value) => sum + value, 0);
    const percentages = Array.from(rawValue).map((value) => (value / total) * 100);

    log.info("reducer12: New data received", percentages.length);

    chartRef.current = new Chart(canvasRef.current, {
      type: "pie",
      data: {
        labels: Array.from(rawValue).map((_, index) => `Data ${index + 1}`),
        datasets: [
          {
            data: percentages,
            backgroundColor: percentages.map((_, index) =>
              `rgb(${(index / (percentages.length)) * 255},
                   ${(index / (percentages.length)) * 255},
                   ${(index / (percentages.length)) * 255})`,
            ),
          },
        ],
      },
    });
  }, [rawValue]);

  if (rawValue.length === 0) {
    return <div>No data available</div>;
  }

  return (
    <div>
      <h1>Pie Chart</h1>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}


// ------------------------------------------------------------

  // // データが空でないかチェック
  // if (rawValue.length > 0) {
  //   const total = Array.from(rawValue).reduce((sum, value) => sum + value, 0);
  //   const percentages = Array.from(rawValue).map((value) => (value / total) * 100);

    // log.info("reducer12: New data received", percentages.length);

    // // 色マッピングの準備（白と黒のみ）
    // const colorStops = percentages.map((percentage, index) => {
    //   let color: string;

    //   // 配列サイズが1の場合は、単一の色（例えば白）を使用
    //   if (percentages.length === 1) {
    //     color = "rgb(255, 255, 255)"; // 白
    //   } else {
    //     // インデックスに基づいて白から黒へのグラデーションを作成
    //     color = `rgb(${(index / (percentages.length - 1)) * 255}, ${(index / (percentages.length - 1)) * 255}, ${(index / (percentages.length - 1)) * 255})`;
    //     // log.info("reducer13: New data received", color);
    //     // log.info("reducer14: New data received", index);
    //   }
    //   log.info("reducer15: color", color);
    //   log.info("reducer16: percentage", percentage);

    //   return `${color} ${percentage}%`;
    // });

    // // 円グラフの色付け
    // const conicGradient = `conic-gradient(${colorStops.join(", ")})`;

    // return (
    //   <div
    //     style={{
    //       display: "flex",
    //       justifyContent: "center",
    //       alignItems: "center",
    //       width: "100%",
    //       height: "100%",
    //       position: "relative",
    //     }}
    //   >
    //     <div
    //       style={{
    //         width: "200px",
    //         height: "200px",
    //         borderRadius: "50%",
    //         background: conicGradient,
    //       }}
    //     />
    //   </div>
    // );

//   } else {
//     // データがない場合のフォールバック
//     return <div>No data available</div>;
//   }
// }
