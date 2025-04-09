// SPDX-FileCopyrightText: Copyright (C) 2024-2025 Yukihiro Saito <yukky.saito@gmail.com>
// SPDX-FileCopyrightText: Copyright (C) 2025 Takayuki Honda <takayuki.honda@tier4.jp>
// SPDX-License-Identifier: MPL-2.0

import * as _ from "lodash-es";
import { useCallback, useEffect, useLayoutEffect, useReducer, useState, useMemo } from "react";
import { BarChart as RechartsBarChart, Bar, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { parseMessagePath } from "@lichtblick/message-path";
import { PanelExtensionContext, SettingsTreeAction } from "@lichtblick/suite";
import { simpleGetMessagePathDataItems } from "@lichtblick/suite-base/components/MessagePathSyntax/simpleGetMessagePathDataItems";
import { useLegendCount } from "@lichtblick/suite-base/components/SettingsTreeEditor/useLegendCount";

import { settingsActionReducer, useSettingsTree } from "./settings";
import type { Config, State, Action } from "./types";
import { useChartData } from "../PieChart/useChartData";


type Props = {
  context: PanelExtensionContext;
};

const defaultConfig: Config = {
  path: "",
  title: "Bar Chart",
  legend1: "Legend 1",
  legend2: "Legend 2",
  legend3: "Legend 3",
  legend4: "Legend 4",
  legend5: "Legend 5",
  legend6: "Legend 6",
  legend7: "Legend 7",
  legend8: "Legend 8",
  legend9: "Legend 9",
  legend10: "Legend 10",
};

// Reducer case: handle new frame messages
function handleFrame(state: State, action: Extract<Action, { type: "frame" }>): State {
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
      const data = (message.message as { data: Float32Array }).data;
      if (data != undefined) {
        latestMatchingQueriedData = data;
        latestMessage = message;
      }
    }
  }
  return { ...state, latestMessage, latestMatchingQueriedData, error: undefined };
}

// Reducer case: handle path change
function handlePath(state: State, action: Extract<Action, { type: "path" }>): State {
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

// Reducer case: handle seek (reset state)
function handleSeek(state: State): State {
  return {
    ...state,
    latestMessage: undefined,
    latestMatchingQueriedData: undefined,
    error: undefined,
  };
}

// Reducer function combining all cases
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "frame":
      return handleFrame(state, action);
    case "path":
      return handlePath(state, action);
    case "seek":
      return handleSeek(state);
    default:
      return state;
  }
}


export function BarChart({ context }: Props): React.JSX.Element {
  // panel extensions must notify when they've completed rendering
  // onRender will setRenderDone to a done callback which we can invoke after we've rendered
  const [renderDone, setRenderDone] = useState<() => void>(() => () => {});
  const { legendCount } = useLegendCount('Bar Chart');

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

  const settingsActionHandler = useCallback(
    (action: SettingsTreeAction) => {
      setConfig((prevConfig) => settingsActionReducer(prevConfig, action));
    },
    [],
  );

  const settingsTree = useSettingsTree(
    config,
    state.pathParseError,
    state.error?.message,
    legendCount,
  );

  // Extract raw values from queried message data
  const rawValue = useMemo(
    () =>
      state.latestMatchingQueriedData instanceof Float32Array
        ? state.latestMatchingQueriedData
        : new Float32Array(),
    [state.latestMatchingQueriedData],
  );

  // Normalize values into percentage format from useChartData
  const data = useChartData(rawValue, config);

  // Dispatch path change on config.path update
  useLayoutEffect(() => {
    dispatch({ type: "path", path: config.path });
  }, [config.path]);

  // Save panel state and title on config update
  useEffect(() => {
    context.saveState(config);
    context.setDefaultPanelTitle(config.path === "" ? undefined : config.path);
  }, [config, context]);

  // Register frame/seek render handler
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

  // Update panel settings editor with latest tree and handler
  useEffect(() => {
    context.updatePanelSettingsEditor({
      actionHandler: settingsActionHandler,
      nodes: settingsTree,
    });
  }, [context, settingsActionHandler, settingsTree]);

  // Subscribe/unsubscribe to topic from parsed path
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

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#333' }}>
      <h1 style={{ textAlign: 'center', fontSize: '24px', marginBottom: '20px' }}>{(config as any)[`title`]} </h1>
      {rawValue.length === 0 ? (
        <div>No data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
        <RechartsBarChart data={data}>
            <XAxis dataKey="name" />
            <YAxis />
            <Bar
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(255, 255, 255, 0.8)",
                borderRadius: "10px",
                color: "#000",
                fontSize: "14px",
                boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.3)",
              }}
              formatter={(value, name) => {
                const formattedValue = typeof value === 'number' ? value.toFixed(2) : value;
                return [`${name}: ${formattedValue}%`];
              }}
              />
          </RechartsBarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
