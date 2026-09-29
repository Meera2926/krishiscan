/**
 * Computes 7-day moving average and percentage price momentum for mandi crop rates.
 */
function computePriceTrend(historicalRates) {
  if (!historicalRates || historicalRates.length < 2) return { trend: 'STABLE', changePct: 0 };
  const first = historicalRates[0];
  const last = historicalRates[historicalRates.length - 1];
  const changePct = ((last - first) / first) * 100;

  if (changePct >= 3.0) return { trend: 'RISING', changePct: Number(changePct.toFixed(1)) };
  if (changePct <= -3.0) return { trend: 'FALLING', changePct: Number(changePct.toFixed(1)) };
  return { trend: 'STABLE', changePct: Number(changePct.toFixed(1)) };
}

module.exports = { computePriceTrend };
