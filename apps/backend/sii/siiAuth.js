// apps/backend/sii/siiAuth.js
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import { signXmlEnveloped } from './xmlSign.js';

const ENV = (process.env.SII_ENV || 'cert').toLowerCase(); // cert | prod
const HOST = ENV === 'prod' ? 'palena.sii.cl' : 'maullin.sii.cl';

const URL_CRSEED   = `https://${HOST}/DTEWS/CrSeed.jws`;
const URL_GETTOKEN = `https://${HOST}/DTEWS/GetTokenFromSeed.jws`;

const parser = new XMLParser({ ignoreAttributes:false, removeNSPrefix:true });

function decodeXml(s){
  return String(s)
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
}

function buildEnvelope(bodyXml){
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>${bodyXml}</soap:Body>
</soap:Envelope>`;
}

async function getSeed(){
  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>`+
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">`+
    `<soap:Body><getSeed/></soap:Body></soap:Envelope>`;

  const { data } = await axios.post(URL_CRSEED, envelope, {
    headers: {'Content-Type':'text/xml; charset=utf-8', 'SOAPAction':'""', 'User-Agent':'andflow/1.0'},
    validateStatus:()=>true, timeout:15000
  });

  const xmlStr = String(data);
  try{
    const o = parser.parse(xmlStr);
    const inner = o?.Envelope?.Body?.getSeedResponse?.getSeedReturn;
    if (inner){
      const unesc = decodeXml(inner);
      try{
        const io = parser.parse(unesc);
        const seed = io?.RESPUESTA?.RESP_BODY?.SEMILLA || io?.RESPUESTA?.RESP_BODY?.Semilla || null;
        if (seed) return String(seed);
      }catch{}
      const m = unesc.match(/<SEMILLA>(\d+)<\/SEMILLA>/i);
      if (m) return m[1];
    }
  }catch{}

  const mAll = decodeXml(xmlStr).match(/<SEMILLA>(\d+)<\/SEMILLA>/i);
  if (mAll) return mAll[1];
  throw new Error('No pude extraer SEMILLA');
}

async function getTokenFromSeed(seed){
  const xml = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;
  const signed = await signXmlEnveloped({
    xml,
    pfxPath: process.env.SII_CERT_PFX_PATH,
    pfxPass: process.env.SII_CERT_PFX_PASS,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    digestAlgorithm:    'http://www.w3.org/2000/09/xmldsig#sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  });

  const env = buildEnvelope(`<getToken><pszXml><![CDATA[${signed}]]></pszXml></getToken>`);
  const { data, status } = await axios.post(URL_GETTOKEN, env, {
    headers: {'Content-Type':'text/xml; charset=utf-8', 'SOAPAction':'""', 'User-Agent':'andflow/1.0'},
    validateStatus:()=>true, timeout:20000
  });

  const body = String(data);
  // parsea SOAP → string escapado → RESPUESTA
  try{
    const o = parser.parse(body);
    let inner = o?.Envelope?.Body?.getTokenResponse?.getTokenReturn;
    if (inner){
      inner = decodeXml(inner);
      try{
        const io = parser.parse(inner);
        const token = io?.RESPUESTA?.RESP_BODY?.TOKEN;
        if (token) return String(token);
      }catch{}
      const m = inner.match(/<TOKEN>([^<]+)<\/TOKEN>/i);
      if (m) return m[1];
    }
    // RESPUESTA directa
    const token2 = o?.RESPUESTA?.RESP_BODY?.TOKEN;
    if (token2) return String(token2);
  }catch{}

  // Fallback regex global
  const m2 = decodeXml(body).match(/<TOKEN>([^<]+)<\/TOKEN>/i);
  if (m2) return m2[1];

  throw new Error(`No pude obtener TOKEN (status=${status})`);
}

// ——— Cache de token en memoria ———
let _cache = { token: null, exp: 0 };
export async function getTokenCached(){
  const now = Date.now();
  if (_cache.token && now < _cache.exp) return _cache.token;

  const seed  = await getSeed();
  const token = await getTokenFromSeed(seed);

  // Por seguridad, consideramos 30 min de vida (SII suele durar ~1 hora)
  _cache = { token, exp: now + 30*60*1000 };
  return token;
}
