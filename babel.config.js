// The runtime half of the path aliases. It MUST stay in sync with the `paths`
// block in tsconfig.json — TypeScript resolves one, Metro resolves the other,
// and a mismatch type-checks clean then fails at runtime.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./",
            "@api": "./src/shared/api",
            "@modules": "./src/modules",
            "@navigation": "./src/navigation",
            "@shared": "./src/shared",
            "@config": "./src/config",
          },
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
      ],
      // Must be listed last.
      "react-native-worklets/plugin",
    ],
  };
};
