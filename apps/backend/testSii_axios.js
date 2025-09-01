// apps/backend/testSii_axios.js
import 'dotenv/config';
import fs from 'fs';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { signXmlEnveloped } from './sii/xmlSign.js';

const ENV = (process.env.SII_ENV || 'cert').toLowerCase(); // cert | prod
const HOST = ENV === 'prod' ? 'palena.sii.cl' : 'maullin.sii.cl';

const URL_CRSEED   = `https://${HOST}/DTEWS/CrSeed.jws`;
const URL_GETTOKEN = `https://${HOST}/DTEWS/GetTokenFromSeed.jws`;

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

// --- helpers ---
function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function buildEnvelope(bodyXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    ${bodyXml}
  </soap:Body>
</soap:Envelope>`;
}
// --- fin helpers ---

async function getSeed() {
  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><getSeed/></soap:Body></soap:Envelope>`;

  const { data, status } = await axios.post(URL_CRSEED, envelope, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '""',
      'User-Agent': 'andflow-test/1.0',
    },
    validateStatus: () => true,
    timeout: 15000,
  });

  const xmlStr = String(data);

  // 1) SOAP normal → getSeedReturn (viene escapado)
  try {
    const obj = parser.parse(xmlStr);
    const inner = obj?.Envelope?.Body?.getSeedResponse?.getSeedReturn;
    if (inner) {
      const unescaped = decodeXml(inner);
      try {
        const innerObj = parser.parse(unescaped);
        const seed1 =
          innerObj?.RESPUESTA?.RESP_BODY?.SEMILLA ||
          innerObj?.RESPUESTA?.RESP_BODY?.Semilla ||
          innerObj?.['SII:RESPUESTA']?.['SII:RESP_BODY']?.SEMILLA ||
          null;
        if (seed1) return String(seed1);
      } catch { /* fallback regex */ }
      const m1 = unescaped.match(/<SEMILLA>(\d+)<\/SEMILLA>/i);
      if (m1) return m1[1];
    }

    // 2) RESPUESTA directa sin SOAP
    const seed2 = obj?.RESPUESTA?.RESP_BODY?.SEMILLA || obj?.RESPUESTA?.RESP_BODY?.Semilla || null;
    if (seed2) return String(seed2);
  } catch { /* seguimos */ }

  // 3) Fallback: extraer getSeedReturn, desescapar y regex
  const mReturn = xmlStr.match(/<getSeedReturn\b[^>]*>([\s\S]*?)<\/getSeedReturn>/i);
  if (mReturn) {
    const unesc = decodeXml(mReturn[1]);
    const m = unesc.match(/<SEMILLA>(\d+)<\/SEMILLA>/i);
    if (m) return m[1];
  }

  // 4) Último recurso: desescapar todo y buscar
  const mAll = decodeXml(xmlStr).match(/<SEMILLA>(\d+)<\/SEMILLA>/i);
  if (mAll) return mAll[1];

  console.error('[getSeed] status', status);
  console.error('[getSeed] cuerpo (primeros 800 chars):\n', xmlStr.slice(0, 800));
  throw new Error(`No pude extraer SEMILLA (status=${status})`);
}

async function postSoap(url, envelope) {
  const { data, status, headers } = await axios.post(url, envelope, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': '""',
      'User-Agent': 'andflow-test/1.0',
    },
    validateStatus: () => true,
    timeout: 20000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return { status, headers, data: String(data) };
}

async function signSeedXml(seed) {
  const xml = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;
  const signed = await signXmlEnveloped({
    xml,
    pfxPath: process.env.SII_CERT_PFX_PATH,
    pfxPass: process.env.SII_CERT_PFX_PASS,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    digestAlgorithm:    'http://www.w3.org/2000/09/xmldsig#sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });
  return signed;
}

async function getTokenFromSignedSeed(signedSeedXml) {
  const env = buildEnvelope(`<getToken><pszXml><![CDATA[${signedSeedXml}]]></pszXml></getToken>`);
  const resp = await postSoap(URL_GETTOKEN, env);

  console.log('[GetToken] HTTP status:', resp.status);
  console.log('[GetToken] Body (primeros 600 chars):\n', resp.data.slice(0,600));

  // 1) SOAP → getTokenReturn con XML escapado
  try {
    const o = parser.parse(resp.data);
    let inner = o?.Envelope?.Body?.getTokenResponse?.getTokenReturn;
    if (inner) {
      const unesc = decodeXml(inner);
      try {
        const innerObj = parser.parse(unesc);
        let token = innerObj?.RESPUESTA?.RESP_BODY?.TOKEN;
        if (token) return String(token);
        const estado = innerObj?.RESPUESTA?.RESP_HDR?.ESTADO || null;
        if (estado && estado !== '00') throw new Error(`SII estado ${estado} (inner)`);
      } catch {
        const mTok = unesc.match(/<TOKEN>([^<]+)<\/TOKEN>/i);
        if (mTok) return mTok[1];
      }
    }
    // 2) RESPUESTA directa
    let token2 = o?.RESPUESTA?.RESP_BODY?.TOKEN;
    if (token2) return String(token2);
  } catch { /* seguimos */ }

  // 3) Fallback regex global
  const unescAll = decodeXml(resp.data);
  const mTok2 = unescAll.match(/<TOKEN>([^<]+)<\/TOKEN>/i);
  if (mTok2) return mTok2[1];

  // 4) Reporta ESTADO si se puede leer
  try {
    const oo = parser.parse(unescAll);
    const estado = oo?.RESPUESTA?.RESP_HDR?.ESTADO
                || 'desconocido';
    throw new Error(`No pude obtener TOKEN (status=${resp.status}, estado=${estado})`);
  } catch {
    throw new Error(`No pude obtener TOKEN (status=${resp.status}, estado=desconocido)`);
  }
}

(async () => {
  try {
    console.log('SII_ENV:', ENV, 'HOST:', HOST);
    console.log('PFX:', process.env.SII_CERT_PFX_PATH);
    fs.accessSync(process.env.SII_CERT_PFX_PATH, fs.constants.R_OK);

    const seed = await getSeed();
    console.log('SEMILLA:', seed);

    const signed = await signSeedXml(seed);
    console.log('XML firmado OK, bytes:', signed.length);

    const token = await getTokenFromSignedSeed(signed);
    console.log('TOKEN:', token);
  } catch (err) {
    console.error('Fallo test SII:', err.message);
  }
})();
