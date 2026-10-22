# Intern Host Finder

A simple local website for tracking Google SWE internship hosts. Black background, white text, a spreadsheet-style directory, and red labels for unfavorable statuses.

## Run locally

Requires Node.js 20 or newer. No dependencies to install.

```sh
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). On macOS, you can also double-click **Start Intern Host Finder.command**. Keep the server running while using the tracker.

## Features

- Search and filter the saved Google employee posts.
- Keep closed, non-US, stale, and uncertain posts visible as history.
- Open the original LinkedIn post and inspect evidence on demand.
- Save outreach status and notes locally.
- Review the complete scan log with queries and coverage limitations.
- See a countdown to the next expected three-hour check. It is an estimate; the app does not perform LinkedIn searches or guarantee an exact scan start time. An external research process must import new scan results.

## Data stays local

On a fresh clone, the app creates an empty `data/leads.json` from `data.example.json`. Personal records, notes, logs, screenshots, credentials and local configuration are excluded from Git.

To use an existing tracker, set `TRACKER_DATA_PATH` to its absolute JSON path, or create an ignored `.local-config.json` containing `{"dataPath":"/absolute/path/to/leads.json"}`. An existing configured file is never replaced with an empty starter.

Import an evidence-based scan:

```sh
node import-scan.mjs --scan /absolute/path/to/scan.json
```

The file format is `{ "leads": [], "scan": { "at": "ISO timestamp", "result": "description", "coverage": "what was checked", "newLeads": 0, "updatedLeads": 0, "queries": "search terms", "notes": "limitations" } }`.

The importer deduplicates by LinkedIn activity, preserves notes and outreach, retains rejected authors separately, and uses an atomic write shared with the website. Eligibility is checked in `host-criteria.mjs`: an actionable host needs explicit Google employment, a US host and US software project, Summer 2027, recent evidence, an open invitation and a direct matching/contact route.

The website reloads saved records every 30 seconds while visible. **Reload** only reads saved data; it does not initiate a new search. Times are displayed in US Central time. The server binds only to this computer’s loopback address.

## Verify

```sh
npm test
```

Tests use synthetic data and cover eligibility display, concurrent note/scan preservation and the local HTTP API.
