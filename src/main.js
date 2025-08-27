const { FtpSrv } = require('@n-car/ftp-srv');
const path = require('path');
const fs = require('fs');
const { VirtualFileSystem } = require('./virtual-fs');
const { msg, setFallbackLocale, preloadLocales } = require('./messages');
const { validateAll } = require('./validate');

function buildShareMap(shares) {
	const out = {};
	for (const s of shares) {
		out[s.name] = {
			name: s.name,
			path: path.resolve(s.path),
			public: !!s.public,
			anonymousPermission: s.anonymousPermission || 'r',
			maxSizeBytes: s.maxSizeBytes == null ? null : Number(s.maxSizeBytes),
			users: s.users || {}
		};
	}
	return out;
}

function createFtpServer({ users, shares, serverConf, logger = console, validate = true }) {
	if (validate) {
		try { validateAll({users, shares, serverConf}); }
		catch (e) { throw e; }
	}
	const shareMap = buildShareMap(shares);
	const userMap = new Map(users.map(u => [u.username, u]));

	const pasvEnabled = serverConf.pasv && serverConf.pasv.enabled;
	const tlsEnabled = serverConf.tls && serverConf.tls.enabled;
	const tlsMode = tlsEnabled ? (serverConf.tls.mode || 'explicit') : 'none';
	let tlsOptions = false;
	if (tlsEnabled) {
		try {
			tlsOptions = {
				cert: fs.readFileSync(path.resolve(serverConf.tls.cert)),
				key: fs.readFileSync(path.resolve(serverConf.tls.key))
			};
		} catch (e) {
			logger.error('TLS cert/key read failed, disabling TLS:', e.message);
			tlsOptions = false;
		}
	}
	const protocol = tlsOptions && tlsMode === 'implicit' ? 'ftps' : 'ftp';

	const discovered = preloadLocales();
	const fallbackLocale = (serverConf.fallbackLocale && typeof serverConf.fallbackLocale === 'string') ? serverConf.fallbackLocale : 'en';
	setFallbackLocale(fallbackLocale);
	const defaultLocale = (serverConf.locale && typeof serverConf.locale === 'string') ? serverConf.locale : fallbackLocale;

	const ftpServer = new FtpSrv({
		url: `${protocol}://${serverConf.host}:${serverConf.port}`,
		anonymous: !!(serverConf.anonymous && serverConf.anonymous.enabled),
		greeting: (() => {
			const lines = ['Simple Node.js FTP server'];
			if (serverConf.anonymous && serverConf.anonymous.enabled) {
				const anyPublic = Object.values(shareMap).some(s => s.public);
				if (anyPublic) lines.push('Anonymous login available (limited shares)');
				else lines.push('Anonymous login enabled (no visible shares)');
			}
			lines.push(`Default locale: ${defaultLocale} (fallback: ${fallbackLocale}) Locales: ${discovered.join(',')}`);
			return lines;
		})(),
		tls: tlsOptions,
		pasv_url: pasvEnabled && serverConf.pasv.url ? serverConf.pasv.url : undefined,
		pasv_min: pasvEnabled ? (serverConf.pasv.min || 50000) : undefined,
		pasv_max: pasvEnabled ? (serverConf.pasv.max || 50100) : undefined,
	});

	ftpServer.on('login', ({ connection, username, password }, resolve, reject) => {
		connection._locale = defaultLocale;
		let effectiveUser = username;
		if (!username || username === 'anonymous') {
			if (!(serverConf.anonymous && serverConf.anonymous.enabled)) return reject(new Error(msg('en','ERR_ANON_DISABLED')));
			effectiveUser = 'anonymous';
		} else {
			const u = userMap.get(username);
			if (!u || u.password !== password) return reject(new Error(msg('en','ERR_INVALID_CREDENTIALS')));
		}
		const vfs = new VirtualFileSystem(connection, {
			username: effectiveUser,
			shares: shareMap,
			logger,
			maxUploadBytes: serverConf.limits ? serverConf.limits.maxUploadBytes : null
		});
		resolve({ fs: vfs, root: '/' });
	});

	ftpServer.on('client-error', ({ error }) => logger.error('Client error:', error.message));
	ftpServer.on('server-error', ({ error }) => logger.error('Server error:', error.message));

	ftpServer.on('connection', (connection) => {
		const origHandler = connection._handle.bind(connection);
		connection._handle = (command, info) => {
			if (command === 'LANG') {
				const arg = (info.text || '').split(/\s+/)[1];
				if (!arg) { connection.reply(501, 'Missing language code'); return; }
				const lang = arg.toLowerCase();
				if (MESSAGES[lang]) { connection._locale = lang; connection.reply(200, `Language set to ${lang}`); }
				else connection.reply(504, 'Language not supported');
				return;
			}
			if (command === 'FEAT') {
				const lines = ['211-Features:', ' LANG', '211 End'];
				connection.socket.write(lines.map(l => l + '\r\n').join(''));
				return;
			}
			return origHandler(command, info);
		};
	});

	return { ftpServer, shareMap, userMap, defaultLocale, fallbackLocale };
}

module.exports = { createFtpServer };
