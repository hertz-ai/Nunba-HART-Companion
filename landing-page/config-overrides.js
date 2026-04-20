/* eslint-disable */
// Webpack override for the React SPA build.
//
// `CYPRESS_COVERAGE=true` OR `NUNBA_INSTRUMENT=1` turns on
// babel-plugin-istanbul so `window.__coverage__` is populated at
// runtime.  The @cypress/code-coverage plugin ships that object
// back to the nyc reporter after each Cypress run.  Production
// builds do NOT set either var — zero instrumentation cost in
// shipped bundles.
module.exports = function override(config) {
  config.resolve = config.resolve || {};
  config.resolve.fallback = {
    ...config.resolve.fallback,
    stream: require.resolve("stream-browserify"),
    buffer: require.resolve("buffer/"),
  };

  const instrument =
    process.env.CYPRESS_COVERAGE === "true" ||
    process.env.NUNBA_INSTRUMENT === "1";

  if (instrument) {
    // Inject babel-plugin-istanbul into every babel-loader rule.
    const babelLoaderPredicate = (rule) =>
      rule && rule.loader && /babel-loader/.test(rule.loader);

    const injectIstanbul = (loader) => {
      loader.options = loader.options || {};
      loader.options.plugins = loader.options.plugins || [];
      const alreadyAdded = loader.options.plugins.some((p) => {
        const name = Array.isArray(p) ? p[0] : p;
        return typeof name === "string" && name.includes("istanbul");
      });
      if (!alreadyAdded) {
        loader.options.plugins.push([
          require.resolve("babel-plugin-istanbul"),
          {
            // Do NOT instrument vendor code or tests themselves.
            exclude: [
              "node_modules/**",
              "**/*.test.js",
              "**/*.test.jsx",
              "cypress/**",
              "src/serviceWorker.js",
              "src/setupTests.js",
            ],
          },
        ]);
      }
    };

    const walkRules = (rules) => {
      if (!Array.isArray(rules)) return;
      for (const rule of rules) {
        if (babelLoaderPredicate(rule)) {
          injectIstanbul(rule);
        }
        if (rule && rule.use) {
          const uses = Array.isArray(rule.use) ? rule.use : [rule.use];
          for (const u of uses) {
            if (babelLoaderPredicate(u)) {
              injectIstanbul(u);
            }
          }
        }
        if (rule && rule.oneOf) {
          walkRules(rule.oneOf);
        }
      }
    };

    if (config.module && config.module.rules) {
      walkRules(config.module.rules);
    }
  }

  return config;
};
