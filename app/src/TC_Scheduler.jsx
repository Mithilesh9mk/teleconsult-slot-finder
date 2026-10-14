import { useState, useEffect, useMemo, useRef } from "react";

/* ====================== TIMEZONE ENGINE (IANA / DST-safe) ====================== */
// Picker options — labelled by city, grouped by region. The zone is the IANA id,
// which uses the same tz database WorldTimeBuddy runs on (incl. daylight saving).
const TZ_GROUPS = [
  ["United Kingdom & Europe", [
    ["UK (GMT/BST)", "Europe/London"],
    ["Ireland (GMT/IST)", "Europe/Dublin"],
    ["Europe Central (CET/CEST)", "Europe/Berlin"],
    ["Europe Eastern (EET/EEST)", "Europe/Athens"],
  ]],
  ["North America", [
    ["US Eastern (EST/EDT)", "America/New_York"],
    ["US Central (CST/CDT)", "America/Chicago"],
    ["US Mountain (MST/MDT)", "America/Denver"],
    ["US Arizona (MST)", "America/Phoenix"],
    ["US Pacific (PST/PDT)", "America/Los_Angeles"],
    ["US Alaska (AKST/AKDT)", "America/Anchorage"],
    ["US Hawaii (HST)", "Pacific/Honolulu"],
  ]],
  ["Middle East", [
    ["UAE / Gulf (GST)", "Asia/Dubai"],
    ["Saudi Arabia (AST)", "Asia/Riyadh"],
    ["Qatar (AST)", "Asia/Qatar"],
    ["Israel (IST/IDT)", "Asia/Jerusalem"],
  ]],
  ["Australia & New Zealand", [
    ["Australia WA (AWST)", "Australia/Perth"],
    ["Australia QLD (AEST, no DST)", "Australia/Brisbane"],
    ["Australia NSW/VIC (AEST/AEDT)", "Australia/Sydney"],
    ["Australia SA (ACST/ACDT)", "Australia/Adelaide"],
    ["Australia NT (ACST, no DST)", "Australia/Darwin"],
    ["Australia TAS (AEST/AEDT)", "Australia/Hobart"],
    ["New Zealand (NZST/NZDT)", "Pacific/Auckland"],
  ]],
  ["Africa", [
    ["South Africa (SAST)", "Africa/Johannesburg"],
  ]],
];
const ZONE_LABEL = Object.fromEntries(TZ_GROUPS.flatMap(([, opts]) => opts.map(([l, z]) => [z, l])));

// Correct abbreviation for a zone on a specific date (handles DST both hemispheres).
const ABBR = {
  "America/New_York": { std: "EST", dst: "EDT" }, "America/Chicago": { std: "CST", dst: "CDT" },
  "America/Denver": { std: "MST", dst: "MDT" }, "America/Phoenix": { std: "MST" },
  "America/Los_Angeles": { std: "PST", dst: "PDT" }, "America/Anchorage": { std: "AKST", dst: "AKDT" },
  "Pacific/Honolulu": { std: "HST" }, "Europe/London": { std: "GMT", dst: "BST" },
  "Europe/Dublin": { std: "GMT", dst: "IST" }, "Europe/Berlin": { std: "CET", dst: "CEST" },
  "Europe/Athens": { std: "EET", dst: "EEST" }, "Asia/Dubai": { std: "GST" },
  "Asia/Riyadh": { std: "AST" }, "Asia/Qatar": { std: "AST" }, "Asia/Jerusalem": { std: "IST", dst: "IDT" },
  "Australia/Perth": { std: "AWST" }, "Australia/Brisbane": { std: "AEST" },
  "Australia/Sydney": { std: "AEST", dst: "AEDT" }, "Australia/Adelaide": { std: "ACST", dst: "ACDT" },
  "Australia/Darwin": { std: "ACST" }, "Australia/Hobart": { std: "AEST", dst: "AEDT" },
  "Pacific/Auckland": { std: "NZST", dst: "NZDT" }, "Africa/Johannesburg": { std: "SAST" },
  "Asia/Kolkata": { std: "IST" },
};
function zoneOffsetMin(date, zone) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = {}; f.formatToParts(date).forEach(x => (p[x.type] = x.value));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === "24" ? 0 : +p.hour, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}
function tzAbbr(zone, inst) {
  const tab = ABBR[zone]; if (!tab) return "";
  if (!tab.dst) return tab.std;
  const d = new Date(inst), y = d.getUTCFullYear();
  const jan = zoneOffsetMin(new Date(Date.UTC(y, 0, 1)), zone);
  const jul = zoneOffsetMin(new Date(Date.UTC(y, 6, 1)), zone);
  const cur = zoneOffsetMin(d, zone);
  const dst = Math.max(jan, jul), std = Math.min(jan, jul);
  return (std !== dst && cur === dst) ? tab.dst : tab.std;
}

// For PASTE mode only: free-text label -> IANA. Order: specific first.
const TZ_PATTERNS = [
  [/\b(awst)\b|perth|western australia/i, "Australia/Perth"],
  [/brisbane|queensland/i, "Australia/Brisbane"],
  [/\b(ac[sd]t)\b|adelaide|south australia/i, "Australia/Adelaide"],
  [/darwin|northern territory/i, "Australia/Darwin"],
  [/hobart|tasmania/i, "Australia/Hobart"],
  [/\b(ae[sd]t)\b|sydney|melbourne|canberra|australian eastern/i, "Australia/Sydney"],
  [/\b(nz[sd]t)\b|auckland|new zealand|wellington/i, "Pacific/Auckland"],
  [/\b(ce[sd]t)\b|central european|berlin|paris|madrid|rome|amsterdam|brussels|vienna/i, "Europe/Berlin"],
  [/\b(ee[sd]t)\b|eastern european|athens|helsinki|bucharest/i, "Europe/Athens"],
  [/dublin|ireland/i, "Europe/Dublin"],
  [/london|\b(gmt|bst)\b|united kingdom|\buk\b|england|scotland|wales/i, "Europe/London"],
  [/\b(gst)\b|gulf|dubai|uae|abu dhabi/i, "Asia/Dubai"],
  [/riyadh|saudi|arabia/i, "Asia/Riyadh"],
  [/qatar|doha/i, "Asia/Qatar"],
  [/jerusalem|tel aviv|israel/i, "Asia/Jerusalem"],
  [/\b(e[sd]t)\b|eastern time|us eastern|new york/i, "America/New_York"],
  [/\b(c[sd]t)\b|central time|us central|chicago/i, "America/Chicago"],
  [/\b(m[sd]t)\b|mountain time|denver/i, "America/Denver"],
  [/arizona|phoenix/i, "America/Phoenix"],
  [/\b(p[sd]t)\b|pacific time|pacific|los angeles|california|\bla\b/i, "America/Los_Angeles"],
  [/\b(ak[sd]t)\b|alaska|anchorage/i, "America/Anchorage"],
  [/\b(hst)\b|hawaii|honolulu/i, "Pacific/Honolulu"],
  [/\b(sast)\b|johannesburg|south africa/i, "Africa/Johannesburg"],
  [/\bist\b|india|kolkata|mumbai|delhi/i, "Asia/Kolkata"],
];
function labelToIana(l) { if (!l) return null; for (const [re, z] of TZ_PATTERNS) if (re.test(l)) return z; return null; }

// (wall-clock in a zone) -> UTC Date, DST-safe via offset inversion.
function zonedToUtc(y, mo, d, h, mi, zone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p = {}; f.formatToParts(new Date(guess)).forEach(x => (p[x.type] = x.value));
  const hh = p.hour === "24" ? 0 : +p.hour;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, hh, +p.minute);
  return new Date(guess - (asUtc - guess));
}
const istFmt = (d, o) => new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: "Asia/Kolkata" }, o)).format(d);
const istClock = d => istFmt(d, { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
const istDay = d => istFmt(d, { weekday: "short", day: "2-digit", month: "short" });
const istKey = d => istFmt(d, { year: "numeric", month: "2-digit", day: "2-digit" });
// Destination clinic zone, chosen in the banner selector. Module-level so every formatter below follows it.
const clinic = { zone: "Europe/Istanbul" };
const clinicLabel = () => ((DESTS.find(x => x[1] === clinic.zone) || ["Clinic"])[0]).replace(/\s*\(.*\)/, "");
const clinicFmt = (d, o) => new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: clinic.zone }, o)).format(d);
const clinicClock = d => clinicFmt(d, { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
const clinicDay = d => clinicFmt(d, { weekday: "short", day: "2-digit", month: "short" });
const clinicKey = d => clinicFmt(d, { year: "numeric", month: "2-digit", day: "2-digit" });
function ist24(d) { return { h: +istFmt(d, { hour: "2-digit", hour12: false }).replace(/\D/g, "") % 24, mi: +istFmt(d, { minute: "2-digit" }) }; }
const to12 = (h, mi) => `${((h + 11) % 12) + 1}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;

/* ====================== PASTE PARSER ====================== */
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseMsg(t) {
  const r = {};
  let m = t.match(/Confirmation\s*[–\-:]\s*(.+)/i) || t.match(/^Hey\s+([A-Za-z][A-Za-z .'\-]+?)\s*[!,]/m);
  r.name = m ? m[1].trim().replace(/\s+/g, " ") : null;
  m = t.match(/Date:?\s*([0-9]{1,2})\s*([A-Za-z]{3,9})\s*([0-9]{4})/i);
  r.localDateLabel = m ? `${m[1]} ${m[2].slice(0, 3)} ${m[3]}` : null;
  r._d = m ? { d: +m[1], mo: MONTHS[m[2].slice(0, 3).toLowerCase()], y: +m[3] } : null;
  const times = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?\s*\(?\s*([A-Za-z][A-Za-z \/]*?)\s*\)?/g;
  let g;
  while ((g = re.exec(t)) !== null) {
    const label = g[4] ? g[4].trim() : "";
    if (!labelToIana(label) && !/IST/i.test(label)) continue;
    times.push({ h: +g[1], mi: g[2] ? +g[2] : 0, ap: g[3] ? g[3].replace(/\./g, "").toUpperCase() : null, label });
  }
  const local = times.find(x => !/IST/i.test(x.label) && labelToIana(x.label));
  let claimed = times.find(x => /IST/i.test(x.label));
  const bare = t.match(/IST\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?/i);
  if (!claimed && bare) claimed = { h: +bare[1], mi: bare[2] ? +bare[2] : 0, ap: bare[3] ? bare[3].toUpperCase() : null, label: "IST" };
  r.local = local || null;
  r.iana = local ? labelToIana(local.label) : null;
  r.tzLabel = local ? local.label : null;
  r.claimed = claimed ? norm24(claimed) : null;
  m = t.match(/(https?:\/\/[^\s]+)/);
  r.link = m ? m[1].replace(/[)\].,]+$/, "") : null;
  return r;
}
function norm24(x) { let h = x.h; if (x.ap === "PM" && h !== 12) h += 12; if (x.ap === "AM" && h === 12) h = 0; return { h, mi: x.mi }; }

/* ====================== MESSAGE GENERATOR ====================== */
function buildMessage(name, localDateLabel, localTime12, tzAbbrStr, inst) {
  const first = name.trim().split(/\s+/)[0];
  return (
`Hey ${first}! 🎉 You're all set.
Your teleconsultation is confirmed. Here are the details.

Teleconsultation Confirmation – ${name}
📅 Date: ${localDateLabel}
⏰ Time: ${localTime12} (${tzAbbrStr})
🔗 Meeting Link: ${"{LINK}"}

Please join a few minutes early and bring any questions. See you there!

———
🕒 IST (internal — delete this line before sending to patient): ${istClock(inst)}, ${istDay(inst)}
🏥 ${clinicLabel()} clinic time (for the doctor): ${clinicClock(inst)}, ${clinicDay(inst)}`
  );
}

function tzShortOf(zone) {
  const l = ZONE_LABEL[zone] || zone;
  return l.includes("·") ? l.split("·").pop().trim() : l;
}
function buildMessageFromRecord(rec) {
  const lp = localParts(rec.istInstant, rec.iana);
  const localTime12 = `${+lp.hour}:${lp.min} ${lp.mer}`;
  let label = rec.localDateLabel;
  if (!label) { const [Y, M, D] = lp.date.split("-").map(Number); const mn = Object.keys(MONTHS)[M - 1]; label = `${D} ${mn.charAt(0).toUpperCase() + mn.slice(1)} ${Y}`; }
  const msg = buildMessage(rec.name, label, localTime12, tzAbbr(rec.iana, new Date(rec.istInstant)), new Date(rec.istInstant));
  return msg.replace("{LINK}", rec.link || "[link]");
}

/* ====================== STATUS + CLASH ====================== */
const SEGMENTS = [
  ["now", "🔴 Due right now", "now"],
  ["soon", "⚡ Up next", "soon"],
  ["today", "🕐 Later today", "today"],
  ["tmrw", "🌙 Upcoming", "tmrw"],
  ["done", "✅ Done", "done"],
];
const ACTIVE_SEGMENTS = SEGMENTS.filter(s => s[0] !== "done");
function statusOf(inst, now) {
  const diff = (inst - now) / 60000;
  if (diff <= -30) return "done";
  if (diff < 15) return "now";
  if (diff < 90) return "soon";
  return istKey(inst) === istKey(now) ? "today" : "tmrw";
}
const AGENTS = ["Agent A", "Agent B", "Agent C", "Agent D", "Agent E", "Agent F"];
const OUTCOMES = [["done", "Done"], ["realigned", "Realigned"], ["noshow", "No-show"]];
const CLOSERS = ["Closer A", "Closer B", "Closer C", "Closer D", "Closer E"];
const outcomeLabel = o => (OUTCOMES.find(x => x[0] === o) || [, ""])[1];
// Fictional sample data only. Names, times and links are invented; generated relative to today so the demo always looks live.
const SAMPLE_ROWS = [
  ["Sample Patient 01", "America/New_York", 0, 21, 0, "Agent A"],
  ["Sample Patient 02", "Europe/London", 0, 19, 30, "Agent B"],
  ["Sample Patient 03", "Australia/Sydney", 1, 6, 30, "Agent C"],
  ["Sample Patient 04", "America/Los_Angeles", 1, 22, 0, "Agent D"],
  ["Sample Patient 05", "Asia/Dubai", 1, 15, 0, "Agent E"],
  ["Sample Patient 06", "Africa/Johannesburg", 2, 14, 30, "Agent F"],
  ["Sample Patient 07", "America/Chicago", 2, 20, 30, "Agent A"],
  ["Sample Patient 08", "Pacific/Auckland", 3, 5, 0, "Agent B"],
];
function makeSample() {
  const todayIst = new Date(Date.now() + 5.5 * 3600000);
  return SAMPLE_ROWS.map(([name, iana, dayOff, h, mi, agent], i) => {
    const d = new Date(Date.UTC(todayIst.getUTCFullYear(), todayIst.getUTCMonth(), todayIst.getUTCDate() + dayOff));
    const inst = zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, mi, "Asia/Kolkata");
    const lp = localParts(inst.toISOString(), iana);
    const [Y, M, D] = lp.date.split("-").map(Number);
    const mn = Object.keys(MONTHS)[M - 1];
    return {
      id: "sample" + (i + 1), name, iana, agent, claimedMismatch: null, history: [], realigned: false,
      link: "https://meet.example.com/sample-" + String(i + 1).padStart(2, "0"),
      istInstant: inst.toISOString(),
      localDateLabel: `${D} ${mn.charAt(0).toUpperCase() + mn.slice(1)} ${Y}`,
      localTime: `${+lp.hour}:${lp.min} ${lp.mer} ${tzAbbr(iana, inst)}`,
    };
  });
}

/* ====================== STORAGE ====================== */
// Stored in this browser only (localStorage). Nothing is sent anywhere.
const LS_KEY = "tc_scheduler_demo_v1";
function loadAppts() {
  try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r); } catch (e) {}
  return null;
}
function saveAppts(a) { try { localStorage.setItem(LS_KEY, JSON.stringify(a)); } catch (e) {} }

/* ====================== COMPONENT ====================== */
export default function App() {
  const [appts, setApptsState] = useState([]);
  const [mode, setMode] = useState("form");
  const [now, setNow] = useState(Date.now());
  const [autoClock, setAutoClock] = useState(true);
  const [manualNow, setManualNow] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const fileRef = useRef(null);
  const [modal, setModal] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [customCloser, setCustomCloser] = useState({});
  const [customAgent, setCustomAgent] = useState({});
  const [fAgentCustom, setFAgentCustom] = useState(false);
  const [mAgentCustom, setMAgentCustom] = useState(false);
  const [view, setView] = useState("board");
  const [clinicZ, setClinicZ] = useState("Europe/Istanbul");
  clinic.zone = clinicZ;
  const [aDate, setADate] = useState("all");
  const [aOwner, setAOwner] = useState("all");
  const [aOutcome, setAOutcome] = useState("all");
  const [calDay, setCalDay] = useState("");
  const [targetSlot, setTargetSlot] = useState(null);
  // Slot Finder
  const [sfZone, setSfZone] = useState("America/New_York");
  const [sfDest, setSfDest] = useState("Europe/Istanbul");
  const [sfDate, setSfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sfPreset, setSfPreset] = useState("Standard");
  const [sfWin, setSfWin] = useState(PRESETS.Standard);

  // form fields
  const [fName, setFName] = useState("");
  const [fDate, setFDate] = useState("");
  const [fHour, setFHour] = useState("");
  const [fMin, setFMin] = useState("00");
  const [fMer, setFMer] = useState("AM");
  const [fZone, setFZone] = useState("America/New_York");
  const [fLink, setFLink] = useState("");
  const [fAgent, setFAgent] = useState("");
  // paste field
  const [raw, setRaw] = useState("");

  useEffect(() => {
    const data = loadAppts();
    if (data) { setApptsState(data); return; }
    const sample = makeSample();
    setApptsState(sample); saveAppts(sample);
  }, []);
  useEffect(() => {
    const t = setInterval(() => { if (autoClock) setNow(Date.now()); }, 15000);
    return () => clearInterval(t);
  }, [autoClock]);

  const setAppts = (a) => { setApptsState(a); saveAppts(a); };
  const showToast = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2200); };

  const nowDate = useMemo(() => {
    if (autoClock || !manualNow) return new Date(now);
    const [d, t] = manualNow.split("T"); const [Y, M, D] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number);
    return zonedToUtc(Y, M, D, h, mi, "Asia/Kolkata");
  }, [autoClock, manualNow, now]);

  /* ---- form: live IST preview ---- */
  const formInst = useMemo(() => {
    if (!fDate || fHour === "" || !fZone) return null;
    let h = (+fHour) % 12; if (fMer === "PM") h += 12;
    const [Y, M, D] = fDate.split("-").map(Number);
    return zonedToUtc(Y, M, D, h, +fMin, fZone);
  }, [fDate, fHour, fMin, fMer, fZone]);

  const localDateLabel = useMemo(() => {
    if (!fDate) return "";
    const [Y, M, D] = fDate.split("-").map(Number);
    const mn = Object.keys(MONTHS)[M - 1]; return `${D} ${mn.charAt(0).toUpperCase() + mn.slice(1)} ${Y}`;
  }, [fDate]);

  const localTime12 = useMemo(() => { if (fHour === "") return ""; return `${+fHour}:${String(+fMin).padStart(2, "0")} ${fMer}`; }, [fHour, fMin, fMer]);
  const tzAb = useMemo(() => (fZone && formInst ? tzAbbr(fZone, formInst) : ""), [fZone, formInst]);

  const generatedMsg = useMemo(() => {
    if (!fName || !formInst || !localDateLabel) return "";
    let msg = buildMessage(fName, localDateLabel, localTime12, tzAb, formInst);
    msg = msg.replace("{LINK}", fLink || "[paste link]");
    return msg;
  }, [fName, formInst, localDateLabel, localTime12, tzAb, fLink, fDate]);

  /* ---- add from form ---- */
  function messageFor(a) {
    const inst = new Date(a.istInstant);
    const dl = new Intl.DateTimeFormat("en-GB", { timeZone: a.iana, day: "numeric", month: "short", year: "numeric" }).format(inst);
    const lp = localParts(a.istInstant, a.iana);
    const lt12 = `${+lp.hour}:${lp.min} ${lp.mer}`;
    const tzs = (ZONE_LABEL[a.iana] || a.iana).split("·").pop().trim();
    return buildMessage(a.name, dl, lt12, tzs, inst).replace("{LINK}", a.link || "[link]");
  }

  function addFromForm() {
    if (!fName) return showToast("Add the patient name");
    if (!formInst) return showToast("Add date, time and timezone");
    const finalMsg = generatedMsg.replace("[paste link]", fLink || "");
    upsert({
      name: fName.trim(),
      localTime: `${localTime12} ${tzAb}`,
      localDateLabel,
      iana: fZone,
      link: fLink || null,
      istInstant: formInst.toISOString(),
      agent: fAgent || null,
      claimedMismatch: null,
    });
    showToast("Added " + fName.trim());
    setModal({ type: "copy", text: finalMsg });
    setFName(""); setFHour(""); setFLink(""); setTargetSlot(null);
  }

  /* ---- add from paste ---- */
  function addFromPaste() {
    if (!raw.trim()) return showToast("Paste a message first");
    const p = parseMsg(raw);
    if (!p.name) return showToast("Couldn't read the patient name");
    if (!p.local || !p.iana || !p._d) return showToast("Couldn't read local time / timezone / date");
    const t = norm24(p.local);
    const inst = zonedToUtc(p._d.y, p._d.mo, p._d.d, t.h, t.mi, p.iana);
    let mismatch = null;
    if (p.claimed) {
      const real = ist24(inst);
      if (!(real.h === p.claimed.h && real.mi === p.claimed.mi))
        mismatch = { claimed: to12(p.claimed.h, p.claimed.mi), real: istClock(inst) };
    }
    upsert({
      name: p.name,
      localTime: `${to12(t.h, t.mi)} ${p.tzLabel}`,
      localDateLabel: p.localDateLabel,
      iana: p.iana,
      link: p.link || null,
      istInstant: inst.toISOString(),
      agent: AGENTS.find(a => new RegExp(a, "i").test(raw)) || null,
      claimedMismatch: mismatch,
    });
    showToast((mismatch ? "Added with IST corrected: " : "Added ") + p.name);
    setRaw("");
  }

  /* ---- upsert with realignment ---- */
  function upsert(rec) {
    const list = [...appts];
    const ex = list.find(a => a.name.toLowerCase() === rec.name.toLowerCase());
    if (ex) {
      ex.history = ex.history || [];
      ex.history.push({ ist: ex.istInstant, link: ex.link });
      Object.assign(ex, rec, { id: ex.id, realigned: true, agent: rec.agent || ex.agent, history: ex.history });
    } else {
      list.push(Object.assign(rec, { id: "a" + Date.now() + Math.random().toString(36).slice(2, 6), history: [], realigned: false }));
    }
    setAppts(list);
  }
  const setRowAgent = (id, v) => setAppts(appts.map(a => a.id === id ? { ...a, agent: v || null } : a));
  const setRowOutcome = (id, v) => setAppts(appts.map(a => a.id === id ? { ...a, outcome: v || null } : a));
  const setRowCloser = (id, v) => setAppts(appts.map(a => a.id === id ? { ...a, closer: v || null } : a));
  function chooseCloser(id, v) {
    if (v === "__custom__") { setCustomCloser(s => ({ ...s, [id]: true })); setRowCloser(id, ""); }
    else { setCustomCloser(s => { const n = { ...s }; delete n[id]; return n; }); setRowCloser(id, v); }
  }
  function chooseAgent(id, v) {
    if (v === "__custom__") { setCustomAgent(s => ({ ...s, [id]: true })); setRowAgent(id, ""); }
    else { setCustomAgent(s => { const n = { ...s }; delete n[id]; return n; }); setRowAgent(id, v); }
  }
  const removeRow = (id) => setAppts(appts.filter(a => a.id !== id));
  function resetAll() { if (confirm("Clear the whole board?")) setAppts([]); }

  /* ---- derived board ---- */
  const sorted = useMemo(() => [...appts].sort((a, b) => new Date(a.istInstant) - new Date(b.istInstant)), [appts]);
  const { alerts, hardClash, softOverlap } = useMemo(() => {
    const slots = {}; sorted.forEach(a => { const k = istKey(new Date(a.istInstant)) + " " + istClock(new Date(a.istInstant)); (slots[k] = slots[k] || []).push(a); });
    const hard = new Set(), soft = new Set(), al = [];
    Object.entries(slots).forEach(([k, g]) => {
      if (g.length < 2) return;
      // hard clash: any pair shares agent OR link
      let isHard = false;
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++)
        if ((g[i].agent && g[i].agent === g[j].agent) || (g[i].link && g[i].link === g[j].link)) isHard = true;
      const time = istClock(new Date(g[0].istInstant));
      if (isHard) { g.forEach(x => hard.add(x.id)); al.push(["err", `🚨 Real clash at ${time} IST — ${g.map(x => x.name).join(" & ")} share an agent or link. Reschedule one.`]); }
      else { g.forEach(x => soft.add(x.id)); al.push(["warn", `⚠ Two calls at ${time} IST — ${g.map(x => x.name).join(" & ")} (different agents/links, so OK if you have the capacity).`]); }
    });
    sorted.filter(a => a.claimedMismatch).forEach(a => al.push(["warn", `⚠ ${a.name}: booking IST was wrong (said ${a.claimedMismatch.claimed}). Correct is ${a.claimedMismatch.real} — tell the agent.`]));
    return { alerts: al, hardClash: hard, softOverlap: soft };
  }, [sorted]);

  const byStatus = useMemo(() => {
    const b = { done: [], rebook: [], now: [], soon: [], today: [], tmrw: [] };
    sorted.forEach(a => {
      if (a.outcome === "done") b.done.push(a);
      else if ((a.outcome === "realigned" || a.outcome === "noshow") && !a.rebookedToId) b.rebook.push(a);
      else if (a.outcome && a.rebookedToId) b.done.push(a);
      else b[statusOf(new Date(a.istInstant), nowDate)].push(a);
    });
    return b;
  }, [sorted, nowDate]);

  const analytics = useMemo(() => {
    const dm = {};
    appts.forEach(a => { const d = new Date(a.istInstant); const k = istKey(d); if (!dm[k]) dm[k] = { key: k, label: istDay(d), t: +d }; });
    const dates = Object.values(dm).sort((x, y) => x.t - y.t);
    const ownerKey = a => a.agent || "Unassigned";
    const base = appts.filter(a => (aDate === "all" || istKey(new Date(a.istInstant)) === aDate) && (aOwner === "all" || ownerKey(a) === aOwner));
    const om = {};
    base.forEach(a => {
      const o = ownerKey(a);
      om[o] = om[o] || { owner: o, aligned: 0, happened: 0, realigned: 0, noshow: 0, unmarked: 0 };
      om[o].aligned++;
      if (a.outcome === "done") om[o].happened++;
      else if (a.outcome === "realigned") om[o].realigned++;
      else if (a.outcome === "noshow") om[o].noshow++;
      else om[o].unmarked++;
    });
    const rows = [
      ...AGENTS.filter(x => om[x]).map(x => om[x]),
      ...Object.keys(om).filter(k => !AGENTS.includes(k) && k !== "Unassigned").map(k => om[k]),
      ...(om["Unassigned"] ? [om["Unassigned"]] : []),
    ];
    const totals = rows.reduce((t, o) => ({ owner: "Team total", aligned: t.aligned + o.aligned, happened: t.happened + o.happened, realigned: t.realigned + o.realigned, noshow: t.noshow + o.noshow, unmarked: t.unmarked + o.unmarked }), { owner: "Team total", aligned: 0, happened: 0, realigned: 0, noshow: 0, unmarked: 0 });
    const chartBase = base.filter(a => aOutcome === "all" || a.outcome === aOutcome);
    const hm = {};
    chartBase.forEach(a => { const h = ist24(new Date(a.istInstant)).h; hm[h] = hm[h] || { h, total: 0, noshow: 0 }; hm[h].total++; if (a.outcome === "noshow") hm[h].noshow++; });
    const hours = Object.values(hm).sort((x, y) => x.h - y.h);
    const maxH = Math.max(1, ...hours.map(r => r.total));
    return { dates, rows, totals, hours, maxH };
  }, [appts, aDate, aOwner, aOutcome]);

  const calendar = useMemo(() => {
    const dm = {};
    appts.forEach(a => { const d = new Date(a.istInstant); const k = istKey(d); if (!dm[k]) dm[k] = { key: k, label: istDay(d), t: +d }; });
    const todayK = istKey(nowDate);
    if (!dm[todayK]) dm[todayK] = { key: todayK, label: istDay(nowDate), t: +nowDate };
    const days = Object.values(dm).sort((x, y) => x.t - y.t);
    const day = (calDay && dm[calDay]) ? calDay : todayK;
    // occupying = scheduled or pending-realign/no-show is NOT occupying if already past & closed
    const occupies = a => !(a.outcome === "done" || a.outcome === "noshow" || a.rebookedToId);
    const slots = {};
    appts.forEach(a => {
      const d = new Date(a.istInstant);
      if (istKey(d) !== day) return;
      const { h, mi } = ist24(d);
      const idx = h * 2 + (mi >= 30 ? 1 : 0);
      slots[idx] = slots[idx] || { idx, calls: [], active: [], links: {} };
      slots[idx].calls.push(a);
      if (occupies(a)) {
        slots[idx].active.push(a);
        const L = a.link || "(no link)";
        slots[idx].links[L] = (slots[idx].links[L] || 0) + 1;
      }
    });
    Object.values(slots).forEach(s => { s.collision = Object.values(s.links).some(n => n > 1); });
    const cols = [0, 1, 2, 3].map(c => Array.from({ length: 12 }, (_, r) => c * 12 + r));
    return { days, day, slots, cols };
  }, [appts, calDay, nowDate]);

  function slotInstant(dayKey, idx) {
    const [dd, mm, yy] = dayKey.split("/");
    const h = Math.floor(idx / 2), mi = (idx % 2) * 30;
    return zonedToUtc(+yy, +mm, +dd, h, mi, "Asia/Kolkata");
  }
  function pickSlot(idx) {
    const inst = slotInstant(calendar.day, idx);
    setTargetSlot({ iso: inst.toISOString(), label: `${istClock(inst)} IST, ${istDay(inst)}` });
    setView("board"); setMode("form");
    showToast(`Targeting ${istClock(inst)} IST — set the patient's timezone & time`);
  }

  /* ---- exports ---- */
  const setMF = (k, v) => setModal(m => ({ ...m, [k]: v }));
  function buildBoardText() {
    let txt = `📅 *Consultation Board — ${istDay(nowDate)}*\n⏰ As of ${istClock(nowDate)} IST\n━━━━━━━━━━━━━━━━\n`;
    for (const [key, title] of SEGMENTS) {
      const items = byStatus[key]; if (!items.length) continue;
      txt += `\n${title}\n`;
      items.forEach(a => { const i = new Date(a.istInstant);
        txt += `• *${a.name}* — ${istClock(i)} IST${istKey(i) === istKey(nowDate) ? "" : " (" + istDay(i) + ")"}  [${a.localTime}]${a.agent ? " · " + a.agent : ""}${a.claimedMismatch ? " ⚠IST-fixed" : ""}\n`; });
    }
    return txt;
  }
  const openCopy = () => appts.length ? setModal({ type: "copy", text: buildBoardText() }) : showToast("Board is empty");
  const openExport = () => appts.length ? setModal({ type: "export", text: JSON.stringify(appts, null, 2) }) : showToast("Board is empty");
  function buildExcelTsv() {
    const headers = ["Clinic Time", "Clinic Date", "IST", "IST Date", "Patient Name", "Reference ID", "Meeting Link", "Booked By", "Notes", "Owner", "Status", "Rebooking", "Patient Time", "Patient Date", "Patient Timezone"];
    const rows = [...appts].sort((a, b) => new Date(a.istInstant) - new Date(b.istInstant)).map(a => {
      const i = new Date(a.istInstant);
      const lp = localParts(a.istInstant, a.iana);
      const ptime = `${+lp.hour}:${lp.min} ${lp.mer}`;
      let rb = "";
      if (a.rebookedToId && a.rebookToIst) rb = `Rebooked → ${istClock(new Date(a.rebookToIst))} ${istDay(new Date(a.rebookToIst))} IST`;
      else if (a.outcome === "realigned" || a.outcome === "noshow") rb = "Pending rebooking";
      else if (a.rebookedFromId && a.rebookFromIst) rb = `Rebook of ${istClock(new Date(a.rebookFromIst))} ${istDay(new Date(a.rebookFromIst))} IST${a.rebookReason ? " (" + outcomeLabel(a.rebookReason) + ")" : ""}`;
      return [
        clinicClock(i), clinicDay(i), istClock(i), istDay(i),
        a.name || "", "", a.link || "", a.agent || "", "", a.closer || "",
        outcomeLabel(a.outcome) || "", rb,
        ptime, a.localDateLabel || "", tzAbbr(a.iana, i),
      ].join("\t");
    });
    return [headers.join("\t"), ...rows].join("\n");
  }
  const openExcel = () => appts.length ? setModal({ type: "copy", text: buildExcelTsv() }) : showToast("Board is empty");
  const openImport = () => setModal({ type: "import", text: "" });
  const openCopyText = (text) => setModal({ type: "copy", text });
  function doImport(text) {
    try { const d = JSON.parse(text); if (!Array.isArray(d)) throw 0; setAppts(d); setModal(null); showToast("Imported " + d.length + " calls"); }
    catch { showToast("That isn't valid board JSON"); }
  }
  async function tryCopy(text) {
    try { await navigator.clipboard.writeText(text); showToast("Copied ✓"); return; } catch (e) {}
    const ta = document.getElementById("modalTa");
    if (ta) { ta.focus(); ta.select(); try { document.execCommand("copy"); showToast("Copied ✓"); return; } catch (e) {} }
    showToast("Select the text and copy manually");
  }
  function openEdit(a) {
    const lp = localParts(a.istInstant, a.iana);
    setMAgentCustom(!!(a.agent && !AGENTS.includes(a.agent)));
    setModal({ type: "edit", id: a.id, name: a.name, date: lp.date, hour: lp.hour, min: lp.min, mer: lp.mer, zone: a.iana, link: a.link || "", agent: a.agent || "" });
  }
  function saveEdit() {
    const m = modal;
    if (!m.name || !m.date || m.hour === "" || !m.zone) return showToast("Fill name, date, time, timezone");
    let h = (+m.hour) % 12; if (m.mer === "PM") h += 12;
    const [Y, M, D] = m.date.split("-").map(Number);
    const inst = zonedToUtc(Y, M, D, h, +m.min, m.zone);
    const mn = Object.keys(MONTHS)[M - 1];
    const ldl = `${D} ${mn.charAt(0).toUpperCase() + mn.slice(1)} ${Y}`;
    const tzs = tzAbbr(m.zone, inst);
    const lt = `${+m.hour}:${String(+m.min).padStart(2, "0")} ${m.mer} ${tzs}`;
    setAppts(appts.map(a => a.id === m.id ? { ...a, name: m.name.trim(), iana: m.zone, link: m.link || null, agent: m.agent || null, istInstant: inst.toISOString(), localTime: lt, localDateLabel: ldl, claimedMismatch: null } : a));
    setModal(null); showToast("Updated " + m.name.trim());
  }

  function openRebook(a) {
    const lp = localParts(a.istInstant, a.iana);
    setMAgentCustom(!!(a.agent && !AGENTS.includes(a.agent)));
    setModal({ type: "rebook", id: a.id, name: a.name, date: lp.date, hour: lp.hour, min: lp.min, mer: lp.mer, zone: a.iana, link: a.link || "", agent: a.agent || "" });
  }
  function saveRebook() {
    const m = modal;
    if (!m.name || !m.date || m.hour === "" || !m.zone) return showToast("Fill name, date, time, timezone");
    let h = (+m.hour) % 12; if (m.mer === "PM") h += 12;
    const [Y, M, D] = m.date.split("-").map(Number);
    const inst = zonedToUtc(Y, M, D, h, +m.min, m.zone);
    const mn = Object.keys(MONTHS)[M - 1];
    const ldl = `${D} ${mn.charAt(0).toUpperCase() + mn.slice(1)} ${Y}`;
    const tzs = tzAbbr(m.zone, inst);
    const lt = `${+m.hour}:${String(+m.min).padStart(2, "0")} ${m.mer} ${tzs}`;
    const old = appts.find(a => a.id === m.id);
    const newId = "a" + Date.now() + Math.random().toString(36).slice(2, 6);
    const newRec = {
      id: newId, name: m.name.trim(), iana: m.zone, link: m.link || null, agent: m.agent || null,
      istInstant: inst.toISOString(), localTime: lt, localDateLabel: ldl, claimedMismatch: null,
      outcome: null, history: [], realigned: false, closer: old ? old.closer || null : null,
      rebookedFromId: m.id, rebookFromIst: old ? old.istInstant : null, rebookReason: old ? old.outcome : null,
    };
    setAppts(appts.map(a => a.id === m.id ? { ...a, rebookedToId: newId, rebookToIst: inst.toISOString() } : a).concat(newRec));
    setModal({ type: "copy", text: buildMessageFromRecord(newRec) });
    showToast("Rebooked " + m.name.trim());
  }

  /* ====================== RENDER ====================== */
  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="top">
          <div className="brand">
            <div className="mark">+</div>
            <div><h1>Teleconsultation Scheduler</h1><div className="sub">Teleconsultation scheduling · IST board</div></div>
          </div>
          <div className="clock">
            {autoClock ? (
              <div><label>Now · IST</label><div className="live"><span className="pulse" />{istClock(nowDate)} · {istDay(nowDate)}</div></div>
            ) : (
              <div><label>Set IST manually</label><br /><input type="datetime-local" value={manualNow} onChange={e => setManualNow(e.target.value)} /></div>
            )}
            <div className="clActions">
              <button className="clToggle" onClick={() => setAutoClock(v => !v)}>{autoClock ? "Set manually" : "Use device time"}</button>
              <a className="clWtb" href="https://www.worldtimebuddy.com/" target="_blank" rel="noopener">WorldTimeBuddy ↗</a>
            </div>
          </div>
        </div>

        <div className="viewtabs">
          <button className={"vtab" + (view === "board" ? " on" : "")} onClick={() => setView("board")}>🗓 Board</button>
          <button className={"vtab" + (view === "analytics" ? " on" : "")} onClick={() => setView("analytics")}>📊 Analytics</button>
          <button className={"vtab" + (view === "calendar" ? " on" : "")} onClick={() => setView("calendar")}>📅 Calendar</button>
          <button className={"vtab" + (view === "finder" ? " on" : "")} onClick={() => setView("finder")}>🔍 Slot Finder</button>
        </div>

        <div className="connected">Demo mode · all data in this tool is fictional sample data, stored only in this browser. &nbsp;·&nbsp; Destination clinic: <select value={clinicZ} onChange={e => setClinicZ(e.target.value)} style={{ marginLeft: 4 }}>{DESTS.map(([l, z]) => <option key={z} value={z}>{l}</option>)}</select></div>

        {view === "board" && <div className="wrap">
          {/* LEFT */}
          <div className="left">
            <div className="tabs">
              <button className={mode === "form" ? "tab on" : "tab"} onClick={() => setMode("form")}>📝 Create message</button>
              <button className={mode === "paste" ? "tab on" : "tab"} onClick={() => setMode("paste")}>📋 Paste message</button>
            </div>

            {mode === "form" ? (
              <div className="card">
                <div className="bd">
                  <label className="fl">Patient name</label>
                  <input className="fi" value={fName} onChange={e => setFName(e.target.value)} placeholder="e.g. Sample Patient" />
                  <label className="fl">Patient date</label>
                  <input className="fi" type="date" value={fDate} onChange={e => setFDate(e.target.value)} />
                  <label className="fl">Patient time</label>
                  <div className="time3">
                    <select className="fi" value={fHour} onChange={e => setFHour(e.target.value)}>
                      <option value="">Hr</option>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h}>{h}</option>)}
                    </select>
                    <select className="fi" value={fMin} onChange={e => setFMin(e.target.value)}>
                      {Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")).map(m => <option key={m}>{m}</option>)}
                    </select>
                    <select className="fi" value={fMer} onChange={e => setFMer(e.target.value)}>
                      <option>AM</option><option>PM</option>
                    </select>
                  </div>
                  <label className="fl">Patient timezone</label>
                  <select className="fi" value={fZone} onChange={e => setFZone(e.target.value)}>
                    {TZ_GROUPS.map(([g, opts]) => (
                      <optgroup key={g} label={g}>{opts.map(([l, z]) => <option key={z} value={z}>{l}</option>)}</optgroup>
                    ))}
                  </select>
                  <label className="fl">Meeting link</label>
                  <input className="fi" value={fLink} onChange={e => setFLink(e.target.value)} placeholder="https://meet.google.com/..." />
                  <label className="fl">Booked by</label>
                  <select className="fi" value={fAgentCustom ? "__custom__" : fAgent} onChange={e => { const v = e.target.value; if (v === "__custom__") { setFAgentCustom(true); setFAgent(""); } else { setFAgentCustom(false); setFAgent(v); } }}>
                    <option value="">— select agent —</option>
                    {AGENTS.map(a => <option key={a}>{a}</option>)}
                    <option value="__custom__">Custom…</option>
                  </select>
                  {fAgentCustom && <input className="fi" placeholder="Type agent name" value={fAgent} onChange={e => setFAgent(e.target.value)} />}

                  {targetSlot && (
                    <div className="tgtnote">
                      🎯 Targeting <b>{targetSlot.label}</b>
                      <button className="mini" onClick={() => setTargetSlot(null)}>clear</button>
                      {formInst && (Math.abs(+formInst - +new Date(targetSlot.iso)) >= 30 * 60000
                        ? <div className="tgtwarn">⚠ This lands at {istClock(formInst)} IST, {istDay(formInst)} — not the slot you picked.</div>
                        : <div className="tgtok">✓ Lands in the targeted slot.</div>)}
                    </div>
                  )}

                  {formInst && (
                    <div className="conv">
                      Patient: <b>{localTime12}</b>, {localDateLabel}<br />
                      IST: <b>{istClock(formInst)}, {istDay(formInst)}</b>
                      {istKey(formInst) !== istKeyFromDate(fDate) && <span className="daynote"> · next-day IST</span>}
                    </div>
                  )}
                  {generatedMsg && (
                    <div className="msgbox">
                      <div className="msgbox-h">Generated message<button className="mini" onClick={() => openCopyText(generatedMsg.replace("[paste link]", fLink || ""))}>Copy</button></div>
                      <pre>{generatedMsg.replace("[paste link]", fLink || "")}</pre>
                    </div>
                  )}
                  <button className="primary" onClick={addFromForm}>＋ Create &amp; add to board</button>
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="bd">
                  <textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder={"Paste a confirmation message…\n\nTele-Consultation Confirmation – Sample Patient\n📅 Date: 18 Jun 2026\n⏰ Time: 6:00 PM (Pacific Time)\n🔗 Meeting Link: https://meet.google.com/..."} />
                  <button className="primary" onClick={addFromPaste}>＋ Add to board</button>
                  <div className="hint">IST is always recomputed from the local time — a wrong IST in the message gets flagged and corrected automatically.</div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div className="card board">
            <div className="bdhd"><h2>Live board</h2><span className="ct">{appts.length} calls</span></div>
            <div className="bd">
              {alerts.length > 0 && <div className="alerts">{alerts.map(([t, m], i) => <div key={i} className={"alert " + (t === "err" ? "aerr" : "awarn")}>{m}</div>)}</div>}
              {!appts.length ? (
                <div className="empty"><div className="big">🗓️</div><p>No calls yet. Create one on the left, paste a message, or load the sample data:</p><button className="primary2" style={{ marginTop: 12 }} onClick={() => setAppts(makeSample())}>Load sample data (8 fictional calls)</button></div>
              ) : (() => {
                const renderRow = (a, key, cls) => {
                  const inst = new Date(a.istInstant);
                  const sameDay = istKey(inst) === istKey(nowDate);
                  const mins = Math.round((inst - nowDate) / 60000);
                  let when = "";
                  if (key === "now") when = mins <= 0 ? "← ON NOW" : `in ${mins} min`;
                  else if (key === "soon") when = `in ${Math.floor(mins / 60) ? Math.floor(mins / 60) + "h " : ""}${mins % 60}min`;
                  return (
                    <div key={a.id} className={`row r-${cls} ${hardClash.has(a.id) ? "clash" : ""}`}>
                      <div className="tcol">
                        <div className={`tb tb-${cls}`}>{istClock(inst)}{!sameDay && <div className="tbsub">{istDay(inst)}</div>}</div>
                        <div className="trtmini">🏥 {clinicClock(inst)}{clinicKey(inst) !== istKey(inst) && <span> {clinicDay(inst)}</span>}</div>
                      </div>
                      <div className="who">
                        <div className="nm">{a.name}
                          {a.outcome && <span className={`pill p-${a.outcome}`}>{outcomeLabel(a.outcome)}</span>}
                          {a.rebookedFromId && <span className="pill p-rebook">REBOOK</span>}
                          {a.realigned && <span className="pill p-rel">REALIGNED</span>}
                          {a.claimedMismatch && <span className="pill p-fix">IST FIXED</span>}
                          {hardClash.has(a.id) && <span className="pill p-clash">CLASH</span>}
                          {softOverlap.has(a.id) && <span className="pill p-soft">OVERLAP</span>}
                        </div>
                        <div className="lc">{a.localTime}{a.localDateLabel ? " · " + a.localDateLabel + " (patient)" : ""}</div>
                        {a.link && <a className="lk" href={a.link} target="_blank" rel="noopener">{a.link.replace("https://", "")}</a>}
                        {a.realigned && a.history?.length > 0 && <div className="was">was {istClock(new Date(a.history[a.history.length - 1].ist))} IST</div>}
                        {a.rebookedFromId && a.rebookFromIst && <div className="was">rebook of {istClock(new Date(a.rebookFromIst))} {istDay(new Date(a.rebookFromIst))} IST{a.rebookReason ? ` (${outcomeLabel(a.rebookReason)})` : ""}</div>}
                        {a.rebookedToId && a.rebookToIst && <div className="was">rebooked → {istClock(new Date(a.rebookToIst))} {istDay(new Date(a.rebookToIst))} IST</div>}
                      </div>
                      <div className="meta">
                        {when && <div className="rel">{when}</div>}
                        {(() => {
                          const isCustomA = customAgent[a.id] || (a.agent && !AGENTS.includes(a.agent));
                          return (
                            <div className="closerwrap">
                              <select className="agsel" value={isCustomA ? "__custom__" : (a.agent || "")} onChange={e => chooseAgent(a.id, e.target.value)}>
                                <option value="">— booked by —</option>
                                {AGENTS.map(x => <option key={x}>{x}</option>)}
                                <option value="__custom__">Custom…</option>
                              </select>
                              {isCustomA && <input className="custin" placeholder="type name" value={a.agent || ""} onChange={e => setRowAgent(a.id, e.target.value)} />}
                            </div>
                          );
                        })()}
                        {(() => {
                          const isCustom = customCloser[a.id] || (a.closer && !CLOSERS.includes(a.closer));
                          return (
                            <div className="closerwrap">
                              <select className="agsel" value={isCustom ? "__custom__" : (a.closer || "")} onChange={e => chooseCloser(a.id, e.target.value)}>
                                <option value="">— owner —</option>
                                {CLOSERS.map(x => <option key={x}>{x}</option>)}
                                <option value="__custom__">Custom…</option>
                              </select>
                              {isCustom && <input className="custin" placeholder="type name" value={a.closer || ""} onChange={e => setRowCloser(a.id, e.target.value)} />}
                            </div>
                          );
                        })()}
                        <select className="agsel outsel" value={a.outcome || ""} onChange={e => setRowOutcome(a.id, e.target.value)}>
                          <option value="">— status —</option>
                          {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <div className="acts">
                          <button className="del" onClick={() => openCopyText(buildMessageFromRecord(a))}>copy msg</button>
                          {(a.outcome === "realigned" || a.outcome === "noshow") && !a.rebookedToId && <button className="del rebk" onClick={() => openRebook(a)}>rebook</button>}
                          <button className="del" onClick={() => openEdit(a)}>edit</button>
                          <button className="del" onClick={() => removeRow(a.id)}>remove</button>
                        </div>
                      </div>
                    </div>
                  );
                };
                return (
                  <>
                    {byStatus.rebook.length > 0 && (
                      <div className="seg segRebook">
                        <div className="segh rebookh">⟳ Needs rebooking<span className="ct sm">{byStatus.rebook.length}</span></div>
                        {byStatus.rebook.map(a => renderRow(a, "rebook", "rebook"))}
                      </div>
                    )}
                    {ACTIVE_SEGMENTS.map(([key, title, cls]) => {
                      const items = byStatus[key]; if (!items.length) return null;
                      return (
                        <div className="seg" key={key}>
                          <div className="segh">{title}<span className="ct sm">{items.length}</span></div>
                          {items.map(a => renderRow(a, key, cls))}
                        </div>
                      );
                    })}
                    {byStatus.done.length > 0 && (
                      <div className="seg">
                        <button className="doneToggle" onClick={() => setShowDone(v => !v)}>
                          ✅ Done &amp; closed <span className="ct sm">{byStatus.done.length}</span>
                          <span className="doneChev">{showDone ? "Hide ▲" : "Show ▼"}</span>
                        </button>
                        {showDone && byStatus.done.map(a => renderRow(a, "done", "done"))}
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="foot">
                <button className="ghost" onClick={openCopy}>📋 Copy board summary</button>
                <button className="ghost" onClick={openExcel}>📊 Copy for Excel</button>
                <button className="ghost" onClick={openExport}>⬇ Export (backup)</button>
                <button className="ghost" onClick={openImport}>⬆ Import</button>
                <button className="danger" onClick={resetAll}>Reset</button>
              </div>
            </div>
          </div>
        </div>}

        {view === "analytics" && <div className="analytics">
          <div className="afilters">
            <div className="afield"><label>Date (IST)</label>
              <select value={aDate} onChange={e => setADate(e.target.value)}>
                <option value="all">All dates</option>
                {analytics.dates.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
            <div className="afield"><label>Booked by</label>
              <select value={aOwner} onChange={e => setAOwner(e.target.value)}>
                <option value="all">All owners</option>
                {AGENTS.map(x => <option key={x}>{x}</option>)}
                {[...new Set(appts.map(a => a.agent).filter(x => x && !AGENTS.includes(x)))].sort().map(x => <option key={x}>{x}</option>)}
                <option value="Unassigned">Unassigned</option>
              </select>
            </div>
            <div className="afield"><label>Outcome (chart)</label>
              <select value={aOutcome} onChange={e => setAOutcome(e.target.value)}>
                <option value="all">All outcomes</option>
                <option value="done">Done</option>
                <option value="realigned">Realigned</option>
                <option value="noshow">No-show</option>
              </select>
            </div>
          </div>

          <div className="kpis">
            <div className="kpi"><div className="kn">{analytics.totals.aligned}</div><div className="kl">Aligned</div></div>
            <div className="kpi kp-done"><div className="kn">{analytics.totals.happened}</div><div className="kl">Happened</div></div>
            <div className="kpi kp-real"><div className="kn">{analytics.totals.realigned}</div><div className="kl">Realigned</div></div>
            <div className="kpi kp-no"><div className="kn">{analytics.totals.noshow}</div><div className="kl">No-show</div></div>
            {analytics.totals.unmarked > 0 && <div className="kpi kp-un"><div className="kn">{analytics.totals.unmarked}</div><div className="kl">Not yet marked</div></div>}
          </div>

          <div className="acard">
            <div className="acard-h">Calls by booking agent{aDate !== "all" ? ` · ${(analytics.dates.find(d => d.key === aDate) || {}).label || ""}` : " · all dates"}</div>
            <table className="atable">
              <thead><tr><th>Booked by</th><th>Aligned</th><th>Happened</th><th>Realigned</th><th>No-show</th><th>Not marked</th></tr></thead>
              <tbody>
                {analytics.rows.length === 0 && <tr><td colSpan="6" className="aempty">No calls for this filter.</td></tr>}
                {analytics.rows.map(r => (
                  <tr key={r.owner}><td>{r.owner}</td><td>{r.aligned}</td><td className="c-done">{r.happened || ""}</td><td className="c-real">{r.realigned || ""}</td><td className="c-no">{r.noshow || ""}</td><td className="c-un">{r.unmarked || ""}</td></tr>
                ))}
                {analytics.rows.length > 0 && <tr className="atotal"><td>{analytics.totals.owner}</td><td>{analytics.totals.aligned}</td><td>{analytics.totals.happened}</td><td>{analytics.totals.realigned}</td><td>{analytics.totals.noshow}</td><td>{analytics.totals.unmarked}</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="acard">
            <div className="acard-h">Busiest times · IST hour{aOutcome !== "all" ? ` · ${outcomeLabel(aOutcome)} only` : ""}</div>
            {analytics.hours.length === 0 ? <div className="aempty">No calls for this filter.</div> : (
              <div className="hbars">
                {analytics.hours.map(r => {
                  const label = `${((r.h + 11) % 12) + 1} ${r.h < 12 ? "AM" : "PM"}`;
                  const pct = Math.round((r.total / analytics.maxH) * 100);
                  const nspct = r.total ? Math.round((r.noshow / r.total) * 100) : 0;
                  return (
                    <div className="hrow" key={r.h}>
                      <div className="hlabel">{label}</div>
                      <div className="htrack"><div className="hfill" style={{ width: pct + "%" }}><div className="hns" style={{ width: nspct + "%" }} /></div></div>
                      <div className="hval">{r.total}{r.noshow ? <span className="hnsv"> · {r.noshow} no-show</span> : null}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="alegend"><span className="lg lg-t" /> calls <span className="lg lg-n" /> no-shows</div>
          </div>
        </div>}

        {view === "calendar" && <div className="analytics">
          <div className="afilters">
            <div className="afield"><label>Day (IST)</label>
              <select value={calendar.day} onChange={e => setCalDay(e.target.value)}>
                {calendar.days.map(d => <option key={d.key} value={d.key}>{d.label}{d.key === istKey(nowDate) ? " · today" : ""}</option>)}
              </select>
            </div>
            <div className="callegend">
              <span className="cl cl-free" /> free
              <span className="cl cl-1" /> 1 call
              <span className="cl cl-2" /> 2 calls
              <span className="cl cl-3" /> 3+
              <span className="cl cl-x" /> same link (clash)
            </div>
          </div>

          <div className="acard">
            <div className="acard-h">Day grid · 30-minute slots · IST (clinic time below) — click a free slot to book it</div>
            <div className="calgrid">
              {calendar.cols.map((col, ci) => (
                <div className="calcol" key={ci}>
                  {col.map(idx => {
                    const s = calendar.slots[idx];
                    const n = s ? s.active.length : 0;
                    const inst = slotInstant(calendar.day, idx);
                    const past = s ? s.calls.length - n : 0;
                    const cls = s && s.collision ? "sx" : n >= 3 ? "s3" : n === 2 ? "s2" : n === 1 ? "s1" : "s0";
                    return (
                      <div key={idx} className={"slot " + cls} onClick={() => n === 0 && pickSlot(idx)} title={n === 0 ? "Click to book this slot" : ""}>
                        <div className="sltime">
                          <span className="slist">{istClock(inst)}</span>
                          <span className="sltrt">{clinicClock(inst)}</span>
                        </div>
                        <div className="slbody">
                          {n === 0 && past === 0 && <span className="slfree">free</span>}
                          {n === 0 && past > 0 && <span className="slpast">{past} closed · free</span>}
                          {n > 0 && (
                            <>
                              <div className="slcount">{n} call{n > 1 ? "s" : ""}{s.collision && <span className="slclash">same link</span>}</div>
                              {s.active.map(a => <div className="slname" key={a.id}>{a.name}<span className="sllink">{a.link ? a.link.replace(/^https?:\/\/meet\.google\.com\//, "") : "no link"}</span></div>)}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>}
        {view === "finder" && (() => {
          if (!sfDate) return <div className="analytics"><div className="acard">Pick a date to search.</div></div>;
          const slots = findSlots(sfDate, sfZone, sfDest, sfWin);
          const ranges = groupRanges(slots);
          const hrs = slots.length * 0.5;
          const tier = hrs >= 4 ? "g" : hrs >= 1 ? "a" : "r";
          const tierTxt = hrs >= 4 ? "Green · workable" : hrs >= 1 ? "Amber · tight" : "Red · no usable window";
          const destRows = DESTS.map(([l, z]) => [l, findSlots(sfDate, sfZone, z, sfWin).length * 0.5]);
          const yr = new Date(sfDate + "T00:00:00Z").getUTCFullYear() || 2026;
          const months = MONTH_ABBR.map((m, i) => [m, findSlots(`${yr}-${String(i + 1).padStart(2, "0")}-15`, sfZone, sfDest, sfWin).length * 0.5]);
          const mx = Math.max(1, ...months.map(x => x[1]));
          const setW = (k, idx, v) => { setSfPreset("Custom"); setSfWin(w => ({ ...w, [k]: idx === 0 ? [Number(v), w[k][1]] : [w[k][0], Number(v)] })); };
          const pickPreset = (n) => { setSfPreset(n); setSfWin(PRESETS[n]); };
          const bookSlot = (t) => {
            const lp = localParts(t.toISOString(), sfZone);
            setFZone(sfZone); setFDate(lp.date); setFHour(lp.hour); setFMin(lp.min); setFMer(lp.mer);
            setTargetSlot(null); setView("board"); setMode("form");
            showToast("Prefilled from Slot Finder. Add the patient name and link.");
          };
          const fmt = (t, z) => { const lp = localParts(t.toISOString(), z); return `${lp.hour}:${lp.min} ${lp.mer}`; };
          const winInput = (label, k) => (
            <div className="afield"><label>{label} (local hours)</label>
              <div className="sfwin">
                <input type="number" min="0" max="24" value={sfWin[k][0]} onChange={e => setW(k, 0, e.target.value)} />
                <span>to</span>
                <input type="number" min="0" max="24" value={sfWin[k][1]} onChange={e => setW(k, 1, e.target.value)} />
              </div>
            </div>
          );
          return (
            <div className="analytics">
              <div className="afilters">
                <div className="afield"><label>Patient timezone</label>
                  <select value={sfZone} onChange={e => setSfZone(e.target.value)}>
                    {TZ_GROUPS.map(([g, opts]) => <optgroup key={g} label={g}>{opts.map(([l, z]) => <option key={z} value={z}>{l}</option>)}</optgroup>)}
                  </select>
                </div>
                <div className="afield"><label>Destination clinic</label>
                  <select value={sfDest} onChange={e => setSfDest(e.target.value)}>
                    {DESTS.map(([l, z]) => <option key={z} value={z}>{l}</option>)}
                  </select>
                </div>
                <div className="afield"><label>Date (IST day)</label>
                  <input type="date" value={sfDate} onChange={e => setSfDate(e.target.value)} className="sfdate" />
                </div>
              </div>

              <div className="afilters">
                <div className="afield"><label>Working-hour preset</label>
                  <div className="sfpresets">
                    {Object.keys(PRESETS).map(n => <button key={n} className={"vtab" + (sfPreset === n ? " on" : "")} onClick={() => pickPreset(n)}>{n}</button>)}
                    {sfPreset === "Custom" && <button className="vtab on">Custom</button>}
                  </div>
                </div>
                {winInput("Patient", "p")}
                {winInput("India team", "i")}
                {winInput("Clinic", "c")}
              </div>

              <div className="kpis">
                <div className={"kpi sf-" + tier}><div className="kn">{hrs.toFixed(1)}h</div><div className="kl">Feasible on this date · {tierTxt}</div></div>
                <div className="kpi"><div className="kn">{ranges.length}</div><div className="kl">Separate windows</div></div>
              </div>

              <div className="acard">
                <div className="acard-h">Feasible windows · {ZONE_LABEL[sfZone] || sfZone} → {(DESTS.find(d => d[1] === sfDest) || [sfDest])[0]}</div>
                {ranges.length === 0 ? (
                  <div className="aempty">No time exists when the patient, the India team and the clinic are all inside their windows on this date. Try the Relaxed preset, another destination (table below), or an asynchronous first step.</div>
                ) : ranges.map((r, i) => {
                  const a = r[0], b = new Date(+r[r.length - 1] + 30 * 60000);
                  return (
                    <div className="sfrange" key={i}>
                      <div className="sfline"><b>IST</b> {istClock(a)} to {istClock(b)}<span className="sfsep">|</span><b>Patient</b> {fmt(a, sfZone)} to {fmt(b, sfZone)} {tzAbbr(sfZone, a)}<span className="sfsep">|</span><b>Clinic</b> {fmt(a, sfDest)} to {fmt(b, sfDest)}</div>
                      <div className="sfchips">
                        {r.map(t => <button key={+t} className="sfchip" title="Book this slot" onClick={() => bookSlot(t)}>{fmt(t, sfZone)}</button>)}
                      </div>
                    </div>
                  );
                })}
                {ranges.length > 0 && <div className="hint">Click a time (shown in the patient's local time) to prefill a booking.</div>}
              </div>

              <div className="acard">
                <div className="acard-h">Same patient timezone, all destinations · this date</div>
                <table className="atable">
                  <thead><tr><th>Destination</th><th>Feasible hours</th><th>Status</th></tr></thead>
                  <tbody>
                    {destRows.map(([l, h]) => (
                      <tr key={l}><td>{l}</td><td>{h.toFixed(1)}</td><td className={h >= 4 ? "c-done" : h >= 1 ? "c-un" : "c-no"}>{h >= 4 ? "Green" : h >= 1 ? "Amber" : "Red"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="acard">
                <div className="acard-h">Seasonal view · 15th of each month, same pair and hours (shows daylight-saving shifts)</div>
                <div className="hbars">
                  {months.map(([m, h]) => (
                    <div className="hrow" key={m}>
                      <div className="hlabel">{m}</div>
                      <div className="htrack"><div className="hfill" style={{ width: Math.round((h / mx) * 100) + "%" }} /></div>
                      <div className="hval">{h.toFixed(1)}h</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
        {modal && (
          <div className="ov" onClick={() => setModal(null)}>
            <div className="mod" onClick={e => e.stopPropagation()}>
              {(modal.type === "edit" || modal.type === "rebook") ? (
                <>
                  <div className="modh">{modal.type === "rebook" ? "Rebook call — set the new date & time" : "Edit call"}</div>
                  <label className="fl">Patient name</label>
                  <input className="fi" value={modal.name} onChange={e => setMF("name", e.target.value)} />
                  <label className="fl">Patient date</label>
                  <input className="fi" type="date" value={modal.date} onChange={e => setMF("date", e.target.value)} />
                  <label className="fl">Patient time</label>
                  <div className="time3">
                    <select className="fi" value={modal.hour} onChange={e => setMF("hour", e.target.value)}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h}>{h}</option>)}
                    </select>
                    <select className="fi" value={modal.min} onChange={e => setMF("min", e.target.value)}>
                      {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(m => <option key={m}>{m}</option>)}
                    </select>
                    <select className="fi" value={modal.mer} onChange={e => setMF("mer", e.target.value)}>
                      <option>AM</option><option>PM</option>
                    </select>
                  </div>
                  <label className="fl">Patient timezone</label>
                  <select className="fi" value={modal.zone} onChange={e => setMF("zone", e.target.value)}>
                    {TZ_GROUPS.map(([g, opts]) => <optgroup key={g} label={g}>{opts.map(([l, z]) => <option key={z} value={z}>{l}</option>)}</optgroup>)}
                  </select>
                  <label className="fl">Meeting link</label>
                  <input className="fi" value={modal.link} onChange={e => setMF("link", e.target.value)} />
                  <label className="fl">Booked by</label>
                  <select className="fi" value={(mAgentCustom || (modal.agent && !AGENTS.includes(modal.agent))) ? "__custom__" : modal.agent} onChange={e => { const v = e.target.value; if (v === "__custom__") { setMAgentCustom(true); setMF("agent", ""); } else { setMAgentCustom(false); setMF("agent", v); } }}>
                    <option value="">— select agent —</option>{AGENTS.map(a => <option key={a}>{a}</option>)}
                    <option value="__custom__">Custom…</option>
                  </select>
                  {(mAgentCustom || (modal.agent && !AGENTS.includes(modal.agent))) && <input className="fi" placeholder="Type agent name" value={modal.agent} onChange={e => setMF("agent", e.target.value)} />}
                  <div className="modf"><button className="ghost" onClick={() => setModal(null)}>Cancel</button><button className="primary2" onClick={modal.type === "rebook" ? saveRebook : saveEdit}>{modal.type === "rebook" ? "Rebook & get message" : "Save changes"}</button></div>
                </>
              ) : (
                <>
                  <div className="modh">{modal.type === "copy" ? "Copy for WhatsApp" : modal.type === "export" ? "Export — copy this and keep it safe" : "Import — paste board JSON"}</div>
                  <textarea id="modalTa" className="modta" readOnly={modal.type !== "import"} value={modal.text} placeholder={modal.type === "import" ? "Paste the exported JSON here…" : ""} onChange={e => setMF("text", e.target.value)} />
                  <div className="modf">
                    <button className="ghost" onClick={() => setModal(null)}>Close</button>
                    {modal.type === "import"
                      ? <button className="primary2" onClick={() => doImport(modal.text)}>Import</button>
                      : <button className="primary2" onClick={() => tryCopy(modal.text)}>Copy</button>}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

const DESTS = [["Turkey (Istanbul)", "Europe/Istanbul"], ["Mexico (Mexico City)", "America/Mexico_City"], ["Thailand (Bangkok)", "Asia/Bangkok"], ["South Korea (Seoul)", "Asia/Seoul"]];
const PRESETS = { Strict: { p: [9, 20], i: [9, 18], c: [9, 18] }, Standard: { p: [8, 21], i: [9, 21], c: [9, 18] }, Relaxed: { p: [7, 22], i: [8, 23], c: [8, 20] } };
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function hourFrac(date, zone) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false });
  const p = {}; f.formatToParts(date).forEach(x => (p[x.type] = x.value));
  return (+p.hour % 24) + (+p.minute) / 60;
}
const inWin = (h, w) => h >= w[0] && h < w[1];
// 30-minute start times, on the given IST calendar day, when patient, India team and clinic are all inside their windows (IANA, DST-safe).
function findSlots(dateStr, patientZone, clinicZone, win) {
  const [Y, M, D] = dateStr.split("-").map(Number);
  const out = [];
  for (let k = 0; k < 48; k++) {
    const t = zonedToUtc(Y, M, D, Math.floor(k / 2), (k % 2) * 30, "Asia/Kolkata");
    if (inWin(hourFrac(t, patientZone), win.p) && inWin(hourFrac(t, "Asia/Kolkata"), win.i) && inWin(hourFrac(t, clinicZone), win.c)) out.push(t);
  }
  return out;
}
function groupRanges(slots) {
  const groups = [];
  slots.forEach(t => {
    const g = groups[groups.length - 1];
    if (g && +t - +g[g.length - 1] === 30 * 60000) g.push(t); else groups.push([t]);
  });
  return groups;
}

function istKeyFromDate(d) { if (!d) return ""; const [Y, M, D] = d.split("-").map(Number); return `${Y}-${String(M).padStart(2, "0")}-${String(D).padStart(2, "0")}`; }
function localParts(iso, zone) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = {}; f.formatToParts(new Date(iso)).forEach(x => (p[x.type] = x.value));
  let h = +p.hour % 24; const mer = h < 12 ? "AM" : "PM"; let h12 = h % 12; if (h12 === 0) h12 = 12;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: String(h12), min: p.minute, mer };
}

/* ====================== CSS ====================== */
const CSS = `
.app{--navy:#0d1f3c;--teal:#1a9e96;--teal-d:#13837c;--bg:#eef1f4;--panel:#fff;--ink:#1f2937;--muted:#6b7280;--line:#e3e7ec;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--ink);min-height:100vh;font-size:14px;line-height:1.5}
.app *{box-sizing:border-box}
.top{background:var(--navy);color:#fff;padding:16px 22px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px}
.brand .mark{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--teal),var(--teal-d));display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px}
.brand h1{font-size:17px;font-weight:700;margin:0}
.brand .sub{font-size:11px;color:rgba(255,255,255,.55);letter-spacing:.08em;text-transform:uppercase;font-weight:600}
.clock{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 12px}
.clock label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.55);font-weight:700}
.clock input{background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:7px;padding:6px 8px;font-size:13px;font-family:inherit}
.clock .live{display:flex;align-items:center;gap:7px;font-size:14px;color:var(--teal);font-weight:700}
.pulse{width:8px;height:8px;border-radius:50%;background:var(--teal);animation:p 1.6s infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:.35}}
.clActions{display:flex;flex-direction:column;gap:4px;align-items:flex-end}
.clToggle{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:11px;padding:5px 9px;border-radius:7px;font-weight:600;cursor:pointer}
.clWtb{font-size:10px;color:rgba(255,255,255,.5);text-decoration:none}
.wrap{max-width:1080px;margin:0 auto;padding:20px 18px 60px;display:grid;grid-template-columns:380px 1fr;gap:18px;align-items:start}
.signin{max-width:1044px;margin:14px auto 0;background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.signin-msg{font-size:13px;color:#92400e;line-height:1.5;flex:1;min-width:240px}
.signin-btn{background:#0d1f3c;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 16px;border-radius:9px;white-space:nowrap}
.connected{max-width:1044px;margin:14px auto 0;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:8px 16px;font-size:12px;color:#166534;font-weight:600}
@media(max-width:860px){.wrap{grid-template-columns:1fr}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.card .bd{padding:16px}
.tabs{display:flex;gap:8px;margin-bottom:12px}
.tab{flex:1;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;font-family:inherit}
.tab.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.fl{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:12px 0 5px}
.fl:first-child{margin-top:0}
.fi{width:100%;border:1px solid var(--line);border-radius:9px;padding:9px 11px;font-size:13.5px;font-family:inherit;color:var(--ink);background:#fbfcfd}
.fi:focus{outline:none;border-color:var(--teal);box-shadow:0 0 0 3px rgba(26,158,150,.12)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.time3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
textarea.fi,textarea{width:100%;min-height:150px;border:1px solid var(--line);border-radius:10px;padding:12px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.6;resize:vertical;background:#fbfcfd;color:var(--ink)}
textarea:focus{outline:none;border-color:var(--teal);box-shadow:0 0 0 3px rgba(26,158,150,.12)}
.conv{margin-top:12px;background:#f0fdfa;border:1px solid #99e6df;border-radius:9px;padding:10px 12px;font-size:13px;color:var(--teal-d)}
.conv .daynote{color:#b45309;font-weight:600}
.msgbox{margin-top:12px;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.msgbox-h{display:flex;justify-content:space-between;align-items:center;background:#f7f9fb;padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.msgbox pre{margin:0;padding:12px;font-family:inherit;font-size:12.5px;white-space:pre-wrap;line-height:1.55;color:var(--ink);background:#fff}
.mini{background:var(--teal);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer}
button.primary{width:100%;margin-top:14px;background:var(--teal);color:#fff;border:none;border-radius:9px;padding:11px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit}
button.primary:hover{background:var(--teal-d)}
.hint{font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.5}
.board .bdhd{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line)}
.board h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--navy);margin:0}
.ct{background:#f3f4f6;color:var(--muted);border-radius:20px;padding:2px 9px;font-size:11px;font-weight:600}
.ct.sm{font-size:10px}
.alerts{display:flex;flex-direction:column;gap:7px;margin-bottom:10px}
.alert{border-radius:9px;padding:9px 12px;font-size:12px;font-weight:600;line-height:1.45}
.aerr{background:#fef2f2;color:#dc2626;border:1px solid #f7b4b4}
.awarn{background:#fffbeb;color:#d97706;border:1px solid #fcd9a0}
.seg{margin-top:14px}
.segh{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:0 2px 8px}
.doneToggle{width:100%;display:flex;align-items:center;gap:8px;background:#f4f6f8;border:1px solid var(--line);border-radius:9px;padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);cursor:pointer;font-family:inherit;margin-bottom:8px}
.doneToggle:hover{background:#eef1f4}
.doneChev{margin-left:auto;font-size:11px;color:var(--teal)}
.row{border-radius:11px;padding:11px 13px;margin-bottom:7px;border:1px solid var(--line);display:grid;grid-template-columns:88px 1fr auto;gap:12px;align-items:center}
.tcol{display:flex;flex-direction:column;gap:4px}
.trtmini{font-size:10px;color:var(--muted);text-align:center;line-height:1.2}
.r-done{background:#f4f6f8;opacity:.62}
.r-now{background:#fef2f2;border:2px solid #dc2626}
.r-soon{background:#fffbeb;border-color:#fcd9a0}
.r-today{background:#eff6ff;border-color:#c4d6f7}
.r-tmrw{background:#f6f3ff;border-color:#d6c9f5}
.row.clash{border:2px dashed #dc2626!important}
.tb{font-size:12px;font-weight:800;border-radius:20px;padding:5px 0;text-align:center}
.tbsub{font-size:9px;font-weight:600;opacity:.7}
.tb-done{background:#e6e9ee;color:#4b5563}
.tb-now{background:#fde0e0;color:#991b1b}
.tb-soon{background:#fdedd0;color:#92400e}
.tb-today{background:#dbeafe;color:#1e40af}
.tb-tmrw{background:#ede6fb;color:#5b21b6}
.who{min-width:0}
.who .nm{font-size:14.5px;font-weight:700;color:var(--navy);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.who .lc{font-size:12px;color:var(--muted);margin-top:2px}
.who .lk{font-size:11px;color:var(--teal);text-decoration:none;word-break:break-all;display:block;margin-top:3px}
.who .was{font-size:11px;color:#dc2626;margin-top:2px}
.meta{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.meta .rel{font-size:11px;color:#dc2626;font-weight:700}
.agsel{font-family:inherit;font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:3px 5px;background:#fff;max-width:130px}
.del{background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px}
.del:hover{color:#dc2626}
.acts{display:flex;gap:10px;justify-content:flex-end}
.pill{font-size:9px;font-weight:800;border-radius:10px;padding:2px 7px;letter-spacing:.03em}
.p-rel{background:#e0e7ff;color:#3730a3}
.p-fix{background:#fef3c7;color:#b45309}
.p-clash{background:#fde0e0;color:#991b1b}
.p-soft{background:#fef3c7;color:#92400e}
.p-done{background:#dcfce7;color:#166534}
.p-realigned{background:#dbeafe;color:#1e40af}
.p-noshow{background:#fee2e2;color:#991b1b}
.p-rebook{background:#cffafe;color:#155e75}
.outsel{margin-top:4px}
.closerwrap{display:flex;flex-direction:column;gap:4px;margin-top:4px}
.custin{font-family:inherit;font-size:12px;padding:5px 8px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink)}
.viewtabs{max-width:1044px;margin:14px auto 0;display:flex;gap:8px;padding:0 4px}
.vtab{font-family:inherit;font-size:13px;font-weight:600;padding:8px 16px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--muted);cursor:pointer}
.vtab.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.analytics{max-width:1044px;margin:14px auto 0;padding:0 4px 60px;display:flex;flex-direction:column;gap:16px}
.afilters{display:flex;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.afield{display:flex;flex-direction:column;gap:4px}
.afield label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}
.afield select{font-family:inherit;font-size:13px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);min-width:150px}
.kpis{display:flex;gap:12px;flex-wrap:wrap}
.kpi{flex:1;min-width:120px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;border-left:4px solid var(--navy)}
.kpi .kn{font-size:26px;font-weight:800;color:var(--navy);line-height:1}
.kpi .kl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;margin-top:6px}
.kp-done{border-left-color:#16a34a}.kp-done .kn{color:#166534}
.kp-real{border-left-color:#2563eb}.kp-real .kn{color:#1e40af}
.kp-no{border-left-color:#dc2626}.kp-no .kn{color:#991b1b}
.kp-un{border-left-color:#f59e0b}.kp-un .kn{color:#b45309}
.acard{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px}
.acard-h{font-size:13px;font-weight:700;color:var(--navy);margin-bottom:14px}
.atable{width:100%;border-collapse:collapse;font-size:13px}
.atable th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;padding:8px 10px;border-bottom:2px solid var(--line)}
.atable th:not(:first-child),.atable td:not(:first-child){text-align:center}
.atable td{padding:9px 10px;border-bottom:1px solid var(--line);font-weight:600}
.atable td:first-child{font-weight:600;color:var(--ink)}
.atable .c-done{color:#166534}.atable .c-real{color:#1e40af}.atable .c-no{color:#991b1b}.atable .c-un{color:#b45309}
.atable .atotal td{border-top:2px solid var(--line);border-bottom:none;font-weight:800;color:var(--navy);background:#f8fafc}
.aempty{color:var(--muted);font-size:13px;text-align:center;padding:18px}
.hbars{display:flex;flex-direction:column;gap:8px}
.hrow{display:flex;align-items:center;gap:12px}
.hlabel{width:58px;font-size:12px;font-weight:600;color:var(--muted);text-align:right;flex-shrink:0}
.htrack{flex:1;background:#f1f4f7;border-radius:6px;height:20px;overflow:hidden}
.hfill{height:100%;background:var(--teal);border-radius:6px;display:flex;justify-content:flex-end;min-width:2px}
.hns{height:100%;background:#dc2626}
.hval{width:130px;font-size:12px;font-weight:700;color:var(--ink);flex-shrink:0}
.hnsv{color:#dc2626;font-weight:600}
.alegend{margin-top:12px;font-size:11px;color:var(--muted);display:flex;align-items:center;gap:6px}
.lg{width:11px;height:11px;border-radius:3px;display:inline-block}.lg-t{background:var(--teal)}.lg-n{background:#dc2626;margin-left:10px}
.tgtnote{background:#eef6ff;border:1px solid #bfdbfe;border-radius:9px;padding:10px 12px;font-size:12px;color:#1e40af;margin-top:10px}
.tgtnote .mini{margin-left:8px}
.tgtwarn{margin-top:6px;color:#b45309;font-weight:600}
.tgtok{margin-top:6px;color:#166534;font-weight:600}
.callegend{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);margin-left:auto;align-self:flex-end;padding-bottom:6px;flex-wrap:wrap}
.cl{width:11px;height:11px;border-radius:3px;display:inline-block;margin-left:8px;border:1px solid var(--line)}
.cl-free{background:#fff}.cl-1{background:#fee2e2}.cl-2{background:#fca5a5}.cl-3{background:#f87171}.cl-x{background:#fff;border:2px solid #b91c1c}
.calgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.calcol{display:flex;flex-direction:column;gap:4px}
.slot{display:flex;gap:8px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;min-height:44px;background:#fff}
.slot.s0{cursor:pointer}
.slot.s0:hover{background:#f0fdfa;border-color:var(--teal)}
.slot.s1{background:#fee2e2}
.slot.s2{background:#fca5a5}
.slot.s3{background:#f87171}
.slot.sx{background:#fee2e2;border:2px solid #b91c1c}
.sltime{display:flex;flex-direction:column;flex-shrink:0;width:62px}
.slist{font-size:12px;font-weight:700;color:var(--navy)}
.sltrt{font-size:9px;color:var(--muted)}
.slbody{flex:1;min-width:0;font-size:11px}
.slfree{color:#94a3b8}
.slpast{color:#94a3b8;font-style:italic}
.slcount{font-weight:700;color:#7f1d1d;font-size:11px}
.slclash{background:#b91c1c;color:#fff;border-radius:4px;padding:0 5px;margin-left:6px;font-size:9px;font-weight:800}
.slname{color:var(--ink);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sllink{color:var(--muted);font-weight:400;margin-left:5px;font-size:10px}
@media(max-width:900px){.calgrid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.calgrid{grid-template-columns:1fr}}
.rebk{border-color:#f59e0b!important;color:#b45309!important;font-weight:600}
.rebookh{background:#fff7ed;color:#b45309;border-left:3px solid #f59e0b}
.segRebook{border:1px solid #fed7aa;border-radius:10px;padding:4px;margin-bottom:14px;background:#fffbf5}
.empty{text-align:center;padding:40px 20px;color:var(--muted)}
.empty .big{font-size:34px;margin-bottom:8px}
.foot{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;justify-content:flex-end}
.ghost{background:#fff;border:1px solid var(--line);color:var(--muted);border-radius:9px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.ghost:hover{border-color:var(--muted);color:var(--ink)}
.danger{background:#fff;border:1px solid #f7b4b4;color:#dc2626;border-radius:9px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--navy);color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:99}
.ov{position:fixed;inset:0;background:rgba(13,31,60,.45);display:flex;align-items:center;justify-content:center;padding:18px;z-index:80}
.mod{background:#fff;border-radius:14px;padding:18px;max-width:460px;width:100%;max-height:88vh;overflow:auto}
.modh{font-size:15px;font-weight:700;color:var(--navy);margin-bottom:6px}
.modta{width:100%;min-height:220px;border:1px solid var(--line);border-radius:9px;padding:11px;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.55;resize:vertical;background:#fbfcfd;color:var(--ink);margin-top:8px}
.modf{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.primary2{background:var(--teal);color:#fff;border:none;border-radius:9px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
.primary2:hover{background:var(--teal-d)}
.sfwin{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.sfwin input{width:58px;font-family:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
.sfdate{font-family:inherit;font-size:13px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
.sfpresets{display:flex;gap:6px}
.sfrange{border-top:1px solid var(--line);padding:10px 0}
.sfrange:first-of-type{border-top:none}
.sfline{font-size:13px;line-height:1.7}
.sfsep{color:#cbd5e1;margin:0 8px}
.sfchips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.sfchip{font-family:inherit;font-size:12px;font-weight:600;padding:5px 10px;border:1px solid #99e6df;background:#f0fdfa;color:var(--teal-d);border-radius:20px;cursor:pointer}
.sfchip:hover{background:var(--teal);color:#fff}
.kpi.sf-g{border-left-color:#16a34a}.kpi.sf-g .kn{color:#166534}
.kpi.sf-a{border-left-color:#f59e0b}.kpi.sf-a .kn{color:#b45309}
.kpi.sf-r{border-left-color:#dc2626}.kpi.sf-r .kn{color:#991b1b}
`;
