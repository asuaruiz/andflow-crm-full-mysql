// apps/backend/sii/routes.js
import express from 'express';
import { getSeed, getTokenFromSignedSeed, uploadEnvioDTE, queryEstUp, queryEstDte, signSeedXml } from './siiClient.js';
import { emitirBoletaDesdeShopify } from './boletaShopify.js';


export function siiRouter(){
  const r = express.Router();

  // 1) Obtener semilla
  r.get('/seed', async (_req, res) => {
    try {
      const { seed, raw } = await getSeed();
      res.json({ ok: true, seed, raw });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 2) Firmar semilla y pedir TOKEN
  // Body opcional: { pfxPath, pfxPass } si quieres sobreescribir .env
  r.post('/token', async (req, res) => {
    try {
      const { pfxPath, pfxPass } = req.body || {};
      const { seed } = await getSeed();
      const signedXml = await signSeedXml(seed, pfxPath, pfxPass); // XML firmado (enveloped)
      const token = await getTokenFromSignedSeed(signedXml);
      res.json({ ok: true, token, seed });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 3) Upload de EnvioDTE (acepta XML como string o base64)
  // Body: { token?, xml, isBase64? }
  r.post('/upload', async (req, res) => {
    try {
      const { token, xml, isBase64 } = req.body || {};
      if(!xml) throw new Error('Falta xml');
      const xmlBuf = Buffer.from(xml, isBase64 ? 'base64' : 'utf8');
      const resp = await uploadEnvioDTE(xmlBuf, token); // si no pasas token, internamente lo pide
      res.json({ ok: true, ...resp });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 4) Estado de envío (trackid)
  r.get('/estado-envio', async (req, res) => {
    try {
      const { trackid } = req.query;
      if(!trackid) throw new Error('Falta trackid');
      const data = await queryEstUp(String(trackid));
      res.json({ ok: true, data });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 5) Estado DTE (parámetros SII)
  // ?rutEmisor&dvEmisor&rutReceptor&dvReceptor&tipoDte&folio&fechaEmision(YYYY-MM-DD)&montoTotal
  r.get('/estado-dte', async (req, res) => {
    try {
      const q = req.query;
      const required = ['rutEmisor','dvEmisor','rutReceptor','dvReceptor','tipoDte','folio','fechaEmision','montoTotal'];
      for(const k of required){ if(!q[k]) throw new Error(`Falta ${k}`); }
      const data = await queryEstDte({
        rutEmisor: q.rutEmisor, dvEmisor: q.dvEmisor,
        rutReceptor: q.rutReceptor, dvReceptor: q.dvReceptor,
        tipoDte: q.tipoDte, folio: q.folio,
        fechaEmision: q.fechaEmision, montoTotal: q.montoTotal
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  // Emitir boleta desde una orden de Shopify
    r.post('/boleta/shopify/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const out = await emitirBoletaDesdeShopify(orderId);
        res.json({ ok: true, ...out });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
    });

  return r;
}
