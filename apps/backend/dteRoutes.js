// apps/backend/dteRoutes.js
import express from 'express';
import { uploadSetDte } from './sii/envioDte.js';

export function dteRouter(){
  const r = express.Router();

  // Sube SetDTE ya construido (para probar WS de envío real)
  r.post('/upload', async (req, res) => {
    try{
      const { xml, rutCompany, dvCompany, rutSender, dvSender } = req.body || {};
      const out = await uploadSetDte({ xml, rutCompany, dvCompany, rutSender, dvSender });
      res.json(out);
    }catch(e){
      res.status(400).json({ ok:false, error: e.message });
    }
  });

  return r;
}
