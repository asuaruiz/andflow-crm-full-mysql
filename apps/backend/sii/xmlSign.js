// apps/backend/sii/xmlSign.js
import fs from 'fs';
import forge from 'node-forge';
// xml-crypto@1.5.3 (API clásica)
import xmlCryptoPkg from 'xml-crypto';
const { SignedXml } = xmlCryptoPkg;

/** BigInt JSBN de forge → Base64 sin signo */
function bigIntegerToB64(bi) {
  let hex = bi.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  // quita ceros a la izquierda
  hex = hex.replace(/^00+/, '');
  const buf = Buffer.from(hex, 'hex');
  return buf.toString('base64');
}

/**
 * Lee PFX y devuelve:
 *  - privateKeyPem (PEM "BEGIN RSA PRIVATE KEY")
 *  - certB64 (DER base64 del X509)
 *  - modulusB64, exponentB64 (del public key)
 */
function loadKeyAndCertFromPfx(pfxPath, pfxPass) {
  console.log('[xmlSign] Leyendo PFX desde', pfxPath);
  const pfxBuf = fs.readFileSync(pfxPath);
  console.log('[xmlSign] Tamaño del PFX (bytes):', pfxBuf.length);

  const p12Asn1 = forge.asn1.fromDer(pfxBuf.toString('binary'));
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, pfxPass);
    console.log('[xmlSign] PFX parseado correctamente.');
  } catch (e) {
    throw new Error(`No pude abrir el PFX: ${e.message || e}`);
  }

  // Clave privada
  const bagTypes = [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag];
  let rsaPrivateKey = null;
  for (const bagType of bagTypes) {
    const bags = p12.getBags({ bagType })[bagType] || [];
    console.log(`[xmlSign] Revisando bagType=${bagType}, encontrados=${bags.length}`);
    for (const b of bags) {
      if (b.key) { rsaPrivateKey = b.key; break; }
    }
    if (rsaPrivateKey) break;
  }
  if (!rsaPrivateKey) throw new Error('No encontré la clave privada en el PFX.');
  const privateKeyPem = forge.pki.privateKeyToPem(rsaPrivateKey).replace(/\r/g, '').trim();
  console.log('[xmlSign] Longitud PEM key:', privateKeyPem.length);

  // Certificado + clave pública
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error('No encontré certificado (X509) dentro del PFX');
  const cert = certBag.cert;
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certB64 = Buffer.from(certDer, 'binary').toString('base64');

  const pub = cert.publicKey; // RSA public key
  const modulusB64 = bigIntegerToB64(pub.n);
  const exponentB64 = bigIntegerToB64(pub.e);

  return { privateKeyPem, certB64, modulusB64, exponentB64 };
}

/** Inserta Id="GT1" al primer <getToken ...> si no lo tiene */
function ensureGetTokenId(xml) {
  if (/<getToken\b[^>]*\bId\s*=/i.test(xml)) {
    console.log('[xmlSign] <getToken> ya tiene Id');
    return xml;
  }
  console.log('[xmlSign] Inyectando Id="GT1" en <getToken>');
  return xml.replace(/<getToken(\s[^>]*)?>/i, (m, attrs='') => `<getToken${attrs || ''} Id="GT1">`);
}

/**
 * Firma enveloped el root (<getToken>) con xml-crypto@1.5.3 API clásica.
 * Referencia: solo transform 'enveloped-signature'.
 * SignedInfo: c14n EXCLUSIVA (el SII suele aceptarla mejor).
 */
export async function signXmlEnveloped({
  xml,
  pfxPath,
  pfxPass,
  signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  digestAlgorithm    = 'http://www.w3.org/2000/09/xmldsig#sha1',
  canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#', // ← exclusiva
}) {
  console.log('[xmlSign] Iniciando firma...');
  if (!xml) throw new Error('xml requerido');
  if (!pfxPath || !pfxPass) throw new Error('pfxPath/pfxPass requeridos');

  const { privateKeyPem, certB64, modulusB64, exponentB64 } = loadKeyAndCertFromPfx(pfxPath, pfxPass);

  const xmlWithId = ensureGetTokenId(xml);
  console.log('[xmlSign] XML de entrada (primeros 200 chars):\n', xmlWithId.slice(0,200));
  console.log('[xmlSign] Algoritmos:', { signatureAlgorithm, digestAlgorithm, canonicalizationAlgorithm });

  const sig = new SignedXml({
    canonicalizationAlgorithm,
    signatureAlgorithm,
    signingKey: privateKeyPem, // pasar clave en constructor
  });

  sig.idAttributes = ['Id', 'ID', 'id'];

  // API clásica: addReference(xpath, transforms[], digestAlgorithm)
  sig.addReference(
    '/*',
    ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
    digestAlgorithm
  );
  console.log('[xmlSign] addReference (clásico) OK');

  // KeyInfo: KeyValue (Modulus/Exponent) + X509Data
  sig.keyInfoProvider = {
    getKeyInfo() {
      return `
<KeyInfo>
  <KeyValue>
    <RSAKeyValue>
      <Modulus>${modulusB64}</Modulus>
      <Exponent>${exponentB64}</Exponent>
    </RSAKeyValue>
  </KeyValue>
  <X509Data>
    <X509Certificate>${certB64}</X509Certificate>
  </X509Data>
</KeyInfo>`.trim();
    },
    getKey() { return null; }
  };

  // refuerzo
  sig.signingKey = privateKeyPem;

  console.log('[xmlSign] Ejecutando computeSignature...');
  sig.computeSignature(xmlWithId);
  console.log('[xmlSign] computeSignature terminó OK.');

  const signed = sig.getSignedXml();
  console.log('[xmlSign] Longitud XML firmado:', signed?.length);
  console.log('[xmlSign] Fragmento firmado (primeros 300 chars):\n', signed?.slice(0,300));
  return signed;
}
