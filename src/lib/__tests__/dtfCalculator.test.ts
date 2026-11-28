import { describe, it, expect } from 'vitest';
import { calculateDtfNesting, DEFAULT_DTF_SETTINGS } from '../dtfCalculator';

describe('calculateDtfNesting', () => {
  it('nests 5 x 10x10cm prints in 1 row on a 58cm roll', () => {
    const res = calculateDtfNesting({
      widthCm: 10,
      heightCm: 10,
      qty: 5,
      settings: DEFAULT_DTF_SETTINGS,
    });

    expect(res.perRow).toBe(5);
    expect(res.rows).toBe(1);
    expect(res.lengthCm).toBe(11);
    expect(res.meters).toBe(0.11);
    expect(res.filmCostTotal).toBe(38.5);
    expect(res.filmCostPerUnit).toBe(7.7);
    expect(res.pressCostPerUnit).toBe(15);
    expect(res.costPerUnit).toBe(22.7);
    expect(res.recommendedPricePerUnit).toBe(60);
  });

  it('rotates 26x6cm prints to minimize roll length', () => {
    const res = calculateDtfNesting({
      widthCm: 26,
      heightCm: 6,
      qty: 5,
      settings: DEFAULT_DTF_SETTINGS,
    });

    // Normal: 27x7 => floor(58/27)=2 per row => 3 rows * 7 = 21cm
    // Rotated: 7x27 => floor(58/7)=8 per row => 1 row * 27 = 27cm
    expect(res.rotated).toBe(false);
    expect(res.perRow).toBe(2);
    expect(res.rows).toBe(3);
    expect(res.meters).toBe(0.21);
    expect(res.filmCostTotal).toBe(73.5);
    expect(res.costPerUnit).toBe(29.7);
  });

  it('handles zero press cost and custom meter price', () => {
    const res = calculateDtfNesting({
      widthCm: 10,
      heightCm: 10,
      qty: 5,
      settings: {
        roll_width_cm: 58,
        price_per_meter: 350,
        gap_cm: 1,
        press_cost_per_print: 0,
        markup_multiplier: 2,
      },
    });

    expect(res.filmCostTotal).toBe(38.5);
    expect(res.costPerUnit).toBe(7.7);
    expect(res.recommendedPricePerUnit).toBe(20);
  });

  it('handles oversized prints wider than the roll gracefully', () => {
    const res = calculateDtfNesting({
      widthCm: 80,
      heightCm: 80,
      qty: 2,
      settings: DEFAULT_DTF_SETTINGS,
    });

    expect(res.meters).toBeGreaterThan(0);
    expect(res.costPerUnit).toBeGreaterThan(15);
  });
});
