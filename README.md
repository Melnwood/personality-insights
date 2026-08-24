# E-Team Insight Dashboard

A login-gated dashboard for the Josiah Venture Executive Team, reading live from the
**LivStyle Personality Assessments** Airtable base.

- Base: `apppGh1toMfYP7NGK`
- Roster: `Assessments` (`tblVTZNf2RDVg97r5`)
- Logins: `Leaders` (`tbl0q8SlBoLBqL5dB`) — the same table your other dashboards use

---

## Deploy

1. Push this folder to a **private** GitHub repo (e.g. `Melnwood/eteam-insight`).
2. Netlify → **Add new site → Import an existing project** → pick the repo.
   No build command; publish directory is `.`.
3. Netlify → **Site configuration → Environment variables** → add **one** variable:

   | Key | Value |
   |---|---|
   | `AIRTABLE_TOKEN` | Airtable personal access token (`pat…`) with `data.records:read` on this base |

4. Deploy.

> There is **no site password to configure.** Logins live in Airtable (see below).
> If you see *"Server not configured"*, `AIRTABLE_TOKEN` is missing — add it and **redeploy**
> (Netlify only picks up env vars on a new build).

---

## Who can log in

Login is checked against the **`Leaders`** table. Everyone needs `Login`, `Password` and
`Active` — then **one of two capabilities** decides what they see:

| Capability | What they get |
|---|---|
| **`Executive`** | The full insight dashboard — people, compare, team reads, threads, role fit |
| **`Data Admin`** | The **Manage profiles** page — add and edit people's assessments |

They're independent. Tick both and you get both tabs.

- **Executive:** Dave Patty, Mel Ellenwood, Ben Williams
- **Data Admin:** Mel Ellenwood, and a row called **Executive Assistant** (login `assistant`,
  password `CHANGE-ME` — **change this before sharing it**)

**Someone with Data Admin but NOT Executive sees only the edit page.** No threads, no team
reads, no role fit. Your assistant can do all the data entry without reading the interpretive
synthesis about people.

Anyone in `Leaders` with neither capability — country leaders using your other dashboards —
is refused here with a clear message.

### Changing who has access
Tick / untick `Executive` or `Data Admin` in Airtable. Immediate, no redeploy.

### Setting someone's password
Type it into their `Password` cell. That *is* the password. To change it, change the cell.

---

## Manage profiles (Data Admin)

The **Manage profiles** tab lists everyone with a summary of which assessments are on file
(and flags anyone with none). Click a person to edit; or **+ Add a person** for someone new.

The form covers: name, division, status, leadership-set flag, LivStyle primary and
under-pressure, 16 Personalities, Working Genius (geniuses / competencies / frustrations),
CliftonStrengths top 5, Spiritual Gifts top 3, the Key Thread, and the thread motion.

Writes go through `save.js`, which **re-authenticates on every save** and refuses anyone
without `Data Admin`. It can only write the assessment fields listed in its whitelist — a
tampered browser cannot reach the rest of the base.

> **The Airtable token needs write access for this.** When you create the token, add the
> `data.records:write` scope alongside `data.records:read`. Read-only will load the dashboard
> fine and then fail on save.

---

## A note on the passwords

Passwords sit in plain text in the `Password` column, which is the pattern your other
dashboards already use. That's a reasonable trade-off for a small internal tool — but it does
mean **anyone with edit access to this Airtable base can read the executives' passwords**,
and this dashboard exposes the most personal data JV holds on its people.

Two things worth doing:
- Make sure the executives don't reuse a password here that they use anywhere else.
- Keep base collaborators tight; check who has access to the base itself.

If you'd rather, this can be upgraded to hashed passwords later — say the word.

---

## The two views

A toggle under the title switches between:

- **Leadership set** — the people ticked in `Leadership Set` on the Assessments table
  (currently 45, with full multi-framework profiles and Key Threads).
- **Everyone** — all staff. Most show LivStyle only, with honest "not on file yet"
  placeholders — which doubles as a coverage map of who still owes assessments.
  Leadership-set people carry a gold ★ so they stay findable.

Tick / untick `Leadership Set` in Airtable to change who's in the first group.

---

## Role fit

The **Role fit** tab reverses the dashboard: instead of reading a person, you describe a
*role* and everyone is scored against it.

- Start from a template (team leader, operations/steward, relational/discipleship,
  innovator/church planter, quality/finisher, connector/recruiter) or set the seven dials
  yourself. Each dial has a "Help me decide" question about the job.
- Optionally name the **Working Genius** the role needs and where the work should **land**.
- Everyone in the current scope is ranked by fit, with reasons.

Scoring is deterministic — no API key, no cost. It weights LivStyle traits most heavily,
then Working Genius.

### Saving role profiles

Name a role and hit **Save role** and it's stored in the **Role Profiles** table in the base.
The dropdown at the top of the tab loads any saved role back — dials, Working Genius and all.
Loading one turns the button into **Update this role**, so re-saving overwrites rather than
duplicating. **Delete** removes it; **Start a new one** clears the identity so your next save
creates a fresh record.

Saved roles are also readable and editable directly in Airtable — the seven dials are plain
High / Medium / Low columns. Saving requires `Executive`.

**The burnout flag:** if a role requires a genius that is someone's *frustration*, they're
flagged in red. A person can score well on paper and still be drained by the job — this is
the one thing the old LivStyle-only version could not see.

---

## Adding a Key Thread

Write it into the **`Key Thread`** field on a person's record, in this format:

```
[evidence across the frameworks]. Thread: [the essence].
```

The dashboard splits on `Thread:` — the part after becomes the headline in the dark banner,
the part before becomes the supporting evidence beneath. Anyone without a Key Thread shows a
neutral placeholder rather than an invented one.

---

## Fields read

From `Assessments`: `Full Name` · `Division` · `Country` · `Primary Personality` ·
`Personality Under Pressure` · `16P Type` · `16P Identity` · `WG Geniuses` ·
`CS 1`–`CS 5` · `SG 1`–`SG 3` · `Key Thread` · `Leadership Set`

From `Leaders`: `Name` · `Login` · `Password` · `Active` · `Executive` · `Role`

Nothing else in the base is touched.
