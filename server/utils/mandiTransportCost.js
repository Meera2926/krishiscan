/**
 * Calculates estimated logistics and haulage cost to nearest APMC market.
 */
function estimateTransportCost(distanceKm, weightQuintals, ratePerKmQuintal = 3.5) {
  const baseTripCharge = 250;
  return Math.round(baseTripCharge + distanceKm * weightQuintals * ratePerKmQuintal);
}

module.exports = { estimateTransportCost };
