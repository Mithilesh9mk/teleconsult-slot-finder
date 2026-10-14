import fs from "fs";
const src = fs.readFileSync(process.argv[2], "utf8");
const a = src.indexOf("function zonedToUtc"); const b = src.indexOf("const istFmt");
const h0 = src.indexOf("const DESTS"); const h1 = src.indexOf("function istKeyFromDate");
const code = src.slice(a, b) + "\n" + src.slice(h0, h1) + "\nreturn {findSlots, PRESETS};";
const { findSlots, PRESETS } = new Function(code)();
const cases = [["Europe/London","Europe/Istanbul"],["America/New_York","Europe/Istanbul"],["Australia/Sydney","Europe/Istanbul"],["America/Los_Angeles","Europe/Istanbul"],["Europe/Berlin","Asia/Bangkok"],["Asia/Dubai","Asia/Seoul"],["America/Chicago","America/Mexico_City"]];
for (const d of ["2026-01-15","2026-07-15"]) for (const [p,c] of cases) console.log(d, p, "->", c, findSlots(d,p,c,PRESETS.Standard).length*0.5);
