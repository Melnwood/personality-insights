// E-Team Insight Dashboard — secure Airtable proxy
//
// Login is checked against the base's existing "Leaders" table:
//   Login + Password must match, Active must be ticked, Executive must be ticked.
// Everything happens server-side. An anonymous browser gets nothing.

const BASE_ID = "apppGh1toMfYP7NGK";
const ASSESSMENTS = "tblVTZNf2RDVg97r5";
const LEADERS = "tbl0q8SlBoLBqL5dB";

const FIELDS = [
  "Full Name", "Division", "Country", "Status",
  "Primary Personality", "Personality Under Pressure",
  "16P Type", "16P Identity",
  "WG Geniuses", "WG Competencies", "WG Frustrations",
  "CS 1", "CS 2", "CS 3", "CS 4", "CS 5",
  "SG 1", "SG 2", "SG 3",
  "Key Thread",
  "Leadership Set",
  // LivStyle traits — used by Role Fit scoring
  "Processing Blueprint: Intuitive", "Processing Blueprint: Concrete",
  "Processing Blueprint: Heart", "Processing Blueprint: Orderly",
  "Motivation Why: Activity", "Motivation Why: Affiliation", "Motivation Why: Power",
  "Motivation Why: Attainment",
  "Motivation How: Ideas", "Motivation How: Freedom", "Motivation How: Consistency",
  "Motivation How: Self-Affirmed", "Motivation How: Task Completion", "Motivation How: Prefers Process",
  "Conflict Mngmt: Collaborating", "Conflict Mngmt: Competing",
  "C.A.R.E. Mindset: Creative", "C.A.R.E. Mindset: Refining", "C.A.R.E. Mindset: Engaging",
];

// Airtable percent fields can come back as 0-1 or 0-100 depending on how they were
// imported. Normalise everything to 0-100.
const pct = (v) => {
  if (typeof v !== "number") return null;
  return v <= 1 ? Math.round(v * 100) : Math.round(v);
};
const TRAITS = {
  Intuitive: "Processing Blueprint: Intuitive",
  Concrete: "Processing Blueprint: Concrete",
  Heart: "Processing Blueprint: Heart",
  Orderly: "Processing Blueprint: Orderly",
  Activity: "Motivation Why: Activity",
  Affiliation: "Motivation Why: Affiliation",
  Power: "Motivation Why: Power",
  Attainment: "Motivation Why: Attainment",
  Ideas: "Motivation How: Ideas",
  Freedom: "Motivation How: Freedom",
  Consistency: "Motivation How: Consistency",
  "Self-Affirmed": "Motivation How: Self-Affirmed",
  "Task Completion": "Motivation How: Task Completion",
  "Prefers Process": "Motivation How: Prefers Process",
  Collaborating: "Conflict Mngmt: Collaborating",
  Competing: "Conflict Mngmt: Competing",
  Creative: "C.A.R.E. Mindset: Creative",
  Refining: "C.A.R.E. Mindset: Refining",
  Engaging: "C.A.R.E. Mindset: Engaging",
};

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

async function at(path, params, token) {
  const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${path}`);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else if (v != null) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const TOKEN = process.env.AIRTABLE_TOKEN;
  if (!TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured. Set AIRTABLE_TOKEN in Netlify." }) };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (_) {}

  const login = String(body.login || "").trim();
  const password = String(body.password || "");

  if (!login || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: "Enter your name and password." }) };
  }

  try {
    // ---- 1. Authenticate against the Leaders table ----
    const leaders = await at(LEADERS, {
      pageSize: 100,
      "fields[]": ["Name", "Login", "Password", "Active", "Executive", "Data Admin", "Role"],
    }, TOKEN);

    const me = leaders.records.find((r) => {
      const f = r.fields || {};
      const l = String(f["Login"] || "").trim().toLowerCase();
      return l && l === login.toLowerCase();
    });

    // Same message whether the name is unknown or the password is wrong —
    // don't reveal which leaders exist.
    const bad = { statusCode: 401, body: JSON.stringify({ error: "Name or password not recognised." }) };
    if (!me) return bad;

    const f = me.fields || {};
    if (String(f["Password"] || "") !== password) return bad;
    if (f["Active"] !== true) {
      return { statusCode: 403, body: JSON.stringify({ error: "This account is not active." }) };
    }
    const isExec = f["Executive"] === true;
    const isAdmin = f["Data Admin"] === true;
    if (!isExec && !isAdmin) {
      return { statusCode: 403, body: JSON.stringify({ error: "This dashboard is limited to the Executive Team." }) };
    }

    // ---- 2. Authenticated. Load the roster. ----
    const people = [];
    let offset;
    do {
      const data = await at(ASSESSMENTS, { pageSize: 100, "fields[]": FIELDS, offset }, TOKEN);
      data.records.forEach((r) => {
        const x = r.fields || {};
        const name = x["Full Name"];
        if (!name) return;
        people.push({
          id: r.id,
          n: name,
          g: x["Division"] || x["Country"] || "Unassigned",
          dv: x["Division"] || "",
          co: x["Country"] || "",
          st: x["Status"] || "",
          lead: x["Leadership Set"] === true,
          lp: x["Primary Personality"] || "",
          lu: x["Personality Under Pressure"] || "",
          t: x["16P Type"] || "",
          id16: x["16P Identity"] || "",
          wg: asArray(x["WG Geniuses"]),
          wgc: asArray(x["WG Competencies"]),
          wgf: asArray(x["WG Frustrations"]),
          cs: ["CS 1", "CS 2", "CS 3", "CS 4", "CS 5"].map((k) => x[k]).filter(Boolean),
          sg: ["SG 1", "SG 2", "SG 3"].map((k) => x[k]).filter(Boolean),
          kt: x["Key Thread"] || "",
          tr: Object.fromEntries(Object.entries(TRAITS).map(([k, f]) => [k, pct(x[f])]).filter(e => e[1] !== null)),
        });
      });
      offset = data.offset;
    } while (offset);

    people.sort((a, b) => a.n.localeCompare(b.n));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        people,
        who: { name: f["Name"] || login, role: f["Role"] || "", exec: isExec, admin: isAdmin },
        fetched: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Could not reach Airtable.", detail: String(err) }) };
  }
};
