# Configuration Examples

Each subfolder contains an isolated set of `server.json`, `shares.json`, `users.json` you can copy or point to via env vars:

```
FTP_SERVER_CONF=./examples/<name>/server.json \
FTP_SHARES=./examples/<name>/shares.json \
FTP_USERS=./examples/<name>/users.json npm start
```

## 1. basic-public
Minimal anonymous read-only public share.
- Anonymous enabled
- One public share `pub` read-only for anonymous
- Single user `user1` (rw on future additions if configured in shares)

Highlights:
- Good starting point
- No TLS (plain FTP)

## 2. private-users
Private team scenario.
- Anonymous disabled
- Two shares:
  - `team` (alice rw, bob r)
  - `exchange` (both rw)
- Explicit TLS enabled for secure logins

Highlights:
- Permission differences per share
- Demonstrates explicit FTPS

## 3. quota-and-limits
Quota + upload limit scenario.
- Anonymous enabled (public share read-only)
- Global upload size limit: 10 MB
- Share `pub` public with 50 MB total quota
- Share `bigshare` private 150 MB quota for `uploader`

Highlights:
- Shows `.status` reporting used vs quota
- Enforces per-file and per-share limits

## 4. tls-implicit
Implicit FTPS server (always encrypted) on port 990.
- Anonymous disabled
- One secure private share `secure`
- Implicit TLS mode (client must connect using FTPS implicit)

Highlights:
- Suitable when only encrypted connections are allowed
- Distinct PASV port range

## 5. i18n-lang
Localization demo.
- Default locale `it` (Italian)
- Fallback `en`
- Private share `documenti` for user `utente`
- Try command after login: `LANG en` or `LANG it`

Highlights:
- Switch runtime language (if client lets you send raw command)

## Notes
- Data paths in examples are relative; ensure folders exist or will be auto-created.
- Adjust PASV port ranges to avoid collisions if running multiple examples concurrently.
- For TLS examples place valid cert/key at configured paths or adapt to existing ones.
 - The folder `examples/config` contains a generic baseline set (`server.json`, `shares.json`, `users.json`) plus an Italian messages file (`messages.it.json`).
   - Only English (`en`) is built-in. To enable Italian (`it`) at runtime, copy the file into your runtime config directory so the i18n loader can discover it:
     ```bash
     mkdir -p config
     cp examples/config/messages.it.json config/
     ```
   - Locales are discovered from `./config/messages.<locale>.json` (working directory) or adjacent to the code; they are not loaded from the examples folder automatically.
 - `examples/config/certs/` is intentionally empty (ignored by git). Generate self-signed certs with `npm run generate-cert` (they will be created outside distribution) or place your own there when experimenting.
