/* eslint @typescript-eslint/no-var-requires: "off" */

const path = require("path");
const mode = process.env.NODE_ENV || "production"
module.exports = [
  {
    entry: './main.ts',
    context: __dirname,
    target: "electron-main",
    mode: "production",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    externals: [
      {
        "@freelensapp/extensions": "var global.LensExtensions",
        "mobx": "var global.Mobx",
        "react": "var global.React"
      }
    ],
    resolve: {
      extensions: [ '.tsx', '.ts', '.js' ],
    },
    output: {
      libraryTarget: "commonjs2",
      filename: 'main.js',
      path: path.resolve(__dirname, 'dist'),
    },
  },
  {
    entry: "./renderer.tsx",
    context: __dirname,
    target: "electron-renderer",
    mode,
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.s?css$/,
          use: [
            "style-loader",
            "css-loader",
            "sass-loader",
          ]
        }
      ],
    },
    externals: [
      {
        "@freelensapp/extensions": "var global.LensExtensions",
        "react": "var global.React",
        "mobx": "var global.Mobx",
        "mobx-react": "var global.MobxReact",
      }
    ],
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
    },
    output: {
      libraryTarget: "commonjs2",
      globalObject: "this",
      filename: "renderer.js",
      path: path.resolve(__dirname, "dist"),
      chunkFilename: "chunks/[name].js",
    },
    node: {
      __dirname: false,
      __filename: false
    }
  },
];
