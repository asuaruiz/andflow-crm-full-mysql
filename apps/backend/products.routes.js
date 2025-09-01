import express from "express";
import mysql from "mysql2/promise";
import { getSession } from "./db.js";
import { shopifyFetch } from "./shopifyService.js";

const {
  MYSQL_HOST='127.0.0.1', MYSQL_PORT='3306', MYSQL_USER='root',
  MYSQL_PASSWORD='', MYSQL_DATABASE='andflow'
} = process.env;

const pool = mysql.createPool({
  host: MYSQL_HOST, port: Number(MYSQL_PORT),
  user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DATABASE,
  waitForConnections: true, connectionLimit: 10
});

async function getTenantId(req){
  let tenantId = null;
  try{
    const token = req.cookies?.session;
    if (token) {
      const sess = await getSession(token);
      tenantId = sess?.selected_tenant_id ?? null;
    }
  }catch{}
  if (!tenantId) {
    const hdr = req.headers["x-tenant-id"] || req.headers["x-tenant"];
    const q = req.query?.tenantId || req.query?.tenant;
    tenantId = Number(hdr || q) || null;
  }
  if (!tenantId) throw Object.assign(new Error("NO_TENANT"), { status:400 });
  return tenantId;
}

function escCsv(v){
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

export function productsRouter(){
  const r = express.Router();

  // LISTAR
  r.get("/", async (req,res)=>{
    try{
      const tenantId = await getTenantId(req);
      const q = String(req.query.q || "").trim();
      const limit = Math.min(Math.max(Number(req.query.limit||500), 1), 2000);

      const conn = await pool.getConnection();
      try{
        const whereLike = `%${q.toLowerCase()}%`;
        const [rows] = await conn.query(
          `
          SELECT * FROM products_master
          WHERE tenant_id=? AND (
            ?='' OR
            LOWER(sku)      LIKE ? OR
            LOWER(nombre)         LIKE ? OR
            LOWER(marca)          LIKE ?
          )
          ORDER BY updated_at DESC
          LIMIT ?
          `,
          [tenantId, q, whereLike, whereLike, whereLike, limit]
        );
        res.json({ ok:true, items: rows });
      } finally { conn.release(); }
    }catch(e){
      res.status(e.status||500).json({ ok:false, error:e.message });
    }
  });

  // EXPORT CSV
  r.get("/export", async (req,res)=>{
    try{
      const tenantId = await getTenantId(req);
      const conn = await pool.getConnection();
      try{
        const [rows] = await conn.query(`SELECT * FROM products_master WHERE tenant_id=? ORDER BY sku ASC`, [tenantId]);

        const cols = [
          "sku","sku_proveedor","ean","nombre","marca","especie","categoria","subcategoria",
          "desc_breve","desc_larga","imagenes","proveedor","disponible","uc","dif","costo_neto","costo_con_iva",
          "psp","precio_referencia","pvp","pvp_sin_iva","margen_bruto_pct","margen_con_iva_pct","margen_bruto_clp",
          "precio_min_estr_sin_iva","precio_min_estr_con_iva","tipo_venta","precio_descuento","margen_total",
          "venta_total","margen_general","peso_kg","unidad_peso","dimensiones","fragil","estacionalidad","recurrente",
          "etiquetas_shopify","activo_en_tienda","segmentacion_ticket","nivel_rotacion","tipo_producto_consumo","observacion"
        ];

        const header = cols.join(",") + "\n";
        const body = rows.map(r => cols.map(c=>{
          const v = c==="imagenes" && r.imagenes ? JSON.stringify(r.imagenes) : r[c];
          return escCsv(v ?? "");
        }).join(",")).join("\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="maestra_productos.csv"`);
        res.send(header + body);
      } finally { conn.release(); }
    }catch(e){
      res.status(e.status||500).json({ ok:false, error:e.message });
    }
  });

  // CREAR / EDITAR (upsert por sku)
  r.post("/", async (req,res)=>{
    try{
      const tenantId = await getTenantId(req);
      const p = req.body || {};
      if (!p.sku || !p.nombre) return res.status(400).json({ ok:false, error:"sku y nombre son requeridos" });

      const now = new Date();
      const conn = await pool.getConnection();
      try{
        await conn.query(
          `INSERT INTO products_master
           (tenant_id, sku, sku_proveedor, ean, nombre, marca, especie, categoria, subcategoria,
            desc_breve, desc_larga, imagenes, proveedor, disponible, uc, dif, costo_neto, costo_con_iva,
            psp, precio_referencia, pvp, pvp_sin_iva, margen_bruto_pct, margen_con_iva_pct, margen_bruto_clp,
            precio_min_estr_sin_iva, precio_min_estr_con_iva, tipo_venta, precio_descuento, margen_total,
            venta_total, margen_general, peso_kg, unidad_peso, dimensiones, fragil, estacionalidad,
            recurrente, etiquetas_shopify, activo_en_tienda, segmentacion_ticket, nivel_rotacion,
            tipo_producto_consumo, observacion, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
              sku_proveedor=VALUES(sku_proveedor), ean=VALUES(ean), nombre=VALUES(nombre),
              marca=VALUES(marca), especie=VALUES(especie), categoria=VALUES(categoria), subcategoria=VALUES(subcategoria),
              desc_breve=VALUES(desc_breve), desc_larga=VALUES(desc_larga), imagenes=VALUES(imagenes), proveedor=VALUES(proveedor),
              disponible=VALUES(disponible), uc=VALUES(uc), dif=VALUES(dif),
              costo_neto=VALUES(costo_neto), costo_con_iva=VALUES(costo_con_iva), psp=VALUES(psp),
              precio_referencia=VALUES(precio_referencia), pvp=VALUES(pvp), pvp_sin_iva=VALUES(pvp_sin_iva),
              margen_bruto_pct=VALUES(margen_bruto_pct), margen_con_iva_pct=VALUES(margen_con_iva_pct),
              margen_bruto_clp=VALUES(margen_bruto_clp), precio_min_estr_sin_iva=VALUES(precio_min_estr_sin_iva),
              precio_min_estr_con_iva=VALUES(precio_min_estr_con_iva), tipo_venta=VALUES(tipo_venta),
              precio_descuento=VALUES(precio_descuento), margen_total=VALUES(margen_total),
              venta_total=VALUES(venta_total), margen_general=VALUES(margen_general),
              peso_kg=VALUES(peso_kg), unidad_peso=VALUES(unidad_peso), dimensiones=VALUES(dimensiones),
              fragil=VALUES(fragil), estacionalidad=VALUES(estacionalidad), recurrente=VALUES(recurrente),
              etiquetas_shopify=VALUES(etiquetas_shopify), activo_en_tienda=VALUES(activo_en_tienda),
              segmentacion_ticket=VALUES(segmentacion_ticket), nivel_rotacion=VALUES(nivel_rotacion),
              tipo_producto_consumo=VALUES(tipo_producto_consumo), observacion=VALUES(observacion),
              updated_at=VALUES(updated_at)
          `,
          [
            tenantId, p.sku, p.sku_proveedor ?? null, p.ean ?? null, p.nombre, p.marca ?? null, p.especie ?? null, p.categoria ?? null, p.subcategoria ?? null,
            p.desc_breve ?? null, p.desc_larga ?? null, p.imagenes ? JSON.stringify(p.imagenes) : null, p.proveedor ?? null, p.disponible?1:0, p.uc ?? null, p.dif ?? null,
            p.costo_neto ?? null, p.costo_con_iva ?? null, p.psp ?? null, p.precio_referencia ?? null, p.pvp ?? null, p.pvp_sin_iva ?? null,
            p.margen_bruto_pct ?? null, p.margen_con_iva_pct ?? null, p.margen_bruto_clp ?? null, p.precio_min_estr_sin_iva ?? null, p.precio_min_estr_con_iva ?? null,
            p.tipo_venta ?? null, p.precio_descuento ?? null, p.margen_total ?? null, p.venta_total ?? null, p.margen_general ?? null,
            p.peso_kg ?? null, p.unidad_peso ?? "kg", p.dimensiones ?? null, p.fragil?1:0, p.estacionalidad ?? null, p.recurrente?1:0,
            p.etiquetas_shopify ?? null, p.activo_en_tienda?1:0, p.segmentacion_ticket ?? null, p.nivel_rotacion ?? null, p.tipo_producto_consumo ?? null,
            p.observacion ?? null, now, now
          ]
        );
        res.json({ ok:true });
      } finally { conn.release(); }
    }catch(e){
      res.status(e.status||500).json({ ok:false, error:e.message });
    }
  });

  // SYNC desde Shopify (productos + variantes)
  r.post("/shopify/sync", async (req,res)=>{
    try{
      const tenantId = await getTenantId(req);
      // 1) pedir a Shopify
      const fields = [
        "id","title","body_html","vendor","product_type","status","tags",
        "variants","images"
      ].join(",");
      const data = await shopifyFetch(req, `/products.json?limit=250&fields=${fields}`, { method:"GET" });
      const products = Array.isArray(data.products) ? data.products : [];

      // 2) mapear variantes → filas maestra
      const rows = [];
      for (const p of products) {
        const imgs = (p.images||[]).map(i=>i.src);
        for (const v of (p.variants||[])) {
          if (!v.sku) continue; // requiere SKU
          const price = v.price ? Number(v.price) : null;
          const pvp_sin_iva = price != null ? Number(price / 1.19) : null; // CL
          const peso_kg = v.grams ? (Number(v.grams)/1000) : null;
          rows.push({
            sku: v.sku,
            sku_proveedor: v.sku,
            ean: v.barcode || null,
            nombre: p.title,
            marca: p.vendor || null,
            especie: null,
            categoria: p.product_type || null,
            subcategoria: null,
            desc_breve: p.body_html ? p.body_html.replace(/<[^>]+>/g,'').slice(0,250) : null,
            desc_larga: p.body_html ? p.body_html.replace(/<[^>]+>/g,'') : null,
            imagenes: imgs,
            proveedor: null,
            disponible: p.status === "active" ? 1 : 0,
            uc: null, dif: null,
            costo_neto: null,
            costo_con_iva: null,
            psp: null,
            precio_referencia: v.compare_at_price ? Number(v.compare_at_price) : null,
            pvp: price,
            pvp_sin_iva,
            margen_bruto_pct: null,
            margen_con_iva_pct: null,
            margen_bruto_clp: null,
            precio_min_estr_sin_iva: null,
            precio_min_estr_con_iva: null,
            tipo_venta: "Unidad",
            precio_descuento: null,
            margen_total: null,
            venta_total: null,
            margen_general: null,
            peso_kg,
            unidad_peso: "kg",
            dimensiones: null,
            fragil: 0,
            estacionalidad: null,
            recurrente: 0,
            etiquetas_shopify: (p.tags||"") || null,
            activo_en_tienda: p.status === "active" ? 1 : 0,
            segmentacion_ticket: null,
            nivel_rotacion: null,
            tipo_producto_consumo: null,
            observacion: null
          });
        }
      }

      // 3) upsert masivo
      if (rows.length){
        const now = new Date();
        const conn = await pool.getConnection();
        try{
          const cols = [
            "tenant_id","sku","sku_proveedor","ean","nombre","marca","especie","categoria","subcategoria",
            "desc_breve","desc_larga","imagenes","proveedor","disponible","uc","dif","costo_neto","costo_con_iva",
            "psp","precio_referencia","pvp","pvp_sin_iva","margen_bruto_pct","margen_con_iva_pct","margen_bruto_clp",
            "precio_min_estr_sin_iva","precio_min_estr_con_iva","tipo_venta","precio_descuento","margen_total",
            "venta_total","margen_general","peso_kg","unidad_peso","dimensiones","fragil","estacionalidad","recurrente",
            "etiquetas_shopify","activo_en_tienda","segmentacion_ticket","nivel_rotacion","tipo_producto_consumo","observacion",
            "created_at","updated_at"
          ];
          const placeholders = `(${cols.map(()=>'?').join(',')})`;
          const sql = `
            INSERT INTO products_master (${cols.join(',')})
            VALUES ${rows.map(()=>placeholders).join(',')}
            ON DUPLICATE KEY UPDATE
              sku_proveedor=VALUES(sku_proveedor), ean=VALUES(ean), nombre=VALUES(nombre),
              marca=VALUES(marca), especie=VALUES(especie), categoria=VALUES(categoria), subcategoria=VALUES(subcategoria),
              desc_breve=VALUES(desc_breve), desc_larga=VALUES(desc_larga), imagenes=VALUES(imagenes), proveedor=VALUES(proveedor),
              disponible=VALUES(disponible), uc=VALUES(uc), dif=VALUES(dif),
              costo_neto=VALUES(costo_neto), costo_con_iva=VALUES(costo_con_iva), psp=VALUES(psp),
              precio_referencia=VALUES(precio_referencia), pvp=VALUES(pvp), pvp_sin_iva=VALUES(pvp_sin_iva),
              margen_bruto_pct=VALUES(margen_bruto_pct), margen_con_iva_pct=VALUES(margen_con_iva_pct),
              margen_bruto_clp=VALUES(margen_bruto_clp), precio_min_estr_sin_iva=VALUES(precio_min_estr_sin_iva),
              precio_min_estr_con_iva=VALUES(precio_min_estr_con_iva), tipo_venta=VALUES(tipo_venta),
              precio_descuento=VALUES(precio_descuento), margen_total=VALUES(margen_total),
              venta_total=VALUES(venta_total), margen_general=VALUES(margen_general),
              peso_kg=VALUES(peso_kg), unidad_peso=VALUES(unidad_peso), dimensiones=VALUES(dimensiones),
              fragil=VALUES(fragil), estacionalidad=VALUES(estacionalidad), recurrente=VALUES(recurrente),
              etiquetas_shopify=VALUES(etiquetas_shopify), activo_en_tienda=VALUES(activo_en_tienda),
              segmentacion_ticket=VALUES(segmentacion_ticket), nivel_rotacion=VALUES(nivel_rotacion),
              tipo_producto_consumo=VALUES(tipo_producto_consumo), observacion=VALUES(observacion),
              updated_at=VALUES(updated_at)
          `;
          const args = [];
          for (const row of rows){
            args.push(
              tenantId, row.sku, row.sku_proveedor, row.ean, row.nombre, row.marca, row.especie, row.categoria, row.subcategoria,
              row.desc_breve, row.desc_larga, JSON.stringify(row.imagenes||null), row.proveedor, row.disponible, row.uc, row.dif,
              row.costo_neto, row.costo_con_iva, row.psp, row.precio_referencia, row.pvp, row.pvp_sin_iva, row.margen_bruto_pct, row.margen_con_iva_pct,
              row.margen_bruto_clp, row.precio_min_estr_sin_iva, row.precio_min_estr_con_iva, row.tipo_venta, row.precio_descuento, row.margen_total,
              row.venta_total, row.margen_general, row.peso_kg, row.unidad_peso, row.dimensiones, row.fragil, row.estacionalidad, row.recurrente,
              row.etiquetas_shopify, row.activo_en_tienda, row.segmentacion_ticket, row.nivel_rotacion, row.tipo_producto_consumo, row.observacion,
              now, now
            );
          }
          await conn.query(sql, args);
        } finally { pool.releaseConnection(conn); }
      }

      res.json({ ok:true, imported: rows.length });
    }catch(e){
      res.status(e.status||500).json({ ok:false, error:e.message });
    }
  });

  return r;
}
