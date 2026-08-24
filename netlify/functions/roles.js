// E-Team Insight Dashboard — role profile save/delete
//
// Re-authenticates against the Leaders table on every call and requires Executive.
// Role profiles are a placement tool, so they follow the insight-side permission,
// not the data-entry one.

const BASE_ID = "apppGh1toMfYP7NGK";
const ROLES = "tbldA0KVBqTSgaZPn";
const LEADERS = "tbl0q8SlBoLBqL5dB";

const DIALS = ["Drive", "People", "Structure", "Detail", "Vision", "Execution", "Autonomy"];
const LEVEL = { high: "High", med: "Medium", low: "Low" };
const GENIUSES = ["Wonder", "Invention", "Discernment", "Galvanizing", "Enablement", "Tenacity"];

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
  return body ? JSON.parse(body) : {};
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
    // ---- Authenticate ----
    const leaders = await at(
      `${LEADERS}?pageSize=100&fields%5B%5D=Login&fields%5B%5D=Password&fields%5B%5D=Active&fields%5B%5D=Executive&fields%5B%5D=Name`,
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
    if (f["Executive"] !== true) {
      return { statusCode: 403, body: JSON.stringify({ error: "Saving role profiles is limited to the Executive Team." }) };
    }

    // ---- Delete ----
    if (body.action === "delete") {
      if (!body.recordId) {
        return { statusCode: 400, body: JSON.stringify({ error: "Nothing to delete." }) };
      }
      await at(`${ROLES}/${body.recordId}`, { method: "DELETE" }, TOKEN);
      return { statusCode: 200, body: JSON.stringify({ ok: true, deleted: body.recordId }) };
    }

    // ---- Save ----
    const name = String(body.name || "").trim();
    if (!name) return { statusCode: 400, body: JSON.stringify({ error: "Give the role a name first." }) };

    const fields = {
      "Role Name": name,
      "Notes": String(body.notes || ""),
      "Saved By": f["Name"] || login,
    };
    DIALS.forEach((k) => {
      const v = (body.d || {})[k.toLowerCase()];
      fields[k] = LEVEL[v] || null;
    });
    fields["WG Needed"] = Array.isArray(body.wg) ? body.wg.filter((g) => GENIUSES.includes(g)) : [];

    let result;
    if (body.recordId) {
      result = await at(ROLES, {
        method: "PATCH",
        body: JSON.stringify({ records: [{ id: body.recordId, fields }] }),
      }, TOKEN);
    } else {
      result = await at(ROLES, {
        method: "POST",
        body: JSON.stringify({ records: [{ fields }] }),
      }, TOKEN);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: true, id: result.records[0].id }),
    };
  } catch (err) {
    const raw = String(err);
    let hint = "";
    if (/\b(401|403)\b/.test(raw) || /INVALID_PERMISSIONS|NOT_AUTHORIZED/i.test(raw)) {
      hint = "The Airtable token can read but not write. Add the data.records:write scope to your personal access token.";
    } else if (/TABLE_NOT_FOUND|NOT_FOUND/i.test(raw)) {
      hint = "The Role Profiles table wasn't found in the base.";
    }
    return { statusCode: 502, body: JSON.stringify({ error: hint || "Could not save the role.", detail: raw }) };
  }
};
