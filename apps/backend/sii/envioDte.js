// apps/backend/sii/envioDte.js
import axios from 'axios';
import FormData from 'form-data';
import { getTokenCached } from './siiAuth.js';

const ENV = (process.env.SII_ENV || 'cert').toLowerCase();
const HOST = ENV === 'prod' ? 'palena.sii.cl' : 'maullin.sii.cl';

// Puedes sobreescribir desde .env si tu SII exige otro path (p.ej. boletas)
const URL_UPLOAD = process.env.SII_UPLOAD_URL || `https://${HOST}/cgi_dte/UPL/DTEUpload`;

/**
 * Sube un SetDTE XML al SII (multipart/form-data).
 * Requiere: RUT del emisor (empresa) y del firmante (sender).
 */
export async function uploadSetDte({
  xml,               // string del SetDTE firmado (NO el token; esto es el sobre con Caratula, SetDTE, Signature)
  rutCompany, dvCompany,
  rutSender,  dvSender,
}) {
  if (!xml) throw new Error('xml requerido');
  if (!rutCompany || !dvCompany || !rutSender || !dvSender) {
    throw new Error('Faltan RUT/DV (company/sender)');
  }

  const token = await getTokenCached();

  const form = new FormData();
  form.append('rutSender', String(rutSender));
  form.append('dvSender',  String(dvSender));
  form.append('rutCompany', String(rutCompany));
  form.append('dvCompany',  String(dvCompany));
  // el campo del archivo suele llamarse "archivo" (o "file"); SII acepta "archivo"
  form.append('archivo', Buffer.from(xml, 'utf-8'), { filename: 'envio.xml', contentType: 'text/xml' });

  const headers = {
    ...form.getHeaders(),
    'User-Agent': 'andflow/1.0',
    // El TOKEN va como cookie
    'Cookie': `TOKEN=${token}`,
  };

  const { data, status } = await axios.post(URL_UPLOAD, form, {
    headers,
    validateStatus:()=>true,
    timeout: 30000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const body = String(data);
  // Respuesta típica: XML con <TRACKID> o un HTML con error
  const m = body.match(/<TRACKID>(\d+)<\/TRACKID>/i);
  if (m) {
    return { ok:true, trackid: m[1], raw: body };
  }
  return { ok:false, status, raw: body };
}
