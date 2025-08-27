<div align="center">

# ftp-multi-srv

[![npm version](https://img.shields.io/npm/v/ftp-multi-srv.svg?logo=npm)](https://www.npmjs.com/package/ftp-multi-srv)
[![npm downloads](https://img.shields.io/npm/dm/ftp-multi-srv.svg)](https://www.npmjs.com/package/ftp-multi-srv)

Multi-share, permission-aware, lightweight FTP(S) server for Node.js built on top of `@n-car/ftp-srv`.

</div>

## 1. Why this project?
You need a small, configurable FTP / FTPS server you can embed or run via CLI, with:
* Multiple logical shares (each a real filesystem path) exposed as top‑level directories
* Anonymous + named users, per-user or anonymous read (r) / read‑write (rw) permissions
* Simple JSON configuration (users, shares, server) + hot reload (`--watch`)
* Optional quotas and upload size limits
* Virtual status file exposing permissions & usage
* Explicit or implicit TLS
* Passive mode (PASV) range + public address support
* Basic i18n (currently `en`, `it`) and runtime language switch via `LANG`

## 2. Features (at a glance)
* Multi-share virtual root
* Read / read‑write permissions (`r`, `rw`) per user and anonymous
* Anonymous enable/disable toggle
* Share quota (`maxSizeBytes`) + per-upload size limit (`limits.maxUploadBytes`)
* Virtual `.status` file (root + each share)
* Explicit & implicit TLS (FTPS)
* Passive mode with configurable port range & external URL
* Hot configuration reload (`--watch`)
* i18n + dynamic `LANG <code>` command
* JSON schema validation (Ajv) – optional
* TypeScript definitions included

## 3. Install
Library usage:
```bash
npm install ftp-multi-srv
```
Global CLI (optional):
```bash
npm install -g ftp-multi-srv
```

## 4. Quick start (Library API)
```js
const { createFtpServer } = require('ftp-multi-srv');

const users = [
  { username: 'alice', password: 'alicepw' },
  { username: 'bob', password: 'bobpw' }
];

const shares = [
  {
    name: 'public',
    path: './data/public',
    public: true,
    anonymousPermission: 'r',
    users: { alice: 'rw', bob: 'r' }
  }
];

const serverConf = {
  host: '0.0.0.0',
  port: 2121,
  anonymous: { enabled: true },
  pasv: { enabled: true, url: '203.0.113.10', min: 50000, max: 50010 }
};

const { ftpServer } = createFtpServer({ users, shares, serverConf });
ftpServer.listen().then(() => console.log('FTP server listening')); 
```

Disable built‑in validation (if you validate beforehand):
```js
createFtpServer({ users, shares, serverConf, validate: false });
```

## 5. Quick start (CLI)
Local project:
```bash
npm start
```
Global:
```bash
ftp-multi-srv
```
Watch mode (auto-reload on config changes):
```bash
ftp-multi-srv --watch
```

## 6. Configuration Files
Default locations (override via env vars):
* `./config/server.json`
* `./config/users.json`
* `./config/shares.json`

### 6.1 server.json
Key | Type | Default | Notes
----|------|---------|------
`host` | string | `0.0.0.0` | Bind address
`port` | number | `2121` | Listening port
`anonymous.enabled` | boolean | `false` | Allow anonymous login
`limits.maxUploadBytes` | number/null | `null` | Per-file upload size cap
`pasv.enabled` | boolean | `false` | Enable passive mode
`pasv.url` | string/null | `null` | Public IP/host in PASV reply (NAT)
`pasv.min` | number | `50000` | Start of passive port range
`pasv.max` | number | `50100` | End of passive port range
`tls.enabled` | boolean | `false` | Enable FTPS
`tls.mode` | `explicit`\|`implicit` | `explicit` | AUTH TLS upgrade vs implicit FTPS
`tls.cert` | string | `./certs/cert.pem` | Certificate path
`tls.key` | string | `./certs/key.pem` | Private key path
`locale` | string | `en` | Default locale
`fallbackLocale` | string | `en` | Fallback if missing key

Notes:
* If TLS files are unreadable, TLS is disabled with a warning
* Use a dedicated port for implicit FTPS (e.g. 990)

### 6.2 users.json
```jsonc
[
  { "username": "alice", "password": "alicepw" }
]
```
Guidelines: unique usernames; hash passwords for production.

### 6.3 shares.json
```jsonc
[
  {
    "name": "public",
    "path": "./data/public",
    "public": true,
    "anonymousPermission": "r",
    "maxSizeBytes": null,
    "users": { "alice": "rw", "bob": "r" }
  }
]
```
Key | Type | Default | Description
----|------|---------|------------
`name` | string | (required) | Directory name at FTP root
`path` | string | (required) | Filesystem path (created if missing)
`public` | boolean | `false` | Visible to anonymous
`anonymousPermission` | `r`\|`rw` | `r` | Permission granted to anonymous (if `public=true`)
`users` | object | `{}` | `username -> r|rw`
`maxSizeBytes` | number/null | `null` | Total quota for share

Permission resolution (highest first):
1. Named user specific permission
2. Else if `public=true`: `anonymousPermission`
3. Else: no access

## 7. Environment Variables
Name | Default | Purpose
-----|---------|--------
`FTP_HOST` | `0.0.0.0` | Override server host
`FTP_PORT` | `2121` | Override server port
`FTP_USERS` | `./config/users.json` | Users file path
`FTP_SHARES` | `./config/shares.json` | Shares file path
`FTP_SERVER_CONF` | `./config/server.json` | Server config path

## 8. Quotas & Limits
* `limits.maxUploadBytes`: per-upload cap – enforced from start
* `share.maxSizeBytes`: aggregate size quota (recursive). Calculated and cached (30s). Cache invalidated after each upload closes.
If quota exceeded, upload is rejected.

## 9. Virtual `.status` File
* Appears at root: summary line per visible share (`name permissions=rw quota=50MB used=12.3MB`)
* Appears inside share root: key/value lines (`permissions=rw`, optional `quota=`, `used=`)
* Read-only, virtual; not stored on disk.

## 10. Internationalization (i18n)
* Built-in locales: `en`, `it`
* Add more by placing `messages.<locale>.json` in `config/`
* Connection greets with available locales
* Client can issue `LANG <code>`; unsupported -> `504` reply
* Missing keys fallback -> default locale -> English

## 11. TLS Modes
Mode | Flow
----|-----
Explicit | Plain control connection upgraded with `AUTH TLS`
Implicit | TLS from the first byte (use dedicated port)

If certificate or key read fails, TLS is disabled (server continues).

## 12. Passive Mode (PASV)
Configure a narrow port range (`pasv.min`–`pasv.max`) and ensure firewall/NAT forwards it. Set `pasv.url` when behind NAT so clients receive the correct external address.

## 13. Hot Reload
Run with `--watch` to automatically reload when any of the three JSON config files change. On validation error the previous server instance stays active.

## 14. TypeScript
Types are shipped (`index.d.ts`).
```ts
import { createFtpServer, CreateServerOptions } from 'ftp-multi-srv';
```
Return value:
```ts
{
  ftpServer,         // ftp-srv instance with listen/close
  shareMap,          // normalized shares by name
  userMap,           // Map<string,FtpUser>
  defaultLocale,
  fallbackLocale
}
```

## 15. Validation
Ajv schema validation runs at startup / reload. Disable by passing `validate: false` if you pre-validate or customize.

## 16. Production Hardening Tips
* Use a trusted cert (not self-signed); automate renewal (e.g. cron + ACME)
* Structured logging + rotation (pino / logrotate)
* Rate limit and/or throttle anonymous actions
* Enforce filename normalization & scanning (if needed)
* Store hashed passwords (bcrypt/argon2) or delegate to external auth
* Monitor disk usage vs share quotas

## 17. Minimal Config Set
```jsonc
// server.json
{ "host": "0.0.0.0", "port": 2121, "anonymous": { "enabled": true } }
```
```jsonc
// users.json
[ { "username": "alice", "password": "alicepw" } ]
```
```jsonc
// shares.json
[ { "name": "public", "path": "./data/public", "public": true, "anonymousPermission": "r" } ]
```

## 18. Changelog
See `CHANGELOG.md` (starting at 1.0.0).

## 19. License
MIT

## 20. Status & Roadmap
Stable. Future ideas (PRs welcome):
* Pluggable auth backends
* Optional structured logging integration
* More locales
* Configurable retention policy for size cache

---
Enjoy! Contributions & feedback welcome.
