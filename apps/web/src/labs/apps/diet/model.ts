/**
 * School lunch at the least cost: the diet problem, one of the first problems linear programming solved. Each food has
 * a price and nutrients per portion; the lunch must reach a minimum of each nutrient. The simplex method finds the
 * cheapest mix (portions may be fractions). Values are rounded from food tables; prices are made up, in coins.
 */
import { simplex, type LpResult } from "./simplex";

export const FOODS = ["rice", "beans", "eggs", "milk", "greens", "nuts"] as const;
export const NUTRIENTS = ["energy", "protein", "iron"] as const;
export type Food = (typeof FOODS)[number];
export type Nutrient = (typeof NUTRIENTS)[number];

/** Per portion: a cup of cooked rice or beans, one egg, a cup of milk, a cup of cooked greens, a handful of groundnuts. */
export const PER: Record<Food, { price: number } & Record<Nutrient, number>> = {
  rice: { price: 15, energy: 260, protein: 5, iron: 0.4 },
  beans: { price: 20, energy: 230, protein: 15, iron: 4 },
  eggs: { price: 12, energy: 75, protein: 6, iron: 0.9 },
  milk: { price: 18, energy: 150, protein: 8, iron: 0.1 },
  greens: { price: 10, energy: 40, protein: 5, iron: 6 },
  nuts: { price: 8, energy: 170, protein: 7, iron: 0.6 },
};
/** A school lunch: about a third of a 10-year-old's day. */
export const NEEDS: Record<Nutrient, number> = { energy: 700, protein: 20, iron: 5 };
export const UNIT: Record<Nutrient, "kcal" | "g" | "mg"> = { energy: "kcal", protein: "g", iron: "mg" };

export type Mix = Record<Food, number>;
export const EMPTY: Mix = { rice: 0, beans: 0, eggs: 0, milk: 0, greens: 0, nuts: 0 };
/** What many cooks would serve: two cups of rice, an egg and a cup of milk. Filling, but low in iron. */
export const COMMON: Mix = { ...EMPTY, rice: 2, eggs: 1, milk: 1 };

export const cost = (m: Mix) => FOODS.reduce((s, f) => s + m[f] * PER[f].price, 0);
export const totals = (m: Mix) => Object.fromEntries(NUTRIENTS.map((n) => [n, FOODS.reduce((s, f) => s + m[f] * PER[f][n], 0)])) as Record<Nutrient, number>;
export const meets = (m: Mix, needs = NEEDS) => { const t = totals(m); return NUTRIENTS.every((n) => t[n] >= needs[n] - 1e-6); };
export const short = (m: Mix, needs = NEEDS) => { const t = totals(m); return NUTRIENTS.filter((n) => t[n] < needs[n] - 1e-6); };

/**
 * The cheapest lunch that meets the needs, with at most `cap` portions of any one food and only the foods `have`.
 * Also says which needs are met exactly ("tight": they are what makes lunch cost this much).
 */
export function cheapest(cap: number, have: ReadonlySet<Food> = new Set(FOODS), needs = NEEDS): { lp: LpResult; mix: Mix; tight: Nutrient[] } {
  const rows = [
    ...NUTRIENTS.map((n) => ({ a: FOODS.map((f) => PER[f][n]), op: ">=" as const, b: needs[n] })),
    ...FOODS.map((f, i) => ({ a: FOODS.map((_, j) => (j === i ? 1 : 0)), op: "<=" as const, b: have.has(f) ? cap : 0 })),
  ];
  const lp = simplex(FOODS.map((f) => PER[f].price), rows);
  const mix = Object.fromEntries(FOODS.map((f, i) => [f, Math.max(0, lp.x[i])])) as Mix;
  const t = totals(mix);
  return { lp, mix, tight: lp.status === "optimal" ? NUTRIENTS.filter((n) => Math.abs(t[n] - needs[n]) < 1e-6) : [] };
}
