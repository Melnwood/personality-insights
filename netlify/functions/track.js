// E-Team Insight — development tracking save
//
// The most sensitive write in the app: named people rated on character by their
// leaders. So it re-authenticates on every call and requires EXECUTIVE (not the
// Data-Admin capability the profile editor uses). Author + date are stamped
// server-side from the authenticated user, so attribution can't be spoofed by
// the client.

const BASE_ID = "apppGh1toMfYP7NGK";
const ASSESS = "tblVTZNf2RDVg97r5";
const LEADERS = "tbl0q8SlBoLBqL5dB";

async function at(path, opts, token) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${body}`);
  return body ? JSON.parse(body) : {};
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  const TOKEN = process.env.AIRTABLE_TOKEN;
  if (!TOKEN) return { statusCode: 500, body: JSON.stringify({ error: "Server not configured. Set AIRTABLE_TOKEN in Netlify." }) };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (_) {}
  const login = String(body.login || "").trim();
  const password = String(body.password || "");

  try {
    const leaders = await at(
      `${LEADERS}?pageSize=100&fields%5B%5D=Login&fields%5B%5D=Password&fields%5B%5D=Active&fields%5B%5D=Executive&fields%5B%5D=Name`,
      { method: "GET" }, TOKEN);
    const me = leaders.records.find((r) => String((r.fields || {})["Login"] || "").trim().toLowerCase() === login.toLowerCase());
    const bad = { statusCode: 401, body: JSON.stringify({ error: "Name or password not recognised." }) };
    if (!me) return bad;
    const f = me.fields || {};
    if (String(f["Password"] || "") !== password) return bad;
    if (f["Active"] !== true) return { statusCode: 403, body: JSON.stringify({ error: "This account is not active." }) };
    if (f["Executive"] !== true) return { statusCode: 403, body: JSON.stringify({ error: "Development tracking is limited to the Executive Team." }) };

    if (!body.recordId) return { statusCode: 400, body: JSON.stringify({ error: "No person specified." }) };
    const meName = f["Name"] || login;
    const today = new Date().toISOString().slice(0, 10);

    // Stamp author server-side so attribution is trustworthy
    const trk = body.trk && typeof body.trk === "object" ? body.trk : {};
    trk.planAuthor = meName;
    if (Array.isArray(trk.history) && trk.history.length) {
      const last = trk.history[trk.history.length - 1];
      if (last && last._new) { last.by = meName; last.d = last.d || today; delete last._new; }
    }

    const fields = { "Dev Tracking": JSON.stringify(trk) };
    if (typeof body.plan === "string") fields["Development Plan"] = body.plan;
    if (typeof body.focus === "string") fields["Development Focus"] = body.focus;
    if (typeof body.growth === "string") fields["Growth Notes"] = body.growth;
    fields["Plan Updated"] = today;

    // Resilient write: if an optional field (plan/focus/growth/date) doesn't exist
    // in Airtable yet, strip it and retry — so the core tracking still saves. Only
    // "Dev Tracking" is truly required; it's never stripped.
    async function patchResilient(recordId, allFields) {
      let attempt = Object.assign({}, allFields);
      for (let i = 0; i < 6; i++) {
        try {
          return await at(ASSESS, { method: "PATCH", body: JSON.stringify({ records: [{ id: recordId, fields: attempt }], typecast: true }) }, TOKEN);
        } catch (e) {
          const m = String(e).match(/Unknown field name:[^A-Za-z]*([A-Za-z][A-Za-z ]*[A-Za-z])/i);
          const bad = m && m[1];
          if (bad && bad !== "Dev Tracking" && Object.prototype.hasOwnProperty.call(attempt, bad) && Object.keys(attempt).length > 1) {
            delete attempt[bad];
            continue;
          }
          throw e;
        }
      }
      throw new Error("Could not save after stripping unknown fields.");
    }
    const result = await patchResilient(body.recordId, fields);

    return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: true, id: result.records[0].id, by: meName, date: today }) };
  } catch (err) {
    const raw = String(err);
    let hint = "";
    if (/\b(401|403)\b/.test(raw) || /INVALID_PERMISSIONS|NOT_AUTHORIZED/i.test(raw))
      hint = "The Airtable token can read but not write. Add the data.records:write scope to your personal access token, then redeploy.";
    else if (/UNKNOWN_FIELD_NAME/i.test(raw))
      hint = "The 'Dev Tracking' field (long text) needs to be added to the Assessments table.";
    return { statusCode: 502, body: JSON.stringify({ error: hint || "Could not save tracking.", detail: raw }) };
  }
};
