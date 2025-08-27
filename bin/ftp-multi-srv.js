#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { createFtpServer } = require('../src/main');

function loadJSON(p, silent=false) {
  try { return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8')); }
  catch (e) { if (!silent) console.error('[config]', p, e.message); return null; }
}

const args = process.argv.slice(2);
const watch = args.includes('--watch');

const USERS_PATH = process.env.FTP_USERS || './config/users.json';
const SHARES_PATH = process.env.FTP_SHARES || './config/shares.json';
const SERVER_CONF_PATH = process.env.FTP_SERVER_CONF || './config/server.json';

function loadAll() {
  const users = loadJSON(USERS_PATH) || [];
  const shares = loadJSON(SHARES_PATH) || [];
  const serverConf = loadJSON(SERVER_CONF_PATH) || {};
  if (!serverConf.host) serverConf.host = process.env.FTP_HOST || '0.0.0.0';
  if (!serverConf.port) serverConf.port = parseInt(process.env.FTP_PORT || '2121',10);
  return { users, shares, serverConf };
}

let current = loadAll();
let instance;
try {
  instance = createFtpServer(current);
} catch (e) {
  console.error('[cli] Validation error:', e.message);
  process.exit(1);
}

instance.ftpServer.listen().then(() => {
  console.log(`[cli] FTP server listening on ${instance.ftpServer.options.url}`);
}).catch(err => {
  console.error('[cli] Startup error:', err);
  process.exit(1);
});

if (watch) {
  chokidar.watch([USERS_PATH, SHARES_PATH, SERVER_CONF_PATH], { ignoreInitial: true })
    .on('change', (fp) => {
      console.log('[watch] change detected:', fp);
      try {
        const next = loadAll();
        instance.ftpServer.close().then(() => {
          try {
            instance = createFtpServer(next);
          } catch (e) {
            console.error('[watch] validation failed; keeping previous server:', e.message);
            return instance.ftpServer.listen();
          }
          return instance.ftpServer.listen().then(()=>{
            console.log('[watch] server restarted');
          });
        }).catch(err => {
          console.error('[watch] restart failed:', err.message);
        });
      } catch (e) {
        console.error('[watch] reload error:', e.message);
      }
    });
}
