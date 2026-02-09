"use client";

import { useEffect, useLayoutEffect } from "react";

const themeScript = `
(function() {
  var storageKey = "huaweicloudai-theme";
  var stored = localStorage.getItem(storageKey);
  var preference = (stored === "light" || stored === "dark" || stored === "system") ? stored : "system";
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  var isDark = preference === "dark" || (preference === "system" && media.matches);
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.dataset.theme = preference;
})();
`;

export function ThemeProvider() {
  useLayoutEffect(() => {
    const script = document.createElement("script");
    script.id = "theme-init";
    script.innerHTML = themeScript;
    (document.head || document.documentElement).insertBefore(script, document.head.firstChild);
  }, []);

  return null;
}
