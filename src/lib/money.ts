/** Keep statement arithmetic at the currency's smallest unit. */
export function roundMoney(value: number): number {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

export function sumMoney(values: Iterable<number>): number {
  let cents = 0;
  for (const value of values) cents += Math.round(value * 100);
  return cents / 100;
}
