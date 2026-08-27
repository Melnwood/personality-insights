// E-Team Insight Dashboard — save endpoint
//
// Creates or updates a person's assessment profile.
// Re-authenticates against the Leaders table on EVERY write and requires Data Admin.
// The browser is never trusted to say who it is.

const BASE_ID = "apppGh1toMfYP7NGK";
const ASSESSMENTS = "tblVTZNf2RDVg97r5";
const LEADERS = "tbl0q8SlBoLBqL5dB";

// The only fields this endpoint is ever allowed to write. Anything else in the
// request body is ignored — so a tampered browser can't reach into the rest of the base.
const WRITABLE = new Set([
  "Full Name", "Email", "Country", "Division", "Status",
  "Primary Personality", "Personality Under Pressure",
  "16P Type", "16P Identity",
  "WG Geniuses", "WG Competencies", "WG Frustrations",
  "CS 1", "CS 2", "CS 3", "CS 4", "CS 5",
  "SG 1", "SG 2", "SG 3", "SG Test",
  "Key Thread",
  "Leadership Set",
  "Development Focus", "Development Plan", "Growth Notes", "Plan Updated",
]);

async function at(path, opts, token) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${body}`);
  return JSON.parse(body);
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

  try {
    // ---- Authenticate, every single time ----
    const leaders = await at(
      `${LEADERS}?pageSize=100&fields%5B%5D=Login&fields%5B%5D=Password&fields%5B%5D=Active&fields%5B%5D=Data%20Admin&fields%5B%5D=Name`,
      { method: "GET" },
      TOKEN
    );

    const me = leaders.records.find((r) => {
      const l = String((r.fields || {})["Login"] || "").trim().toLowerCase();
      return l && l === login.toLowerCase();
    });

    const bad = { statusCode: 401, body: JSON.stringify({ error: "Name or password not recognised." }) };
    if (!me) return bad;
    const f = me.fields || {};
    if (String(f["Password"] || "") !== password) return bad;
    if (f["Active"] !== true) return { statusCode: 403, body: JSON.stringify({ error: "This account is not active." }) };
    if (f["Data Admin"] !== true) {
      return { statusCode: 403, body: JSON.stringify({ error: "You don't have permission to edit profiles." }) };
    }

    // ---- Whitelist the fields ----
    const incoming = body.fields || {};
    const fields = {};
    Object.keys(incoming).forEach((k) => {
      if (!WRITABLE.has(k)) return;
      const v = incoming[k];
      if (v === "" || v === null || (Array.isArray(v) && !v.length)) {
        fields[k] = null; // explicit clear
      } else {
        fields[k] = v;
      }
    });

    if (!Object.keys(fields).length) {
      return { statusCode: 400, body: JSON.stringify({ error: "Nothing to save." }) };
    }

    // Stamp the plan date whenever any development-plan field is being saved,
    // so the E-team can see how current a plan is (staleness is a real risk).
    if (["Development Focus", "Development Plan", "Growth Notes"].some((k) => k in fields)) {
      fields["Plan Updated"] = new Date().toISOString().slice(0, 10);
    }

    // typecast lets Airtable accept a new single-select option (e.g. a new Country)
    // rather than rejecting the write.
    let result;
    if (body.recordId) {
      result = await at(ASSESSMENTS, {
        method: "PATCH",
        body: JSON.stringify({ records: [{ id: body.recordId, fields }], typecast: true }),
      }, TOKEN);
    } else {
      if (!fields["Full Name"]) {
        return { statusCode: 400, body: JSON.stringify({ error: "A new person needs a full name." }) };
      }
      result = await at(ASSESSMENTS, {
        method: "POST",
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      }, TOKEN);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: true, id: result.records[0].id, by: f["Name"] || login }),
    };
  } catch (err) {
    // Surface what Airtable actually said — a silent "could not save" is undebuggable.
    const raw = String(err);
    let hint = "";
    if (/\b(401|403)\b/.test(raw) || /INVALID_PERMISSIONS|NOT_AUTHORIZED/i.test(raw)) {
      hint = "The Airtable token can read but not write. Add the data.records:write scope to your personal access token, then redeploy.";
    } else if (/UNKNOWN_FIELD_NAME/i.test(raw)) {
      hint = "A field name in the app no longer matches the Airtable base.";
    } else if (/INVALID_MULTIPLE_CHOICE_OPTIONS|INVALID_VALUE_FOR_COLUMN/i.test(raw)) {
      hint = "One of the values isn't a valid option for that field in Airtable.";
    }
    return {
      statusCode: 502,
      body: JSON.stringify({ error: hint || "Could not save.", detail: raw }),
    };
  }
};
