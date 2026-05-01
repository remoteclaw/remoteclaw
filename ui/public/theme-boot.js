// Theme-flash prevention. Runs synchronously from <head> before the ESM
// bundle loads, so it sets data-theme on <html> pre-paint. Keep as plain
// JS served from /public/ — do NOT port to TS or a module.
(function () {
  var THEMES = { claw: 1, knot: 1, dash: 1 };
  var MODES = { system: 1, light: 1, dark: 1 };
  var LEGACY = {
    dark: "claw:dark",
    light: "claw:light",
    openknot: "knot:dark",
    fieldmanual: "dash:dark",
    clawdash: "dash:light",
    system: "claw:system",
  };
  try {
    var keys = Object.keys(localStorage);
    var raw;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("remoteclaw.control.settings.v1") === 0) {
        raw = localStorage.getItem(keys[i]);
        if (raw) {
          break;
        }
      }
    }
    if (!raw) {
      return;
    }
    var s = JSON.parse(raw);
    var t = s && s.theme;
    var m = s && s.themeMode;
    if (typeof t !== "string") {
      t = "";
    }
    if (typeof m !== "string") {
      m = "";
    }
    var legacy = LEGACY[t];
    var theme = THEMES[t] ? t : legacy ? legacy.split(":")[0] : "claw";
    var mode = MODES[m] ? m : legacy ? legacy.split(":")[1] : "system";
    if (mode === "system") {
      mode = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    var resolved =
      theme === "knot"
        ? mode === "light"
          ? "openknot-light"
          : "openknot"
        : theme === "dash"
          ? mode === "light"
            ? "dash-light"
            : "dash"
          : mode === "light"
            ? "light"
            : "dark";
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-theme-mode", resolved.indexOf("light") !== -1 ? "light" : "dark");
  } catch {}
})();
