import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const label = 'com.daniel.intern-host-finder';
const target = `gui/${process.getuid?.()}/${label}`;
const logDirectory = path.join(os.homedir(), 'Library', 'Logs', 'Intern Host Finder');
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
const escapeXML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

// macOS owns this process, independently of the terminal or ChatGPT session.
export function servicePlist(directory = root, node = process.execPath, logs = logDirectory) {
  const text = value => `<string>${escapeXML(value)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${text(label)}
<key>ProgramArguments</key><array>${text(node)}${text(path.join(directory, 'server.mjs'))}</array>
<key>EnvironmentVariables</key><dict><key>PORT</key>${text('4317')}</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>ProcessType</key>${text('Background')}
<key>StandardOutPath</key>${text(path.join(logs, 'server.log'))}
<key>StandardErrorPath</key>${text(path.join(logs, 'server-error.log'))}
</dict></plist>
`;
}
function launchctl(...args) {
  return spawnSync('/bin/launchctl', args, { encoding: 'utf8' });
}
function requireSuccess(result, action) {
  if (result.status !== 0) throw new Error(`${action}: ${result.stderr?.trim() || result.error?.message || 'launchctl failed'}`);
}
async function ready() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:4317/api/data', {signal: AbortSignal.timeout(1000)});
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`The background server did not become ready. Check ${path.join(logDirectory, 'server-error.log')}`);
}
async function main(action) {
  if (process.platform !== 'darwin') throw new Error('This background service is for macOS. Use npm start on other systems.');
  if (action === 'print') { process.stdout.write(servicePlist()); return; }
  if (action === 'status') {
    const result = launchctl('print', target);
    process.stdout.write(result.stdout || result.stderr || 'Service is not installed.\n');
    process.exitCode = result.status ?? 1;
    return;
  }
  if (!['install', 'uninstall'].includes(action)) throw new Error('Use install, status, uninstall, or print.');
  const loaded = launchctl('print', target).status === 0;
  if (action === 'uninstall') {
    if (loaded) requireSuccess(launchctl('bootout', target), 'Could not stop the service');
    await fs.rm(plistPath, {force: true});
    console.log('Background service removed. Saved leads and notes were kept.');
    return;
  }
  await fs.mkdir(path.dirname(plistPath), {recursive: true});
  // launchd must open logs before Node starts. Documents can be protected at that stage.
  await fs.mkdir(logDirectory, {recursive: true});
  const contents = servicePlist();
  const existing = await fs.readFile(plistPath, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (loaded && existing === contents) {
    await ready();
    console.log('Intern Host Finder is already running in the background.');
    return;
  }
  if (loaded) requireSuccess(launchctl('bootout', target), 'Could not replace the service');
  await fs.writeFile(plistPath, contents, {mode: 0o644});
  requireSuccess(launchctl('enable', target), 'Could not enable the service');
  requireSuccess(launchctl('bootstrap', `gui/${process.getuid()}`, plistPath), 'Could not start the service');
  await ready();
  console.log('Intern Host Finder is running at http://127.0.0.1:4317');
  console.log('It starts at login and restarts after a crash. You can close this terminal and ChatGPT.');
  console.log('LinkedIn scans still require the existing Cody scheduled task and the ChatGPT app.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
