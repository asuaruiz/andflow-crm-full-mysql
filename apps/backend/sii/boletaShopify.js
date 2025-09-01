// apps/backend/sii/boletaShopify.js
import { shopifyFetch } from '../shopifyService.js';
import { uploadEnvioDTE } from './siiClient.js';

/**
 * Punto único para emitir Boleta Electrónica (TpoDTE=39) desde una orden de Shopify.
 * - Trae la orden vía Admin API (usa shopifyService.js que ya tienes).
 * - Transforma a DTE (Boleta), arma el EnvioDTE, firma DTE (***pendiente: firma de DTE***),
 * - Sube el EnvioDTE al SII y retorna trackid/folio.
 *
 * IMPORTANTE: Este stub construye un XML MÍNIMO para ilustrar el flujo de integración.
 * Para emisión real debes implementar:
 *  - Timbrado/CAF (asignación de folio y uso de CAF vigente),
 *  - Firma XML del DTE (XAdES/XMLDSig) de cada documento,
 *  - Totales y líneas correctas, descuentos, impuestos, despacho, exentos, etc. según norma.
 */
export async function emitirBoletaDesdeShopify(orderId){
  // 1) Obtener orden de Shopify
  const order = await cargarOrdenShopify(orderId);
  if(!order) throw new Error('No encontré la orden');

  // 2) Mapear datos esenciales
  const receptor = mapReceptor(order);    // boleta no requiere RUT; si tienes RUT, úsalo
  const detalle  = mapDetalle(order);     // líneas de productos
  const totales  = mapTotales(order);     // neto/iva/total (ojo con descuentos/envío)

  // 3) Construir XML EnvioDTE con 1 DTE tipo 39 (boleta afecta)
  const envioXml = construirEnvioDTEStub({ receptor, detalle, totales });

  // 4) SUBIR al SII (usa cookie TOKEN automáticamente)
  const { trackid, raw } = await uploadEnvioDTE(Buffer.from(envioXml, 'utf8'));
  // 5) TODO: persistir trackid/estado en tu BD y, si corresponde, guardar folio usado.

  return { trackid, raw };
}

async function cargarOrdenShopify(orderId){
  // Usa tu helper ya existente
  const resp = await shopifyFetch(`/admin/api/2024-10/orders/${orderId}.json`, { method: 'GET' });
  return resp?.order || null;
}

/** Mapea datos del receptor (para boleta es opcional RUT; usa nombre/email/teléfono/dirección si existen) */
function mapReceptor(order){
  const shipping = order?.shipping_address || order?.customer?.default_address || {};
  return {
    razonSocial: `${shipping?.first_name || ''} ${shipping?.last_name || ''}`.trim() || 'Consumidor Final',
    email: order?.email || shipping?.email || null,
    telefono: shipping?.phone || order?.phone || null,
    direccion: `${shipping?.address1 || ''} ${shipping?.address2 || ''}`.trim(),
    comuna: shipping?.city || '',
  };
}

/** Convierte line_items de Shopify a líneas DTE (afectas, sin manejo de exentos en este stub) */
function mapDetalle(order){
  const items = order?.line_items || [];
  return items.map((it, idx) => ({
    NroLinDet: idx + 1,
    NmbItem: it.title,
    QtyItem: it.quantity,
    PrcItem: Number(it.price),         // precio unitario
    MontoItem: Math.round(Number(it.price) * it.quantity), // simplificado (sin descuentos a nivel línea)
  }));
}

/** Totales simples (asume IVA 19% y totales de Shopify) */
function mapTotales(order){
  const total = Number(order?.current_total_price || order?.total_price || 0);
  // Shopify entrega fields tax_lines; si tu tienda está con precio con/ sin IVA, ajusta aquí
  // Para el stub, aproximamos neto e IVA con 19%
  const neto = Math.round(total / 1.19);
  const iva  = total - neto;
  return { MntNeto: neto, IVA: Math.round(iva), MntTotal: Math.round(total) };
}

/**
 * Construye un EnvioDTE **ilustrativo** con un DTE tipo 39 (boleta).
 * NO ES VÁLIDO PARA PRODUCCIÓN. Te deja el esqueleto para conectar el flujo.
 * Reemplaza por tu constructor real con CAF, folio, timbres, firma DTE, referencias, etc.
 */
function construirEnvioDTEStub({ receptor, detalle, totales }){
  const now = new Date().toISOString().slice(0,19).replace('T',' ');
  const detalleXml = detalle.map(d => `
    <Detalle>
      <NroLinDet>${d.NroLinDet}</NroLinDet>
      <NmbItem>${escapeXml(d.NmbItem)}</NmbItem>
      <QtyItem>${d.QtyItem}</QtyItem>
      <PrcItem>${d.PrcItem}</PrcItem>
      <MontoItem>${d.MontoItem}</MontoItem>
    </Detalle>`).join('');

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE version="1.0">
  <SetDTE ID="SetDoc">
    <Caratula version="1.0">
      <RutEmisor>${process.env.SII_RUT_COMPANY}-${process.env.SII_DV_COMPANY}</RutEmisor>
      <RutEnvia>${process.env.SII_RUT_SENDER}-${process.env.SII_DV_SENDER}</RutEnvia>
      <RutReceptor>60803000-K</RutReceptor>
      <FchResol>2020-01-01</FchResol>
      <NroResol>0</NroResol>
      <TmstFirmaEnv>${now}</TmstFirmaEnv>
      <SubTotDTE><TpoDTE>39</TpoDTE><NroDTE>1</NroDTE></SubTotDTE>
    </Caratula>

    <DTE version="1.0">
      <Documento>
        <Encabezado>
          <IdDoc>
            <TipoDTE>39</TipoDTE>
            <Folio>0</Folio>
            <FchEmis>${now.slice(0,10)}</FchEmis>
          </IdDoc>
          <Emisor>
            <RUTEmisor>${process.env.SII_RUT_COMPANY}-${process.env.SII_DV_COMPANY}</RUTEmisor>
            <RznSocEmisor>Tu Empresa S.A.</RznSocEmisor>
            <GiroEmis>Giro</GiroEmis>
            <Acteco>000000</Acteco>
          </Emisor>
          <Receptor>
            <RznSocRecep>${escapeXml(receptor.razonSocial || 'Consumidor Final')}</RznSocRecep>
          </Receptor>
          <Totales>
            <MntNeto>${totales.MntNeto}</MntNeto>
            <IVA>${totales.IVA}</IVA>
            <MntTotal>${totales.MntTotal}</MntTotal>
          </Totales>
        </Encabezado>
        ${detalleXml}
        <!-- *** FALTA ***: TmstFirma, TED (timbre con CAF), firma del DTE, etc. -->
      </Documento>
    </DTE>
  </SetDTE>
</EnvioDTE>`;
}

function escapeXml(str = ''){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
