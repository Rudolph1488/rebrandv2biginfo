export interface DtfRollSettings {
  roll_width_cm: number;
  price_per_meter: number;
  gap_cm: number;
  press_cost_per_print: number;
  markup_multiplier: number;
}

export const DEFAULT_DTF_SETTINGS: DtfRollSettings = {
  roll_width_cm: 58,
  price_per_meter: 350,
  gap_cm: 1,
  press_cost_per_print: 15,
  markup_multiplier: 2.5,
};

export interface DtfNestingResult {
  perRow: number;
  rows: number;
  lengthCm: number;
  meters: number;
  rotated: boolean;
  filmCostTotal: number;
  filmCostPerUnit: number;
  pressCostPerUnit: number;
  costPerUnit: number;
  recommendedPricePerUnit: number;
}

/**
 * Calculates optimal 2D row nesting on a DTF roll (e.g. 58 cm wide)
 * checking both normal and 90-degree rotated orientations with cut gap.
 */
export function calculateDtfNesting(params: {
  widthCm: number;
  heightCm: number;
  qty: number;
  settings?: Partial<DtfRollSettings> | null;
}): DtfNestingResult {
  const s = { ...DEFAULT_DTF_SETTINGS, ...(params.settings || {}) };
  const qty = Math.max(1, Math.floor(params.qty || 1));
  const rollW = Math.max(10, Number(s.roll_width_cm) || 58);
  const gap = Math.max(0, Number(s.gap_cm) ?? 1);
  const pricePerM = Math.max(0, Number(s.price_per_meter) || 0);
  const pressCost = Math.max(0, Number(s.press_cost_per_print) || 0);
  const markup = Math.max(1, Number(s.markup_multiplier) || 2.5);

  const w = Math.max(1, Number(params.widthCm) || 1) + gap;
  const h = Math.max(1, Number(params.heightCm) || 1) + gap;

  const perRowNormal = Math.floor(rollW / w);
  const perRowRotated = Math.floor(rollW / h);

  const lengthNormal =
    perRowNormal >= 1 ? Math.ceil(qty / perRowNormal) * h : Infinity;
  const lengthRotated =
    perRowRotated >= 1 ? Math.ceil(qty / perRowRotated) * w : Infinity;

  let perRow = 1;
  let rows = qty;
  let lengthCm = qty * Math.min(w, h);
  let rotated = false;

  if (lengthNormal === Infinity && lengthRotated === Infinity) {
    // Wider than roll even rotated — fallback by area
    const areaRatio = (w * h * qty) / (rollW * 100);
    lengthCm = Math.ceil(areaRatio * 100);
  } else if (lengthRotated < lengthNormal) {
    rotated = true;
    perRow = perRowRotated;
    rows = Math.ceil(qty / perRow);
    lengthCm = rows * w;
  } else {
    rotated = false;
    perRow = perRowNormal;
    rows = Math.ceil(qty / perRow);
    lengthCm = rows * h;
  }

  const meters = Number((lengthCm / 100).toFixed(2));
  const filmCostTotal = Number((meters * pricePerM).toFixed(2));
  const filmCostPerUnit = Number((filmCostTotal / qty).toFixed(2));
  const costPerUnit = Number((filmCostPerUnit + pressCost).toFixed(2));
  const recommendedPricePerUnit =
    Math.ceil((costPerUnit * markup) / 5) * 5;

  return {
    perRow,
    rows,
    lengthCm: Number(lengthCm.toFixed(1)),
    meters,
    rotated,
    filmCostTotal,
    filmCostPerUnit,
    pressCostPerUnit: pressCost,
    costPerUnit,
    recommendedPricePerUnit,
  };
}
