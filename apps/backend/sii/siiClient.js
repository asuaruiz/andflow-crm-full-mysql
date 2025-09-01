// apps/backend/sii/siiClient.js
import soap from 'soap';
import axios from 'axios';
import FormData from 'form-data';
import { XMLParser } from 'fast-xml-parser';
import { signXmlEnveloped } from './xmlSign.js';

const ENV = (process.env.SII_ENV || 'cert').toLowerCase();       // cert | prod
const HOST = ENV === 'prod' ? 'palena.sii.cl' : 'maullin.sii.cl';

const WSDL_CRSEED   = `https://${HOST}/DTEWS/CrSeed.jws?WSDL`;
const WSDL_GETTOKEN = `https://${HOST}/DTEWS/GetTokenFromSeed.jws?WSDL`;
const WSDL_Q_ESTUP  = `https://${HOST}/DTEWS/QueryEstUp.jws?WSDL`;
const WSDL_Q_ESTDTE = `https://${HOST}/DTEWS/QueryEstDte.jws?WSDL`;
const URL_UPLOAD    = `https://${HOST}/cgi_dte/UPL/DTEUpload`;

// Parse util
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true });

// --- 1) Obtener semilla ---
export async function getSeed() {
  const cli = await soap.createClientAsync(WSDL_CRSEED);
  const [resp] = await cli.getSeedAsync({});
  const raw = resp.getSeedReturn;
  const obj = parser.parse(raw);

  // Con removeNSPrefix: true, ya no tienes "SII:" en los nombres
  const seed = obj?.RESPUESTA?.RESP_BODY?.SEMILLA ?? null;
  if (!seed) {
    throw new Error('No pude extraer SEMILLA del XML');
  }

  return { seed, raw };
}

// --- 2) Firmar semilla y pedir token ---
export async function signSeedXml(seed, pfxPath, pfxPass){
  // Estructura según manual (getToken con <item><Semilla>...</Semilla></item>) y firma enveloped del documento
  const xml = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;
  const signed = await signXmlEnveloped({
    xml,
    referenceXPath: "/*",              // firmar el documento raíz (URI="")
    pfxPath: pfxPath || process.env.SII_CERT_PFX_PATH,
    pfxPass: pfxPass || process.env.SII_CERT_PFX_PASS,
    // Algoritmos clásicos del manual (RSA-SHA1 + SHA1) para WS de auth
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    digestAlgorithm:    'http://www.w3.org/2000/09/xmldsig#sha1'
  });
  return signed;
}

export async function getTokenFromSignedSeed(signedSeedXml) {
  const cli = await soap.createClientAsync(WSDL_GETTOKEN);
  const [resp] = await cli.getTokenAsync({ pszXml: signedSeedXml });
  const raw = resp.getTokenReturn;
  const obj = parser.parse(raw);

  const token = obj?.RESPUESTA?.RESP_BODY?.TOKEN ?? null;
  if (!token) {
    const est = obj?.RESPUESTA?.RESP_HDR?.ESTADO ?? 'desconocido';
    throw new Error(`No pude obtener TOKEN (estado=${est})`);
  }

  return token;
}
// Helper para obtener un token fresco si no me pasaron uno
async function ensureToken(passedToken){
  if (passedToken) return passedToken;
  const { seed } = await getSeed();
  const signed = await signSeedXml(seed);
  return getTokenFromSignedSeed(signed);
}

// --- 3) Upload EnvioDTE ---
// xmlBuf: Buffer del EnvioDTE.xml ya firmado (con tus CAF / firma DTE)
export async function uploadEnvioDTE(xmlBuf, token){
  const t = await ensureToken(token);
  const form = new FormData();
  form.append('rutSender',  process.env.SII_RUT_SENDER);
  form.append('dvSender',   process.env.SII_DV_SENDER);
  form.append('rutCompany', process.env.SII_RUT_COMPANY);
  form.append('dvCompany',  process.env.SII_DV_COMPANY);
  form.append('archivo', xmlBuf, { filename: 'EnvioDTE.xml', contentType: 'application/xml' });

  const { data, headers } = await axios.post(URL_UPLOAD, form, {
    headers: { ...form.getHeaders(), Cookie: `TOKEN=${t}` }
  });

  // El upload devuelve HTML con el trackid; parseo básico:
  const m = String(data).match(/TRACKID=(\d+)/i) || String(data).match(/<TRACKID>(\d+)<\/TRACKID>/i);
  const trackid = m ? m[1] : null;
  return { trackid, raw: String(data), setCookie: headers['set-cookie'] || null };
}

// --- 4) Estado de envío ---
export async function queryEstUp(trackid){
  const cli = await soap.createClientAsync(WSDL_Q_ESTUP);
  // getEstUp(RutConsultante, DvConsultante, TrackId)
  const [resp] = await cli.getEstUpAsync({
    RutConsultante: process.env.SII_RUT_COMPANY,
    DvConsultante:  process.env.SII_DV_COMPANY,
    TrackId: trackid
  });
  return resp?.getEstUpReturn || resp;
}

// --- 5) Estado de un DTE ---
export async function queryEstDte({ rutEmisor, dvEmisor, rutReceptor, dvReceptor, tipoDte, folio, fechaEmision, montoTotal }){
  const cli = await soap.createClientAsync(WSDL_Q_ESTDTE);
  // getEstDte(RutConsultante,DvConsultante,RutComp,DvComp,TipoDte,Folio,FechaEmision,Monto)
  const [resp] = await cli.getEstDteAsync({
    RutConsultante: process.env.SII_RUT_COMPANY,
    DvConsultante:  process.env.SII_DV_COMPANY,
    RutComp: rutEmisor,
    DvComp:  dvEmisor,
    TipoDte: tipoDte,
    Folio:   folio,
    FechaEmision: fechaEmision, // YYYY-MM-DD
    Monto:   montoTotal
  });
  return resp?.getEstDteReturn || resp;
}
