// Manually checked public supplier price snapshots. These are not live quotes or inventory promises.
// Keep the original currency; do not silently convert USD to CNY or match alternative MPNs.
export type BomReferencePrice = {
  kind: "supplier" | "supplier-reference" | "estimate";
  display: string;
  supplier?: string;
  supplierSku?: string;
  sourceUrl?: string;
  checkedAt?: string;
  minimumQuantity?: number;
};

const checkedAt = "2026-09-28";
const snapshots: Record<string, Omit<BomReferencePrice, "kind"> & { kind: "supplier" | "supplier-reference" }> = {
  "ESP32-C3-MINI-1-N4": {
    kind: "supplier", display: "US$3.8274/件", supplier: "LCSC", supplierSku: "C2838502",
    sourceUrl: "https://www.lcsc.com/product-detail/rf%20modules_espressif%20systems_esp32-c3-mini-1-n4_C2838502.html",
    checkedAt, minimumQuantity: 1,
  },
  "ESP32-S3-WROOM-1-N8R8": {
    kind: "supplier-reference", display: "US$5.0496/件", supplier: "LCSC", supplierSku: "C2913201",
    sourceUrl: "https://www.lcsc.com/product-detail/wifi%20modules_espressif%20systems_esp32-s3-wroom-1-n8r8_C2913201.html",
    checkedAt, minimumQuantity: 1,
  },
  "BH1750FVI-TR": {
    kind: "supplier", display: "US$0.9515/件", supplier: "LCSC", supplierSku: "C78960",
    sourceUrl: "https://www.lcsc.com/product-detail/C78960.html", checkedAt, minimumQuantity: 1,
  },
  "BQ24074RGTR": {
    kind: "supplier", display: "US$2.1424/件", supplier: "LCSC", supplierSku: "C54313",
    sourceUrl: "https://www.lcsc.com/product-detail/Battery-Management_Texas-Instruments-BQ24074RGTR_C54313.html",
    checkedAt, minimumQuantity: 1,
  },
  "MCP73871T-2CCI/ML": {
    kind: "supplier", display: "US$2.2010/件", supplier: "LCSC", supplierSku: "C511310",
    sourceUrl: "https://www.lcsc.com/product-detail/C511310.html", checkedAt, minimumQuantity: 1,
  },
};

export function bomReferencePrice(model: string, estCost: string): BomReferencePrice {
  // Generated BOMs often contain "A/B", "or equivalent" or multiple module choices.
  // Only an entire, exact MPN can inherit a product-page price.
  const snapshot = snapshots[model.trim().toUpperCase()];
  return snapshot ? { ...snapshot } : { kind: "estimate", display: estCost };
}

export type PricedBomLine = { model: string; estCost: string; referencePrice?: BomReferencePrice };

// New jobs persist the source snapshot with the model result. Historical jobs did not;
// their fallback is a current reference, not evidence of the price at generation time.
export function freezeBomPrices<T extends { bom: PricedBomLine[] }>(result: T): Omit<T, "bom"> & { bom: (T["bom"][number] & { referencePrice: BomReferencePrice })[] } {
  return { ...result, bom: result.bom.map(line => ({ ...line, referencePrice: bomReferencePrice(line.model, line.estCost) })) };
}

export function recordedOrCurrentBomPrice(line: PricedBomLine): BomReferencePrice {
  return line.referencePrice ?? bomReferencePrice(line.model, line.estCost);
}
