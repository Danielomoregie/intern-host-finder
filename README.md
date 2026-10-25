# Intern Host Finder

A simple local website for tracking Google SWE internship hosts. Black background, white text, a spreadsheet-style directory, and red Closed labels and green Open labels.

## Run locally

Requires Node.js 20 or newer. No dependencies to install.

```sh
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). `npm start` runs the server in the current terminal.

### Keep the website running on macOS

Double-click `Start Intern Host Finder.command`, or run `npm run background:install`. The launcher installs a per-user macOS LaunchAgent, starts the website immediately, and opens it in your browser. You can close the launcher and ChatGPT; macOS starts the website at login and restarts it if it crashes. Keep this project folder and Node.js in place. After downloading, you may need to run `chmod +x "Start Intern Host Finder.command"` once.

Use `npm run background:status` to check the service or `npm run background:uninstall` to stop it and remove automatic startup. Uninstalling the service keeps your leads and notes. Logs stay in the ignored `work/server.log` and `work/server-error.log` files. The service listens only on `127.0.0.1:4317`, with no public hosting or external dependencies.

The Mac must be on and logged into your account; the website is unavailable while the computer sleeps or is shut down. **This background service keeps the website available, but it does not search LinkedIn.** The existing signed-in Cody scan task still needs the ChatGPT desktop app running. A closed app can leave the scan countdown overdue; reloading the website only shows the latest saved results.

## Features

- Search and filter the saved Google employee posts.
- Keep closed, non-US, stale, and uncertain posts visible as history.
- Open the original LinkedIn post and inspect evidence on demand.
- Save outreach status and notes locally.
- Review the complete scan log with queries and coverage limitations.
- See a countdown to the next expected check (every 30 minutes, effective October 24, 2026, US Central). It is an estimate; the app does not perform LinkedIn searches or guarantee an exact scan start time. An external research process must import new scan results.

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
