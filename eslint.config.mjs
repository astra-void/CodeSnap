import { browserGlobals, mochaGlobals, nodeGlobals } from "./eslint-globals.mjs";

export default [
    {
        files: ["**/*.js"],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: {
                ...nodeGlobals,
            },
        },
    },
    {
        files: ["**/*.mjs"],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...nodeGlobals,
            },
        },
    },
    {
        files: ["webview/**/*.{js,mjs}"],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...browserGlobals,
                acquireVsCodeApi: "readonly",
                domtoimage: "readonly",
            },
        },
    },
    {
        files: ["test/**/*.js"],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "commonjs",
            globals: {
                ...mochaGlobals,
                ...nodeGlobals,
            },
        },
    },
];
