// apps/backend/peekPfx.js (versión extendida)
import 'dotenv/config';
import fs from 'fs';
import forge from 'node-forge';
import crypto from 'crypto';

const pfxPath = process.env.SII_CERT_PFX_PATH;
const pass = process.env.SII_CERT_PFX_PASS;

const buf = fs.readFileSync(pfxPath);
const p12Asn1 = forge.asn1.fromDer(buf.toString('binary'));
const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, pass);

const bags1 = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
const bags2 = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [];
const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];

console.log('pkcs8ShroudedKeyBag:', bags1.length);
console.log('keyBag:', bags2.length);
console.log('certBag:', certs.length);

let pem = null;
if (bags1[0]?.key) pem = forge.pki.privateKeyToPem(bags1[0].key);
else if (bags2[0]?.key) pem = forge.pki.privateKeyToPem(bags2[0].key);

if (pem) {
  const keyObj = crypto.createPrivateKey({ key: pem, format: 'pem' });
  console.log('Key type:', keyObj.asymmetricKeyType); // 'rsa' o 'ec'
  if (keyObj.asymmetricKeyType === 'rsa') {
    console.log('Key size (bits):', keyObj.asymmetricKeyDetails.modulusLength);
  }
} else {
  console.log('No private key extracted.');
}
