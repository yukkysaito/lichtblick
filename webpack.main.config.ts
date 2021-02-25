import path from "path";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import { Configuration, ResolveOptions, DefinePlugin } from "webpack";

import { WebpackArgv } from "./WebpackArgv";

export default (_: never, argv: WebpackArgv): Configuration => {
  const isServe = argv.env?.WEBPACK_SERVE ?? false;

  const isDev = argv.mode === "development";

  const resolve: ResolveOptions = {
    extensions: [".js", ".ts", ".tsx", ".json"],
  };

  if (!isDev) {
    // Stub out devtools installation for non-dev builds
    resolve.alias = {
      "electron-devtools-installer": false,
    };
  }

  // When running under a development server the renderer entry comes from the server.
  // When making static builds (for packaging), the renderer entry is a file on disk.
  // This switches between the two and is injected below via DefinePlugin as MAIN_WINDOW_WEBPACK_ENTRY
  const rendererEntry = isServe
    ? "'http://localhost:8080/renderer/index.html'"
    : "`file://${require('path').join(__dirname, '..', 'renderer', 'index.html')}`";

  return {
    context: path.resolve("./desktop"),
    entry: "./index.ts",
    target: "electron-main",

    output: {
      publicPath: "",
      path: path.resolve(__dirname, ".webpack", "main"),
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            loader: "ts-loader",
            options: {
              transpileOnly: true,
              // https://github.com/TypeStrong/ts-loader#onlycompilebundledfiles
              // avoid looking at files which are not part of the bundle
              onlyCompileBundledFiles: true,
              compilerOptions: {
                module: "es2020",
              },
            },
          },
        },
        {
          test: /\.s?css$/,
          loader: "css-loader",
          options: { modules: { exportOnlyLocals: true } },
        },
        { test: /\.scss$/, loader: "sass-loader" },
      ],
    },

    plugins: [
      new DefinePlugin({
        MAIN_WINDOW_WEBPACK_ENTRY: rendererEntry,
        // Should match webpack-defines.d.ts
        APP_NAME: JSON.stringify("Foxglove Studio"),
      }),
      new ForkTsCheckerWebpackPlugin(),
    ],

    resolve,
  };
};
