// Item descriptions from property text. Pure.
// Property text may use dnd5e enrichers such as [[/damage 1d6 fire]] or &Reference[resistance],
// so the description stays clickable in Foundry.

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * @param {{ label: string, text: string }[]} resolved  Picks in slot order.
 * @param {string} baseDescription                     The base item's HTML description, kept below.
 * @param {boolean} attunement
 */
export function buildDescription(resolved, baseDescription = "", attunement = false) {
  const lines = [];
  if (attunement) lines.push("<p><em>Requires attunement.</em></p>");
  const entries = resolved.filter((r) => r.text);
  if (entries.length) {
    // Labels are escaped; text is trusted HTML from property files, which the DM installs.
    lines.push("<ul>", ...entries.map((r) => `<li><p><strong>${escape(r.label)}.</strong> ${r.text}</p></li>`), "</ul>");
  }
  if (baseDescription?.trim()) lines.push("<hr>", baseDescription);
  return lines.join("\n");
}
