// apps/backend/products.master.routes.js
import express from "express";
import mysql from "mysql2/promise";
import multer from "multer";
import * as XLSX from "xlsx";
import { getSession } from "./db.js";

const {
  MYSQL_HOST = "127.0.0.1",
  MYSQL_PORT = "3306",
  MYSQL_USER = "root",
  MYSQL_PASSWORD = "",
  MYSQL_DATABASE = "andflow",
} = process.env;

export function productsMasterRouter() {
  const r = express.Router();
  const upload = multer({ storage: multer.memoryStorage() });

  // Pool local para este router: DECIMAL -> number
  const pool = mysql.createPool({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true, // DECIMAL como number
  });

  // ------------------------- helpers -------------------------
  async function getActiveTenantIdFromReq(req) {
    // 1) cookie => sesión
    try {
      const token = req.cookies?.session;
      if (token) {
        const sess = await getSession(token);
        if (sess?.selected_tenant_id) {
          return { sess, tenantId: sess.selected_tenant_id };
        }
      }
    } catch {}
    // 2) headers / query (para llamadas desde scripts o servicios)
    const hdr = req.headers["x-tenant-id"] || req.headers["x-tenant"];
    const q = req.query?.tenantId || req.query?.tenant;
    const tenantId = Number(hdr || q) || null;
    return { sess: null, tenantId };
  }

  async function ensureProductsTable() {
    const conn = await pool.getConnection();
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS products_master (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          tenant_id BIGINT UNSIGNED NOT NULL,

          sku          VARCHAR(80)  NOT NULL,
          sku_proveedor      VARCHAR(120) NULL,
          ean                VARCHAR(64)  NULL,

          nombre             VARCHAR(255) NOT NULL,
          marca              VARCHAR(120) NULL,
          especie            VARCHAR(120) NULL,
          categoria          VARCHAR(120) NULL,
          subcategoria       VARCHAR(120) NULL,

          desc_breve         VARCHAR(512) NULL,
          desc_larga         TEXT         NULL,
          imagenes           JSON         NULL,
          proveedor          VARCHAR(150) NULL,

          disponible         TINYINT(1)   NOT NULL DEFAULT 1,
          uc                 INT          NULL,
          dif                INT          NULL,

          costo_neto               DECIMAL(14,2) NULL,
          costo_con_iva            DECIMAL(14,2) NULL,
          psp                      DECIMAL(14,2) NULL,
          precio_referencia        DECIMAL(14,2) NULL,
          pvp                      DECIMAL(14,2) NULL,
          pvp_sin_iva              DECIMAL(14,2) NULL,
          margen_bruto_pct         DECIMAL(9,4)  NULL,
          margen_con_iva_pct       DECIMAL(9,4)  NULL,
          margen_bruto_clp         DECIMAL(14,2) NULL,
          precio_min_estr_sin_iva  DECIMAL(14,2) NULL,
          precio_min_estr_con_iva  DECIMAL(14,2) NULL,
          tipo_venta               VARCHAR(64)   NULL,
          precio_descuento         DECIMAL(14,2) NULL,
          margen_total             DECIMAL(14,2) NULL,
          venta_total              DECIMAL(14,2) NULL,
          margen_general           DECIMAL(9,4)  NULL,

          peso_kg             DECIMAL(10,3) NULL,
          unidad_peso         VARCHAR(16)   NULL,
          dimensiones         VARCHAR(64)   NULL,
          fragil              TINYINT(1)    NOT NULL DEFAULT 0,
          estacionalidad      VARCHAR(64)   NULL,
          recurrente          TINYINT(1)    NOT NULL DEFAULT 0,

          etiquetas_shopify   TEXT          NULL,
          activo_en_tienda    TINYINT(1)    NOT NULL DEFAULT 1,
          segmentacion_ticket VARCHAR(64)   NULL,
          nivel_rotacion      VARCHAR(64)   NULL,
          tipo_producto_consumo VARCHAR(64) NULL,
          observacion         TEXT          NULL,

          created_at          DATETIME NOT NULL,
          updated_at          DATETIME NOT NULL,

          UNIQUE KEY ux_tenant_sku (tenant_id, sku),
          KEY ix_tenant (tenant_id),
          KEY ix_ean (ean),
          CONSTRAINT fk_products_master_t FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
      `);

      // migraciones idempotentes (por si existía con tipos estrechos)
      await conn
        .query(`
        ALTER TABLE products_master
          MODIFY COLUMN uc INT NULL,
          MODIFY COLUMN dif INT NULL,
          MODIFY COLUMN margen_bruto_pct DECIMAL(9,4) NULL,
          MODIFY COLUMN margen_con_iva_pct DECIMAL(9,4) NULL,
          MODIFY COLUMN margen_bruto_clp DECIMAL(14,2) NULL,
          MODIFY COLUMN precio_min_estr_sin_iva DECIMAL(14,2) NULL,
          MODIFY COLUMN precio_min_estr_con_iva DECIMAL(14,2) NULL,
          MODIFY COLUMN precio_descuento DECIMAL(14,2) NULL,
          MODIFY COLUMN margen_total DECIMAL(14,2) NULL,
          MODIFY COLUMN venta_total DECIMAL(14,2) NULL,
          MODIFY COLUMN margen_general DECIMAL(9,4) NULL
      `)
        .catch(() => {});

      // índices para búsqueda por tenant/sku/nombre (silenciar si ya existen)
      await conn
        .query(
          `CREATE INDEX ix_tenant_sku_name ON products_master (tenant_id, sku, nombre(100))`
        )
        .catch(() => {});
    } finally {
      conn.release();
    }
  }

  function nowTS() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
  }

  // Normalizadores / parsers
  const norm = (s) =>
    String(s ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const keyId = (s) =>
    norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const toNum = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return v;
    let s = String(v).trim();
    s = s.replace(/\s/g, "");
    s = s.replace(/[$%]/g, "");
    // miles . y decimales , -> punto
    s = s.replace(/\./g, "").replace(/,/g, ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const toInt = (v) => {
    const n = toNum(v);
    return n === null ? null : Math.trunc(n);
  };

  const toBool = (v, def = 0) => {
    if (v === null || v === undefined || v === "") return def;
    if (typeof v === "number") return v > 0 ? 1 : 0;
    const s = norm(v);
    if (["si", "sí", "true", "1", "x", "ok"].includes(s)) return 1;
    if (["no", "false", "0"].includes(s)) return 0;
    const n = toNum(v);
    if (n !== null) return n > 0 ? 1 : 0;
    return def;
  };

  // Helpers locales para PUT
  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const s = String(v)
      .trim()
      .replace(/\s+/g, "")
      .replace(/\$/g, "")
      .replace(/%/g, "")
      .replace(/\./g, "")
      .replace(/,/g, ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const bool01 = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v ? 1 : 0;
    if (typeof v === "boolean") return v ? 1 : 0;
    const s = String(v).trim().toLowerCase();
    return ["1", "true", "si", "sí", "y", "yes", "on"].includes(s) ? 1 : 0;
  };
  const jstr = (v) => {
    if (!v) return null;
    try {
      return JSON.stringify(typeof v === "string" ? JSON.parse(v) : v);
    } catch {
      return JSON.stringify(
        String(v)
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      );
    }
  };

  // Mapa de encabezados del Excel -> campos DB
  function headerToField(hid) {
    const m = {
      sku: "sku",
      sku_proveedor: "sku_proveedor",
      gtin_ean: "ean",
      gtin: "ean",
      ean: "ean",

      nombre_del_producto: "nombre",
      marca: "marca",
      especie: "especie",
      categoria: "categoria",
      subcategoria: "subcategoria",
      descripcion_breve: "desc_breve",
      descripcion_larga: "desc_larga",
      proveedor: "proveedor",

      disponible: "disponible",
      uc_unidades_compradas: "uc",
      uc: "uc",
      dif: "dif",

      costo_unitario_neto_clp: "costo_neto",
      costo_con_iva: "costo_con_iva",

      psp: "psp",
      precio_de_referencia: "precio_referencia",

      pvp: "pvp",
      pvp_s_iva: "pvp_sin_iva",
      pvp_sin_iva: "pvp_sin_iva",

      margen_bruto_: "margen_bruto_pct",
      margen_bruto: "margen_bruto_pct",
      margen_c_iva_: "margen_con_iva_pct",
      margen_c_iva: "margen_con_iva_pct",
      margen_bruto_clp: "margen_bruto_clp",

      precio_minimo_estrategico_s_iva: "precio_min_estr_sin_iva",
      precio_minimo_estrategico_c_iva: "precio_min_estr_con_iva",

      tipo_de_producto: "tipo_venta",
      tipo_de_venta: "tipo_venta",

      precio_con_descuento_opcional: "precio_descuento",
      precio_con_descuento: "precio_descuento",

      margen_total: "margen_total",
      venta_total: "venta_total",
      margen_general: "margen_general",

      peso_del_producto_kg: "peso_kg",
      unidad_de_peso_kg: "unidad_peso",
      dimensiones_l_x_a_x_h: "dimensiones",
      producto_fragil: "fragil",
      estacionalidad: "estacionalidad",
      recurrente: "recurrente",
      etiquetas_shopify: "etiquetas_shopify",
      activo_en_tienda: "activo_en_tienda",
      segmentacion_por_ticket: "segmentacion_ticket",
      nivel_de_rotacion_esperado: "nivel_rotacion",
      es_consumible_producto_durable: "tipo_producto_consumo",
      observacion: "observacion",
    };

    if (m[hid]) return m[hid];

    // Heurísticas
    if (hid.includes("psp")) return "psp";
    if (hid.includes("pvp") && hid.includes("s_iva")) return "pvp_sin_iva";
    if (hid === "p_v_p") return "pvp";
    if (hid.startsWith("margen_bruto")) return "margen_bruto_pct";
    if (hid.startsWith("margen_c_iva")) return "margen_con_iva_pct";
    return null;
  }

  function mapExcelRow(row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      const hid = keyId(k);
      const field = headerToField(hid);
      if (!field) continue;
      out[field] = v;
    }
    return out;
  }

  // ------------------------- SEARCH (autocomplete) -------------------------
  // GET /api/products/master/search?q=term&limit=20
  r.get("/search", async (req, res) => {
    try {
      await ensureProductsTable();
      const { tenantId } = await getActiveTenantIdFromReq(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: "NO_TENANT" });

      const q = String(req.query.q || "").trim();
      if (!q) return res.json({ ok: true, items: [] });
      const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);

      // Like tolerante a espacios (foo bar -> %foo%bar%)
      const like = `%${q.replace(/\s+/g, "%")}%`;

      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(
          `
          SELECT
            id,
            sku AS sku,
            nombre,
            COALESCE(pvp, psp, costo_con_iva, costo_neto, 0) AS price,
            1 AS taxable
          FROM products_master
          WHERE tenant_id=?
            AND (
              sku LIKE ? OR
              nombre LIKE ? OR
              IFNULL(ean,'') LIKE ?
            )
          ORDER BY nombre ASC
          LIMIT ?
          `,
          [tenantId, like, like, like, limit]
        );
        res.json({ ok: true, items: rows });
      } finally {
        conn.release();
      }
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ------------------------- LIST -------------------------
  r.get("/", async (req, res) => {
    try {
      await ensureProductsTable();
      const { tenantId } = await getActiveTenantIdFromReq(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: "NO_TENANT" });

      const q = (req.query.q || "").trim();
      const pageSizeRaw = req.query.pageSize ?? req.query.limit ?? 100;
      const safeLimit = Math.max(1, Math.min(250, Number.parseInt(pageSizeRaw, 10) || 100));
      const safePage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const safeOffset = (safePage - 1) * safeLimit;

      const conn = await pool.getConnection();
      try {
        let where = "tenant_id=?";
        const params = [tenantId];

        if (q) {
          where += " AND (sku LIKE ? OR nombre LIKE ? OR marca LIKE ?)";
          const like = `%${q}%`;
          params.push(like, like, like);
        }

        const [cntRows] = await conn.execute(
          `SELECT COUNT(*) AS c FROM products_master WHERE ${where}`,
          params
        );
        const total = cntRows?.[0]?.c || 0;

        const sql =
          `SELECT * FROM products_master WHERE ${where} ` +
          `ORDER BY nombre ASC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
        const [rows] = await conn.execute(sql, params);

        res.json({ ok: true, items: rows, total, page: safePage, pageSize: safeLimit });
      } finally {
        conn.release();
      }
    } catch (e) {
      console.error("[products.list]", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ------------------------- TRUNCATE (por tenant) -------------------------
  r.post("/truncate", async (req, res) => {
    try {
      await ensureProductsTable();
      const { tenantId } = await getActiveTenantIdFromReq(req);
      if (!tenantId) return res.status(400).json({ ok:false, error:"NO_TENANT" });

      const conn = await pool.getConnection();
      try{
        await conn.execute(`DELETE FROM products_master WHERE tenant_id=?`, [tenantId]);
        res.json({ ok:true });
      } finally { conn.release(); }
    } catch (e) {
      res.status(500).json({ ok:false, error:e.message });
    }
  });

  // ------------------------- TEMPLATE (XLSX) -------------------------
  r.get("/template", async (_req, res) => {
    await ensureProductsTable();
    const headers = [
      "SKU","SKU proveedor","GTIN / EAN","Nombre del producto","Marca","Especie","Categoría","Subcategoría",
      "Descripción breve","Descripción larga","Proveedor","Disponible","UC (Unidades compradas)","DIF",
      "Costo unitario neto (CLP)","Costo con IVA","(PSP)","Precio de referencia","(PVP)","PVP S/IVA",
      "Margen bruto (%)","Margen c/iva (%)","Margen bruto (CLP)",
      "Precio mínimo estratégico s/IVA","Precio mínimo estratégico C/IVA","Tipo de producto",
      "Precio con descuento (opcional)","Margen Total","Venta total","Margen General",
      "Peso del producto (kg)","Unidad de peso (kg)","Dimensiones (L x A x H)","Producto frágil",
      "Estacionalidad","Recurrente","Etiquetas Shopify","Activo en tienda","Segmentación por ticket",
      "Nivel de rotación esperado","Es consumible/Producto durable?","Observación"
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "plantilla");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Maestra_Productos_template.xlsx"`);
    res.send(buf);
  });

  // ------------------------- EXPORT (XLSX) -------------------------
  r.get("/export", async (req, res) => {
    try {
      await ensureProductsTable();
      const { tenantId } = await getActiveTenantIdFromReq(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: "NO_TENANT" });

      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.execute(
          `SELECT * FROM products_master WHERE tenant_id=? ORDER BY nombre ASC`,
          [tenantId]
        );
        const plain = rows.map(r => ({
          ...r,
          imagenes: r.imagenes ? JSON.stringify(r.imagenes) : null,
        }));
        const ws = XLSX.utils.json_to_sheet(plain);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "maestra");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="Maestra_Productos_export.xlsx"`);
        res.send(buf);
      } finally {
        conn.release();
      }
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ------------------------- IMPORT (XLSX) -------------------------
  r.post("/import", upload.single("file"), async (req, res) => {
    try {
      await ensureProductsTable();
      const { tenantId } = await getActiveTenantIdFromReq(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: "NO_TENANT" });
      if (!req.file) return res.status(400).json({ ok: false, error: "Archivo requerido" });

      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

      let imported = 0, updated = 0, skipped = 0;
      const conn = await pool.getConnection();
      try {
        const ts = nowTS();

        // columnas DB en orden (46)
        const COLS = [
          "tenant_id","sku","sku_proveedor","ean","nombre","marca","especie","categoria","subcategoria",
          "desc_breve","desc_larga","imagenes","proveedor","disponible","uc","dif",
          "costo_neto","costo_con_iva","psp","precio_referencia","pvp","pvp_sin_iva",
          "margen_bruto_pct","margen_con_iva_pct","margen_bruto_clp","precio_min_estr_sin_iva","precio_min_estr_con_iva",
          "tipo_venta","precio_descuento","margen_total","venta_total","margen_general",
          "peso_kg","unidad_peso","dimensiones","fragil","estacionalidad","recurrente",
          "etiquetas_shopify","activo_en_tienda","segmentacion_ticket","nivel_rotacion","tipo_producto_consumo","observacion",
          "created_at","updated_at"
        ];
        const placeholders = `(${COLS.map(()=>"?").join(",")})`;
        const updates = COLS.slice(2).map(c => `${c}=VALUES(${c})`).join(",");

        for (const raw of rows) {
          const rmap = mapExcelRow(raw);

          const sku  = (rmap.sku ?? raw.SKU ?? raw.Sku ?? "").toString().trim();
          const nombre = (rmap.nombre ?? raw.Nombre ?? "").toString().trim();
          if (!sku || !nombre) { skipped++; continue; }

          // imagenes: este Excel no trae URLs, así que null
          const imagenesJson = null;

          const valuesObj = {
            tenant_id: tenantId,
            sku: sku,
            sku_proveedor: rmap.sku_proveedor ?? null,
            ean: rmap.ean ?? null,

            nombre: nombre,
            marca: rmap.marca ?? null,
            especie: rmap.especie ?? null,
            categoria: rmap.categoria ?? null,
            subcategoria: rmap.subcategoria ?? null,

            desc_breve: rmap.desc_breve ?? null,
            desc_larga: rmap.desc_larga ?? null,
            imagenes: imagenesJson ? JSON.stringify(imagenesJson) : null,
            proveedor: rmap.proveedor ?? null,

            disponible: toBool(rmap.disponible, 1),
            uc: toInt(rmap.uc),
            dif: toInt(rmap.dif),

            costo_neto: toNum(rmap.costo_neto),
            costo_con_iva: toNum(rmap.costo_con_iva),
            psp: toNum(rmap.psp),
            precio_referencia: toNum(rmap.precio_referencia),
            pvp: toNum(rmap.pvp),
            pvp_sin_iva: toNum(rmap.pvp_sin_iva),

            margen_bruto_pct: toNum(rmap.margen_bruto_pct),
            margen_con_iva_pct: toNum(rmap.margen_con_iva_pct),
            margen_bruto_clp: toNum(rmap.margen_bruto_clp),
            precio_min_estr_sin_iva: toNum(rmap.precio_min_estr_sin_iva),
            precio_min_estr_con_iva: toNum(rmap.precio_min_estr_con_iva),

            tipo_venta: rmap.tipo_venta ?? null,
            precio_descuento: toNum(rmap.precio_descuento),
            margen_total: toNum(rmap.margen_total),
            venta_total: toNum(rmap.venta_total),
            margen_general: toNum(rmap.margen_general),

            peso_kg: toNum(rmap.peso_kg),
            unidad_peso: rmap.unidad_peso ?? "kg",
            dimensiones: rmap.dimensiones ?? null,
            fragil: toBool(rmap.fragil, 0),
            estacionalidad: rmap.estacionalidad ?? null,
            recurrente: toBool(rmap.recurrente, 0),

            etiquetas_shopify: rmap.etiquetas_shopify ?? null,
            activo_en_tienda: toBool(rmap.activo_en_tienda, 1),
            segmentacion_ticket: rmap.segmentacion_ticket ?? null,
            nivel_rotacion: rmap.nivel_rotacion ?? null,
            tipo_producto_consumo: rmap.tipo_producto_consumo ?? null,
            observacion: rmap.observacion ?? null,

            created_at: ts,
            updated_at: ts,
          };

          const vals = COLS.map(c => valuesObj[c] ?? null);

          const [resIns] = await conn.execute(
            `INSERT INTO products_master (${COLS.join(",")})
             VALUES ${placeholders}
             ON DUPLICATE KEY UPDATE ${updates}`,
            vals
          );
          if (resIns.affectedRows === 1) imported++;
          else updated++;
        }
      } finally {
        conn.release();
      }

      res.json({ ok: true, imported, updated, skipped });
    } catch (e) {
      console.error("[products.import]", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ---------- UPDATE ----------
  r.put("/:id", async (req, res) => {
    try {
      await ensureProductsTable();
      const { tenantId } = await getActiveTenantIdFromReq(req);
      if (!tenantId) return res.status(400).json({ ok:false, error:"NO_TENANT" });

      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ ok:false, error:"BAD_ID" });

      // toma solo campos permitidos
      const b = req.body || {};
      const vals = [
        b.sku ?? null,
        b.sku_proveedor ?? null,
        b.ean ?? null,
        b.nombre ?? null,
        b.marca ?? null,
        b.especie ?? null,
        b.categoria ?? null,
        b.subcategoria ?? null,
        b.desc_breve ?? null,
        b.desc_larga ?? null,
        jstr(b.imagenes),
        b.proveedor ?? null,
        bool01(b.disponible),
        num(b.uc),
        num(b.dif),
        num(b.costo_neto),
        num(b.costo_con_iva),
        num(b.psp),
        num(b.precio_referencia),
        num(b.pvp),
        num(b.pvp_sin_iva),
        num(b.margen_bruto_pct),
        num(b.margen_con_iva_pct),
        num(b.margen_bruto_clp),
        num(b.precio_min_estr_sin_iva),
        num(b.precio_min_estr_con_iva),
        b.tipo_venta ?? null,
        num(b.precio_descuento),
        num(b.margen_total),
        num(b.venta_total),
        num(b.margen_general),
        num(b.peso_kg),
        b.unidad_peso ?? null,
        b.dimensiones ?? null,
        bool01(b.fragil),
        b.estacionalidad ?? null,
        bool01(b.recurrente),
        b.etiquetas_shopify ?? null,
        bool01(b.activo_en_tienda),
        b.segmentacion_ticket ?? null,
        b.nivel_rotacion ?? null,
        b.tipo_producto_consumo ?? null,
        b.observacion ?? null,
        id,
        tenantId,
      ];

      const conn = await pool.getConnection();
      try {
        await conn.execute(
          `UPDATE products_master SET
             sku=?, sku_proveedor=?, ean=?, nombre=?, marca=?, especie=?, categoria=?, subcategoria=?,
             desc_breve=?, desc_larga=?, imagenes=?, proveedor=?, disponible=?, uc=?, dif=?,
             costo_neto=?, costo_con_iva=?, psp=?, precio_referencia=?, pvp=?, pvp_sin_iva=?,
             margen_bruto_pct=?, margen_con_iva_pct=?, margen_bruto_clp=?, precio_min_estr_sin_iva=?, precio_min_estr_con_iva=?,
             tipo_venta=?, precio_descuento=?, margen_total=?, venta_total=?, margen_general=?,
             peso_kg=?, unidad_peso=?, dimensiones=?, fragil=?, estacionalidad=?, recurrente=?,
             etiquetas_shopify=?, activo_en_tienda=?, segmentacion_ticket=?, nivel_rotacion=?, tipo_producto_consumo=?, observacion=?,
             updated_at=NOW()
           WHERE id=? AND tenant_id=?`,
          vals
        );
      } catch (e) {
        if (e && e.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ ok:false, error:"SKU ya existe para este tenant" });
        }
        throw e;
      } finally {
        conn.release();
      }

      res.json({ ok:true });
    } catch (e) {
      console.error("[products.update]", e);
      res.status(500).json({ ok:false, error:e.message });
    }
  });

  return r;
}
