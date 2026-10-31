// AppleScript that focuses an Arc space by its sidebar name.
export const quote = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
export const focusScript = (space) =>
  `tell application "Arc"\n activate\n tell front window to tell space "${quote(space)}" to focus\nend tell`;
