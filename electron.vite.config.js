import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import pluginExternal from "vite-plugin-external";

export default defineConfig({
  // main process has full access to Node.js APIs
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, "src/main/index.ts"),
        // Freelens 1.xx extensions are CommonJS modules
        formats: ["cjs"],
      },
      rollupOptions: {
        output: {
          // silence warning about using `chunk.default` to access the default export
          exports: "named",
          // prefer separate files for each module
          preserveModules: true,
          preserveModulesRoot: "src/main",
        },
      },
      sourcemap: true,
    },
    plugins: [
      react({
        babel: {
          plugins: [
            [
              "@babel/plugin-proposal-decorators",
              {
                version: "2023-05",
              },
            ],
          ],
        },
      }),
      externalizeDepsPlugin({
        // do not bundle modules provided by the host app
        include: ["@freelensapp/extensions", "mobx"],
      }),
      pluginExternal({
        externals: {
          "@freelensapp/extensions": "global.LensExtensions",
          mobx: "global.Mobx",
        },
      }),
    ],
  },
  // renderer process in Freelens can use Node.js modules then it is configured
  // with settings for preload script
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, "src/renderer/index.tsx"),
        // Freelens 1.xx extensions are CommonJS modules
        formats: ["cjs"],
      },
      outDir: "out/renderer",
      rollupOptions: {
        output: {
          // silence warning about using `chunk.default` to access the default export
          exports: "named",
          // prefer separate files for each module
          preserveModules: true,
          preserveModulesRoot: "src/renderer",
        },
      },
      sourcemap: true,
    },
    css: {
      modules: {
        localsConvention: "camelCaseOnly",
      },
    },
    plugins: [
      react({
        babel: {
          plugins: [
            [
              "@babel/plugin-proposal-decorators",
              {
                version: "2023-05",
              },
            ],
          ],
        },
        // do not use `react/jsx-runtime` module in transpiled code
        // jsxRuntime: "classic",
        // tsDecorators: true
      }),
      externalizeDepsPlugin({
        // do not bundle modules provided by the host app
        include: [
          "@freelensapp/extensions",
          "electron",
          "react",
          "react-dom",
          "mobx",
          "mobx-react",
          "react-router-dom",
        ],
        // bundle all other modules
        exclude: [],
      }),
      pluginExternal({
        // the modules are provided by the host app as a global variable
        externals: {
          "@freelensapp/extensions": "global.LensExtensions",
          mobx: "global.Mobx",
          "mobx-react": "global.MobxReact",
          react: "global.React",
          "react-dom": "global.ReactDOM",
          "react-router-dom": "global.ReactRouterDom",
          "react/jsx-runtime": "global.ReactJsxRuntime",
        },
      }),
    ],
  },
  // renderer process configuration
  // renderer: {
  //   build: {
  //     rollupOptions: {
  //       input: resolve(__dirname, "src/renderer/index.tsx"),
  //       output: {
  //         // silence warning about using `chunk.default` to access the default export
  //         exports: "named",
  //       },
  //     },
  //     sourcemap: true,
  //   },
  //   css: {
  //     modules: {
  //       localsConvention: "camelCaseOnly",
  //     },
  //   },
  //   plugins: [
  //     react({
  //       babel: {
  //         plugins: [
  //           [
  //             "@babel/plugin-proposal-decorators",
  //             {
  //               version: "2023-05",
  //             },
  //           ],
  //         ],
  //       },
  //     }),
  //     externalizeDepsPlugin({
  //       // do not bundle modules provided by the host app
  //       include: [
  //         "@freelensapp/extensions",
  //         "electron",
  //         "react",
  //         "react-dom",
  //         "mobx",
  //         "mobx-react",
  //         "react-router-dom"],
  //       // bundle all other modules
  //       exclude: [],
  //     }),
  //     pluginExternal({
  //       // the modules are provided by the host app as a global variable
  //       externals: {
  //         "@freelensapp/extensions": "global.LensExtensions",
  //         mobx: "global.Mobx",
  //         "mobx-react": "global.MobxReact",
  //         react: "global.React",
  //         "react-dom": "global.ReactDom",
  //         "react-router-dom": "global.ReactRouterDom",
  //         "react/jsx-runtime": "global.ReactJsxRuntime",
  //       },
  //     }),
  //   ],
  // },
});
