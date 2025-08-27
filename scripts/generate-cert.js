#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

const attrs = [{ name: 'commonName', value: process.env.CN || 'localhost' }];
const pems = selfsigned.generate(attrs, {
  days: 365,
  algorithm: 'sha256',
  keySize: 2048,
  extensions: [{ name: 'basicConstraints', cA: true }]
});

const certDir = path.resolve(process.argv[2] || './certs');
fs.mkdirSync(certDir, { recursive: true });
fs.writeFileSync(path.join(certDir, 'cert.pem'), pems.cert);
fs.writeFileSync(path.join(certDir, 'key.pem'), pems.private);
console.log('Certificati self-signed generati in', certDir);
