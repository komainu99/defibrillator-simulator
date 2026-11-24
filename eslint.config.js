const web = Object.fromEntries([
  "AbortController", "Buffer", "EventSource", "ReadableStream", "ResizeObserver",
  "Request", "Response", "TextDecoder", "TextEncoder", "URL", "URLSearchParams", "cancelAnimationFrame",
  "clearInterval", "clearTimeout", "queueMicrotask", "console", "devicePixelRatio", "document", "fetch", "getComputedStyle",
  "location", "navigator", "performance", "requestAnimationFrame", "setInterval",
  "setTimeout", "structuredClone", "window"
].map(name => [name, "readonly"]));

export default [
  { ignores: [".next/**", ".npm-cache/**", "out/**"] },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: web
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { caughtErrors: "none" }],
      "no-unreachable": "error",
      "no-dupe-keys": "error"
    }
  },
  {
    files: ["**/*.jsx"],
    rules: { "no-unused-vars": "off" }
  }
];
