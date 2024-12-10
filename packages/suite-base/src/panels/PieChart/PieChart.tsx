// SPDX-FileCopyrightText: Copyright (C) 2023-2024 Bayerische Motoren Werke Aktiengesellschaft (BMW AG)<lichtblick@bmwgroup.com>
// SPDX-License-Identifier: MPL-2.0

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as _ from "lodash-es";
import { useCallback, useEffect, useLayoutEffect, useReducer, useState } from "react";
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

import Logger from "@lichtblick/log";
import { parseMessagePath, MessagePath } from "@lichtblick/message-path";
import { MessageEvent, PanelExtensionContext, SettingsTreeAction } from "@lichtblick/suite";
import { simpleGetMessagePathDataItems } from "@lichtblick/suite-base/components/MessagePathSyntax/simpleGetMessagePathDataItems";

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
  // log.info("New data received: state", state);
  // log.info("New data received: action", action);
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

            const data = (message.message as { data: Float32Array }).data;

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

  const rawValue =
    state.latestMatchingQueriedData instanceof Float32Array
      ? state.latestMatchingQueriedData
      : new Float32Array();

  const chartData = rawValue.length > 0 ? Array.from(rawValue).map((value) => (value / Array.from(rawValue).reduce((sum, val) => sum + val, 0)) * 100) : [];

  const data = chartData.map((value, index) => ({
    name: `Data ${index + 1}`,
    value,
    color: `hsl(${(index / chartData.length) * 360}, 70%, 50%)`,
  }));

  return (
    <div>
      <h1>Pie Chart</h1>
      {rawValue.length === 0 ? (
        <div>No data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <RechartsPieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              label={({ index }) => {
                const value = rawValue[index];
                return value ? value.toFixed(2) : '';
              }}
              fill="#8884d8"
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="80%"
              animationBegin={0}
              animationDuration={1000}
              animationEasing="ease-out"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                borderRadius: '5px',
                color: 'white',
                fontSize: '14px',
                padding: '10px',
              }}
              formatter={(value, name) => {
                const formattedValue = typeof value === 'number' ? value.toFixed(2) : value;
                return [`${name}: ${formattedValue}%`];
              }}
              />
            <Legend />
          </RechartsPieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
