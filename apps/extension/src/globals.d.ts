// Injected by build.mjs via esbuild `define`. The panel shows it so you can
// tell at a glance whether a tab is running the current build — reloading the
// extension does not re-inject content scripts into already-open tabs.
declare const __BUILD_TIME__: string;
