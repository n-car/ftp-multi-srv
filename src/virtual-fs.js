const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { msg } = require('./messages');

/**
 * VirtualFileSystem monta più cartelle fisiche come sottocartelle della root FTP.
 * Gestisce permessi di sola lettura / lettura-scrittura per utente o anonimo.
 * Permessi:
 *  - "r"  = sola lettura
 *  - "rw" = lettura e scrittura
 */
class VirtualFileSystem {
  constructor(connection, { username, shares, logger, maxUploadBytes = null }) {
    this.connection = connection;
    this.username = username; // 'anonymous' oppure utente autenticato
    this.shares = shares; // mappa name -> shareConfig arricchita (public, users, anonymousPermission)
    this.logger = logger || console;
    this._cwd = '/';
    this.maxUploadBytes = maxUploadBytes == null ? null : Number(maxUploadBytes);
  }

  _m(key) {
    // connection._locale set by server (LANG command); default 'en'
    return msg((this.connection && this.connection._locale) || 'en', key);
  }

  // Helpers ---------------------------------------------------------------
  _split(p) {
    if (!p || p === '/') return [];
    return p.replace(/^\/+/, '').replace(/\/+$/, '').split('/');
  }

  _resolveVirtual(p) {
    if (!p) p = this._cwd;
    if (p.startsWith('/')) {
      // assoluto virtuale
    } else {
      p = path.posix.join(this._cwd, p);
    }
    // normalizza
    const norm = path.posix.normalize(p);
    return norm;
  }

  _resolvePhysical(p) {
    const virt = this._resolveVirtual(p);
  // blocca path traversal con '..'
  if (virt.split('/').some(seg => seg === '..')) return { type: 'invalid', virt };
    if (virt === '/') return { type: 'root', virt, share: null, rel: '' };
    const parts = this._split(virt);
    const shareName = parts[0];
    const share = this.shares[shareName];
    if (!share) return { type: 'invalid', virt };
    const rel = parts.slice(1).join('/');
    const physical = path.resolve(share.path, rel);
    // sandbox: il path reale deve stare sotto la share.path
    if (!physical.startsWith(path.resolve(share.path))) {
      return { type: 'invalid', virt };
    }
    return { type: 'file', virt, share, rel, physical };
  }

  _permForShare(share) {
    // Cache su oggetto share per user
    share._permCache = share._permCache || {};
    if (share._permCache[this.username] !== undefined) return share._permCache[this.username];
    let value = null;
    if (this.username === 'anonymous') {
      if (share.public) value = share.anonymousPermission || 'r';
    } else {
      if (share.users && share.users[this.username]) value = share.users[this.username];
      else if (share.public) value = share.anonymousPermission || 'r';
    }
    share._permCache[this.username] = value;
    return value;
  }

  _needWrite(share) {
    const perm = this._permForShare(share);
    return perm && perm.includes('w');
  }

  _statDirPlaceholder(name) {
    // Crea un oggetto simile a fs.Stats per le directory virtuali root level
    return {
      name,
      isDirectory: () => true,
      isFile: () => false,
      mode: 0o755,
      size: 0,
      mtime: new Date(),
      ctime: new Date(),
      atime: new Date()
    };
  }

  async _ensureShareExists(share) {
    try {
      await fsp.mkdir(share.path, { recursive: true });
    } catch (e) {
  this.logger.error('Share creation error', share.name, e.message);
    }
  }

  // API richiesto da ftp-srv ---------------------------------------------
  currentDirectory() {
    return this._cwd;
  }

  async chdir(p) {
    const r = this._resolvePhysical(p);
    if (r.type === 'root') {
      this._cwd = '/';
      return this._cwd;
    }
    if (r.type === 'file') {
      // directory share root
      if (!r.rel) {
        this._cwd = '/' + r.share.name;
        return this._cwd;
      }
      try {
        const st = await fsp.stat(r.physical);
        if (st.isDirectory()) {
          this._cwd = this._resolveVirtual(p).replace(/\\+/g, '/');
          return this._cwd;
        }
      } catch (e) {
  throw new Error(this._m('ERR_DIR_NOT_FOUND'));
      }
  }
  throw new Error(msg('en','ERR_DIR_NOT_FOUND'));
  }

  async list(p) {
    const r = this._resolvePhysical(p || this._cwd);
    if (r.type === 'root') {
      // restituisci le share visibili all'utente (anonimo se consentito)
      const out = [];
      // global status file
      out.push(this._virtualStatusFile('.status'));
      for (const name of Object.keys(this.shares)) {
        const share = this.shares[name];
        const perm = this._permForShare(share);
        if (!perm) continue; // non visibile
        await this._ensureShareExists(share);
        out.push(this._statDirPlaceholder(name));
      }
      return out;
    }
    if (r.type === 'file') {
  if (!this._permForShare(r.share)) throw new Error(this._m('ERR_ACCESS_DENIED'));
      await this._ensureShareExists(r.share);
      const base = r.rel ? r.physical : r.share.path;
      let entries;
      try {
        entries = await fsp.readdir(base);
      } catch (e) {
  throw new Error(this._m('ERR_DIR_NOT_READABLE'));
      }
      const stats = [];
      // per-share status file at share root
      if (!r.rel) stats.push(this._virtualStatusFile('.status', r.share));
      for (const entry of entries) {
        const full = path.join(base, entry);
        try {
          const st = await fsp.stat(full);
          st.name = entry;
          stats.push(st);
        } catch (e) {
          // ignora
        }
      }
      return stats;
    }
  throw new Error(this._m('ERR_INVALID_PATH'));
  }

  async get(fileName) {
    if (!fileName || fileName === '.') fileName = this._cwd;
    const r = this._resolvePhysical(fileName);
    if (r.type === 'root') {
      // restituisci stat placeholder della root virtuale
      return this._statDirPlaceholder('.');
    }
    // virtual status file
    if (r.type === 'file') {
      if ((r.rel === '.status') || (!r.rel && /\.status$/i.test(fileName))) {
        return this._virtualStatusFile('.status', r.share);
      }
    }
    if (r.type === 'file') {
  if (!this._permForShare(r.share)) throw new Error(this._m('ERR_ACCESS_DENIED'));
      const base = r.rel ? r.physical : r.share.path;
      try {
        const st = await fsp.stat(base);
        st.name = path.basename(fileName);
        return st;
      } catch (e) {
  throw new Error(this._m('ERR_FILE_NOT_FOUND'));
      }
  }
  throw new Error(this._m('ERR_INVALID_PATH'));
  }

  // Operazioni di scrittura ------------------------------------------------
  write(fileName, { append = false, start = undefined } = {}) {
    const r = this._resolvePhysical(fileName);
  if (r.type !== 'file') throw new Error(this._m('ERR_INVALID_PATH'));
  if (!this._permForShare(r.share)) throw new Error(this._m('ERR_ACCESS_DENIED'));
  if (!this._needWrite(r.share)) throw new Error(this._m('ERR_PERMISSION_DENIED_RO'));
    // Limite dimensione upload singolo
    if (!append && this.maxUploadBytes && this.maxUploadBytes > 0) {
      // useremo un wrapper stream per abort se supera limite
    }
    // Limite dimensione totale share
    if (r.share.maxSizeBytes) {
      const currentSize = this._shareSizeCached(r.share);
      if (currentSize >= r.share.maxSizeBytes) {
  throw new Error(this._m('ERR_SHARE_QUOTA_EXCEEDED'));
      }
    }
    const target = path.resolve(r.share.path, r.rel || '');
    const dir = path.dirname(target);
    fs.mkdirSync(dir, { recursive: true });
    const flags = append ? 'a' : 'w';
    const ws = fs.createWriteStream(target, { flags, start });
    let written = 0;
    if (this.maxUploadBytes && this.maxUploadBytes > 0) {
      const origWrite = ws.write;
      ws.write = function(chunk, enc, cb) {
        written += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, enc);
        if (written > this.maxUploadBytes) {
          ws.destroy(new Error(this._m('ERR_UPLOAD_LIMIT_EXCEEDED'))); // triggers error to client
          return false;
        }
        return origWrite.call(ws, chunk, enc, cb);
      }.bind(this);
    }
    ws.on('close', () => {
      if (r.share.maxSizeBytes) {
        // invalida cache dimensione share
        delete r.share._sizeCache;
      }
    });
    return ws;
  }

  read(fileName, { start = undefined } = {}) {
    const r = this._resolvePhysical(fileName);
    // virtual status file
    if (r.type === 'file') {
      if (r.rel === '.status' || (!r.rel && /\.status$/i.test(fileName))) {
        const content = this._statusText(r.share);
        const { Readable } = require('stream');
        return Readable.from([content]);
      }
    }
  if (r.type !== 'file') throw new Error(this._m('ERR_INVALID_PATH'));
    const target = path.resolve(r.share.path, r.rel || '');
    return fs.createReadStream(target, start !== undefined ? { start } : {});
  }

  async delete(p) {
    const r = this._resolvePhysical(p);
  if (r.type !== 'file') throw new Error(this._m('ERR_INVALID_PATH'));
  if (!this._permForShare(r.share)) throw new Error(this._m('ERR_ACCESS_DENIED'));
  if (!this._needWrite(r.share)) throw new Error(this._m('ERR_PERMISSION_DENIED_RO'));
    const target = path.resolve(r.share.path, r.rel || '');
    try {
      const st = await fsp.stat(target);
      if (st.isDirectory()) {
        await fsp.rm(target, { recursive: true, force: true });
      } else {
        await fsp.unlink(target);
      }
    } catch (e) {
  throw new Error(this._m('ERR_DELETE_FAILED'));
    }
  }

  async mkdir(p) {
  if (this._cwd === '/' ) throw new Error(this._m('ERR_CREATE_DIR_ROOT'));
  const r = this._resolvePhysical(p);
  if (r.type !== 'file') throw new Error(this._m('ERR_INVALID_PATH'));
  if (!this._permForShare(r.share)) throw new Error(this._m('ERR_ACCESS_DENIED'));
  if (!this._needWrite(r.share)) throw new Error(this._m('ERR_PERMISSION_DENIED_RO'));
    const target = path.resolve(r.share.path, r.rel || '');
    await fsp.mkdir(target, { recursive: true });
    return path.basename(target);
  }

  async rename(from, to) {
    const rFrom = this._resolvePhysical(from);
    const rTo = this._resolvePhysical(to);
    if (rFrom.type !== 'file' || rTo.type !== 'file' || rFrom.share !== rTo.share) {
  throw new Error(this._m('ERR_RENAME_CROSS_SHARE'));
    }
  if (!this._permForShare(rFrom.share)) throw new Error(this._m('ERR_ACCESS_DENIED'));
  if (!this._needWrite(rFrom.share)) throw new Error(this._m('ERR_PERMISSION_DENIED_RO'));
    const src = path.resolve(rFrom.share.path, rFrom.rel || '');
    const dst = path.resolve(rTo.share.path, rTo.rel || '');
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await fsp.rename(src, dst);
  }

  chmod(_p) {
    // opzionale: si potrebbe mappare su permessi reali
  throw new Error(this._m('ERR_CHMOD_UNSUPPORTED'));
  }

  getUniqueName(fileName) {
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    return base + '_' + Date.now() + ext;
  }

  _shareSizeCached(share) {
    if (share._sizeCache && Date.now() - share._sizeCache.ts < 30000) {
      return share._sizeCache.size;
    }
    const size = this._computeDirSize(share.path);
    share._sizeCache = { size, ts: Date.now() };
    return size;
  }

  _computeDirSize(dir) {
    let total = 0;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        try {
          if (e.isDirectory()) total += this._computeDirSize(full);
          else if (e.isFile()) total += fs.statSync(full).size;
        } catch (_) {}
      }
    } catch (_) {}
    return total;
  }

  _virtualStatusFile(name, share) {
    return {
      name,
      isDirectory: () => false,
      isFile: () => true,
      mode: 0o444,
      size: Buffer.byteLength(this._statusText(share), 'utf8'),
      mtime: new Date(),
      ctime: new Date(),
      atime: new Date()
    };
  }

  _statusText(share) {
    const fmtBytes = (n) => {
      if (n == null) return '';
      const units = ['B','KB','MB','GB','TB'];
      let v = Number(n);
      let i = 0;
      while (v >= 1024 && i < units.length-1) { v /= 1024; i++; }
      return (Math.round(v*10)/10) + units[i];
    };
    if (!share) {
      const lines = [];
      for (const name of Object.keys(this.shares)) {
        const s = this.shares[name];
        const perm = this._permForShare(s);
        if (!perm) continue;
        if (s.maxSizeBytes != null) {
          const used = this._shareSizeCached(s);
          lines.push(`${name} permissions=${perm} quota=${fmtBytes(s.maxSizeBytes)} used=${fmtBytes(used)}`);
        } else {
          lines.push(`${name} permissions=${perm}`);
        }
      }
      return lines.join('\n') + '\n';
    }
    const perm = this._permForShare(share) || 'none';
    if (share.maxSizeBytes != null) {
      const used = this._shareSizeCached(share);
      return `permissions=${perm}\nquota=${fmtBytes(share.maxSizeBytes)}\nused=${fmtBytes(used)}\n`;
    }
    return `permissions=${perm}\n`;
  }
}

module.exports = { VirtualFileSystem };
