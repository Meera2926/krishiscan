// KrishiScan - weather-driven disease-risk rules (plain ES module, no dependencies).
//
// INPUT: evaluate(days) receives `days`, ordered oldest -> newest (normally 3 past + 7 forecast days):
//   { date, isForecast, tmin, tmax, tmean, rhMean, rhMax, rhMin,
//     hoursRh90,   // hours in the calendar day with RH >= 90 %  (our leaf-wetness proxy)
//     tmeanHumid,  // mean air temperature during those humid hours
//     rainMm, rainHours }
//   Any numeric field may be null on a partial day.
//
// OUTPUT: { level: "low"|"moderate"|"high", score: 0..1, reason, window: {from,to}|null, dailyScores: [{date,value}] }
//   score bands: low 0-0.34, moderate 0.35-0.69, high 0.70-1.
//   dailyScores covers every input day (past and forecast) in date order; value is that day's 0-1 favourability.
//
// ADAPTATIONS COMMON TO ALL RULES (we only have daily summaries of Open-Meteo hourly data):
//   A1. Leaf wetness is not measured. `hoursRh90` (hours with RH >= 90 %) is used as the wetness-duration
//       proxy wherever a source asks for hours of leaf wetness, dew or free moisture.
//   A2. Hours are counted per calendar day, not per continuous wet period. A night-time wet spell that
//       crosses midnight is split across two days, and interrupted spells are summed. This can both
//       under-count (split spells) and over-count (non-continuous hours) relative to the source models.
//   A3. "Temperature during the wet period" uses `tmeanHumid`; if that is null we fall back to the daily
//       mean (`tmean`, else (tmin+tmax)/2). Humid hours are mostly at night, so the fallback is usually warmer.
//   A4. A null `hoursRh90` counts as 0 wet hours; a null temperature means the temperature test fails.
//       Missing data can therefore only lower a warning, never raise it.
//   A5. Single-day infection rules only look at forecast days. Past days are used only inside multi-day
//       accumulations (Hutton pairs, JHULSACAST moving sums, TOMCAST DSV sums, blast runs), and every
//       such accumulation must include at least one forecast day.
//   A6. Where a "moderate" band is not defined by the source, the rule says so in a comment marked
//       "KrishiScan heuristic". "High" is only returned when the cited source's own favourable-for-infection
//       condition is met.

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ERROR_REASON = "The weather data could not be checked for this disease right now.";

const fToC = (f) => ((f - 32) * 5) / 9;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const numOr = (v, fallback) => (isNum(v) ? v : fallback);
const clamp01 = (x) => (isNum(x) ? Math.min(1, Math.max(0, x)) : 0);
const round2 = (x) => Math.round(clamp01(x) * 100) / 100;
const inRange = (x, lo, hi) => isNum(x) && x >= lo && x <= hi;

function dayNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Valid day objects only, de-duplicated by date (last wins), sorted oldest -> newest. */
function cleanDays(days) {
  if (!Array.isArray(days)) return [];
  const byDate = new Map();
  for (const d of days) {
    if (d && typeof d === "object" && typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
      byDate.set(d.date, d);
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const isForecast = (d) => d.isForecast === true;
const consecutive = (a, b) => dayNumber(b.date) - dayNumber(a.date) === 1;

/** True when ds[from..to] (inclusive) are consecutive calendar dates. */
function contiguous(ds, from, to) {
  return from >= 0 && to < ds.length && dayNumber(ds[to].date) - dayNumber(ds[from].date) === to - from;
}

function fmtDay(iso) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function describeRange(from, to) {
  if (from === to) return fmtDay(from);
  const [, m1, d1] = from.split("-").map(Number);
  const [, m2, d2] = to.split("-").map(Number);
  if (m1 === m2) return `${d1}–${d2} ${MONTHS[m1 - 1]}`;
  return `${fmtDay(from)}–${fmtDay(to)}`;
}

/** "16 Sep", "16–18 Sep", "16–17 Sep and 20 Sep" */
function describeDates(isoList) {
  const uniq = [...new Set(isoList)].sort();
  if (!uniq.length) return "";
  const runs = [];
  for (const iso of uniq) {
    const last = runs[runs.length - 1];
    if (last && dayNumber(iso) - dayNumber(last.to) === 1) last.to = iso;
    else runs.push({ from: iso, to: iso });
  }
  const parts = runs.map((r) => describeRange(r.from, r.to));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const spanOf = (isoList) => {
  const s = [...isoList].sort();
  return s.length ? { from: s[0], to: s[s.length - 1] } : null;
};

/** Wet-hour proxy (A1, A4). */
function wetHours(d) {
  return Math.min(24, Math.max(0, numOr(d.hoursRh90, 0)));
}
function dayMeanTemp(d) {
  if (isNum(d.tmean)) return d.tmean;
  if (isNum(d.tmin) && isNum(d.tmax)) return (d.tmin + d.tmax) / 2;
  return null;
}
/** Temperature during the humid hours (A3). */
function wetTemp(d) {
  return isNum(d.tmeanHumid) ? d.tmeanHumid : dayMeanTemp(d);
}
function dayMeanRh(d) {
  if (isNum(d.rhMean)) return d.rhMean;
  if (isNum(d.rhMin) && isNum(d.rhMax)) return (d.rhMin + d.rhMax) / 2;
  return null;
}
const rain = (d) => Math.max(0, numOr(d.rainMm, 0));

function bandScore(level, progress) {
  const p = clamp01(progress);
  if (level === "high") return round2(0.7 + 0.3 * p);
  if (level === "moderate") return round2(0.35 + 0.34 * p);
  return round2(0.34 * p);
}

function makeResult(level, progress, reason, window, dailyScores) {
  return { level, score: bandScore(level, progress), reason, window: window || null, dailyScores };
}

function noForecastResult(diseaseName, dailyScores) {
  return makeResult("low", 0, `There are no forecast days to check ${diseaseName} risk.`, null, dailyScores);
}

/** Never let one rule throw and break the whole risk panel. */
function guarded(rule) {
  const inner = rule.evaluate;
  return {
    ...rule,
    evaluate(days) {
      try {
        return inner(days);
      } catch (err) {
        return { level: "low", score: 0, reason: ERROR_REASON, window: null, dailyScores: [] };
      }
    },
  };
}

/**
 * Generic single-day infection rule: classify(day) -> { cls: "high"|"moderate"|"low", value: 0..1 }.
 * Level = best class among FORECAST days (A5).
 */
function dailyInfectionRule(cfg) {
  return guarded({
    id: cfg.id,
    crop: cfg.crop,
    diseaseKey: cfg.diseaseKey,
    model: cfg.model,
    source: cfg.source,
    evaluate(days) {
      const ds = cleanDays(days);
      const assessed = ds.map((d) => {
        const r = cfg.classify(d) || {};
        return { d, cls: r.cls || "low", value: clamp01(r.value) };
      });
      const dailyScores = assessed.map((a) => ({ date: a.d.date, value: round2(a.value) }));
      const fc = assessed.filter((a) => isForecast(a.d));
      if (!fc.length) return noForecastResult(cfg.diseaseName, dailyScores);

      const highs = fc.filter((a) => a.cls === "high").map((a) => a.d.date);
      if (highs.length) {
        return makeResult("high", (highs.length - 1) / 3, cfg.reasonHigh(describeDates(highs)), spanOf(highs), dailyScores);
      }
      const mods = fc.filter((a) => a.cls === "moderate").map((a) => a.d.date);
      if (mods.length) {
        return makeResult("moderate", (mods.length - 1) / 3, cfg.reasonModerate(describeDates(mods)), spanOf(mods), dailyScores);
      }
      const maxVal = Math.max(0, ...fc.map((a) => a.value));
      const range = describeRange(fc[0].d.date, fc[fc.length - 1].d.date);
      return makeResult("low", maxVal / 0.5, cfg.reasonLow(range), null, dailyScores);
    },
  });
}

/* ------------------------------------------------------------------ */
/* 1. Late blight - Hutton Criteria (potato; adapted to tomato)        */
/* ------------------------------------------------------------------ */

// Hutton Criteria, AHDB national late blight warning system for Great Britain, launched 2017:
// "Two consecutive days with a minimum temperature of 10°C and at least 6 hours each day with a relative
// humidity >= 90%." Source: AHDB (URL in rule.source).
const HUTTON_MIN_TMIN_C = 10;
const HUTTON_MIN_HOURS_RH90 = 6;
// "Near miss" as shown on the BlightWatch/BlightSpy maps: RH >= 90 % for only 5 hours, or a minimum
// temperature of only 9 °C, on either day while the other criteria are met.
// Source: National Vegetable Society, https://www.nvsuk.org.uk/articles/blight-watch
const HUTTON_NEAR_MISS_TMIN_C = 9;
const HUTTON_NEAR_MISS_HOURS_RH90 = 5;
//  - KrishiScan adaptation for Indian conditions: Hutton has no upper temperature limit because British
//    weather never needs one. In Indian heat that produced false "high" warnings (e.g. West Bengal in
//    September, nights of 26-27 C). A day therefore only counts when its wet-period temperature is at or
//    below the ceiling of ICAR-CPRI JHULSACAST congenial range (26.6 C, see JHULSA_CONGENIAL_T_MAX_C).
const HUTTON_INDIA_MAX_WET_TEMP_C = 26.6;
const HUTTON_SOURCE =
  "https://potatoes.ahdb.org.uk/development-and-implementation-of-a-new-national-warning-system-for-potato-late-blight-in-great-britain-hutton-criteria";
// Adaptations:
//  - Calendar days (local midnight to midnight) from Open-Meteo, not Met Office station days.
//  - hoursRh90 is exactly the Hutton humidity measure (hours with RH >= 90 %), so no proxy is needed there.
//  - Near miss is read as: both days reach at least 9 °C minimum and 5 humid hours, and they are not both full days.
//  - A pair counts only if its second day is a forecast day (the first may be yesterday).
//  - KrishiScan heuristic (moderate): one forecast day meets the full daily criteria but no qualifying pair
//    exists yet (e.g. the last forecast day, whose partner day lies beyond the forecast).
//  - Tomato: the Hutton Criteria were developed for potato. Tomato late blight is caused by the same pathogen
//    (Phytophthora infestans), so the same weather thresholds are applied to tomato without re-validation.

function huttonRule({ id, crop, diseaseKey, cropName }) {
  const status = (d) => {
    if (!isNum(d.tmin) || !isNum(d.hoursRh90)) return "none";
    const wet = wetTemp(d);
    if (isNum(wet) && wet > HUTTON_INDIA_MAX_WET_TEMP_C) return "none";
    if (d.tmin >= HUTTON_MIN_TMIN_C && d.hoursRh90 >= HUTTON_MIN_HOURS_RH90) return "full";
    if (d.tmin >= HUTTON_NEAR_MISS_TMIN_C && d.hoursRh90 >= HUTTON_NEAR_MISS_HOURS_RH90) return "near";
    return "none";
  };
  const dayValue = (d) => {
    const s = status(d);
    if (s === "full") return 1;
    if (s === "near") return 0.6;
    const hPart = clamp01(wetHours(d) / HUTTON_MIN_HOURS_RH90);
    const tPart = isNum(d.tmin) ? clamp01(d.tmin / HUTTON_MIN_TMIN_C) : 0;
    return 0.5 * Math.min(hPart, tPart);
  };

  return guarded({
    id,
    crop,
    diseaseKey,
    model: "Hutton Criteria (AHDB, 2017)",
    source: HUTTON_SOURCE,
    evaluate(days) {
      const ds = cleanDays(days);
      const dailyScores = ds.map((d) => ({ date: d.date, value: round2(dayValue(d)) }));
      const fcIdx = ds.map((d, i) => (isForecast(d) ? i : -1)).filter((i) => i >= 0);
      if (!fcIdx.length) return noForecastResult("late blight", dailyScores);

      const fullDates = [];
      const nearDates = [];
      let fullPairs = 0;
      for (const i of fcIdx) {
        if (i < 1 || !consecutive(ds[i - 1], ds[i])) continue;
        const a = status(ds[i - 1]);
        const b = status(ds[i]);
        if (a === "full" && b === "full") {
          fullPairs += 1;
          fullDates.push(ds[i - 1].date, ds[i].date);
        } else if (a !== "none" && b !== "none") {
          nearDates.push(ds[i - 1].date, ds[i].date);
        }
      }

      if (fullPairs > 0) {
        return makeResult(
          "high",
          (fullPairs - 1) / 3,
          `Warm, humid weather on ${describeDates(fullDates)} meets the Hutton Criteria (two days in a row with a minimum of at least 10°C and 6 or more hours above 90% humidity), so late blight can infect ${cropName} leaves.`,
          spanOf(fullDates),
          dailyScores
        );
      }
      if (nearDates.length) {
        return makeResult(
          "moderate",
          0.8,
          `Weather on ${describeDates(nearDates)} comes very close to the Hutton Criteria for late blight (a "near miss"), so keep a close watch on your ${cropName} crop.`,
          spanOf(nearDates),
          dailyScores
        );
      }
      const singles = fcIdx.filter((i) => status(ds[i]) === "full").map((i) => ds[i].date);
      if (singles.length) {
        return makeResult(
          "moderate",
          0.4,
          `The weather on ${describeDates(singles)} is warm and humid enough for late blight, but not on two days in a row as the Hutton Criteria require, so the risk to ${cropName} is moderate.`,
          spanOf(singles),
          dailyScores
        );
      }
      const maxVal = Math.max(0, ...fcIdx.map((i) => dayValue(ds[i])));
      return makeResult(
        "low",
        maxVal / 0.6,
        `No two days in a row between ${describeRange(ds[fcIdx[0]].date, ds[fcIdx[fcIdx.length - 1]].date)} are warm and humid enough for late blight on ${cropName}.`,
        null,
        dailyScores
      );
    },
  });
}

/* ------------------------------------------------------------------ */
/* 2. Potato late blight - JHULSACAST (ICAR-CPRI), West Bengal plains  */
/* ------------------------------------------------------------------ */

// JHULSACAST was developed by ICAR-CPRI (Singh et al. 2000, western Uttar Pradesh) and re-calibrated for
// several Indian regions. We use the West Bengal plains calibration (Chakraborty, Singh, Ahmad & Sharma,
// Potato Journal, ICAR) because its humidity input is hours with RH >= 90 %, which is exactly `hoursRh90`,
// and because its rainy-weather variant fits inside a 10-day window. The original western UP / Punjab
// variants count hours with RH >= 85 %, which we cannot measure. Thresholds also listed in
// S. Sharma (ICAR-CPRI), "Status of Late Blight Management in India",
// https://cgspace.cgiar.org/server/api/core/bitstreams/bcb3a56b-c2af-4987-8c55-a187e3147c81/content
//
// Rainy variant: 5-day moving RH >= 90 % period >= 65 h AND 5-day moving congenial temperature
// (7.2-26.6 °C) period >= 105 h, prevailing for 5 consecutive days, AND two consecutive days with rainfall
// summing to >= 2.5 mm  ->  "Late Blight may appear within 8-10 days" (verbatim from the ICAR-CPRI source).
// Non-rainy variant: 7-day moving RH >= 90 % period >= 105 h AND 7-day moving congenial temperature
// period >= 150 h, prevailing for 7 consecutive days.
const JHULSA_CONGENIAL_T_MIN_C = 7.2;
const JHULSA_CONGENIAL_T_MAX_C = 26.6;
const JHULSA_RAINY_WINDOW_DAYS = 5;
const JHULSA_RAINY_RH90_HOURS = 65;
const JHULSA_RAINY_CONGENIAL_HOURS = 105;
const JHULSA_RAINY_PERSIST_DAYS = 5;
const JHULSA_RAIN_TWO_DAY_SUM_MM = 2.5;
const JHULSA_DRY_WINDOW_DAYS = 7;
const JHULSA_DRY_RH90_HOURS = 105;
const JHULSA_DRY_CONGENIAL_HOURS = 150;
// Adaptations:
//  - Congenial-temperature hours are not in our data. They are estimated from tmin/tmax assuming a
//    sinusoidal daily temperature curve: hours = 24 * (share of the cycle between 7.2 and 26.6 °C).
//    If only tmean is present, the whole day counts as congenial when tmean is inside the range.
//  - Rain: the paper's "sum of two consecutive days rainfall (>= 2.5 mm)" is checked on any pair of
//    consecutive days inside the 9-day span that produced the forecast.
//  - The 5 consecutive favourable days need 9 days of data, so the rainy variant can be evaluated from
//    3 past + 7 forecast days. The run must end on a forecast day.
//  - The non-rainy variant needs 13 days (7-day sums held for 7 days); with 10 days we can only see up to
//    4 such sums, so it is used for "moderate" only.
//  - KrishiScan heuristic (moderate): the 5-day humidity and temperature sums are met on at least one
//    forecast day, but not for 5 days in a row and/or without the rain condition.
//  - Model is for potato only; it is not applied to tomato.

function congenialHours(d) {
  const lo = JHULSA_CONGENIAL_T_MIN_C;
  const hi = JHULSA_CONGENIAL_T_MAX_C;
  if (isNum(d.tmin) && isNum(d.tmax)) {
    const tmin = Math.min(d.tmin, d.tmax);
    const tmax = Math.max(d.tmin, d.tmax);
    if (tmax - tmin < 1e-6) return inRange(tmin, lo, hi) ? 24 : 0;
    const mid = (tmin + tmax) / 2;
    const amp = (tmax - tmin) / 2;
    const shareAbove = (x) => Math.acos(Math.max(-1, Math.min(1, (x - mid) / amp))) / Math.PI;
    return 24 * Math.max(0, shareAbove(lo) - shareAbove(hi));
  }
  const t = dayMeanTemp(d);
  return inRange(t, lo, hi) ? 24 : 0;
}

const potatoLateBlightJhulsacast = guarded({
  id: "potato_late_blight_jhulsacast",
  crop: "potato",
  diseaseKey: "potato_late_blight",
  model: "JHULSACAST (ICAR-CPRI), West Bengal plains calibration",
  // Citation points at the ICAR-CPRI status paper on CGSpace: it is openly accessible and its table is the one
  // implemented below (verified verbatim 2026-09). The underlying journal article is Potato Journal (ICAR),
  // https://epubs.icar.org.in/index.php/PotatoJ/article/view/50164, which is behind a login.
  source: "https://cgspace.cgiar.org/server/api/core/bitstreams/bcb3a56b-c2af-4987-8c55-a187e3147c81/content",
  evaluate(days) {
    const ds = cleanDays(days);
    const rh = ds.map(wetHours);
    const ct = ds.map(congenialHours);
    const dailyScores = ds.map((d, i) => ({
      date: d.date,
      value: round2(
        Math.min(
          rh[i] / (JHULSA_RAINY_RH90_HOURS / JHULSA_RAINY_WINDOW_DAYS),
          ct[i] / (JHULSA_RAINY_CONGENIAL_HOURS / JHULSA_RAINY_WINDOW_DAYS)
        )
      ),
    }));
    if (!ds.some(isForecast)) return noForecastResult("late blight", dailyScores);

    const sumBack = (arr, end, len) => {
      let s = 0;
      for (let k = end - len + 1; k <= end; k++) s += arr[k];
      return s;
    };
    const w5 = JHULSA_RAINY_WINDOW_DAYS;
    const ok5 = ds.map((_, i) => {
      if (!contiguous(ds, i - w5 + 1, i)) return { ok: false, ratio: null };
      const rhSum = sumBack(rh, i, w5);
      const ctSum = sumBack(ct, i, w5);
      return {
        ok: rhSum >= JHULSA_RAINY_RH90_HOURS && ctSum >= JHULSA_RAINY_CONGENIAL_HOURS,
        ratio: Math.min(rhSum / JHULSA_RAINY_RH90_HOURS, ctSum / JHULSA_RAINY_CONGENIAL_HOURS),
      };
    });
    const w7 = JHULSA_DRY_WINDOW_DAYS;
    const ok7 = ds.map((_, i) => {
      if (!contiguous(ds, i - w7 + 1, i)) return false;
      return sumBack(rh, i, w7) >= JHULSA_DRY_RH90_HOURS && sumBack(ct, i, w7) >= JHULSA_DRY_CONGENIAL_HOURS;
    });

    // Rainy variant: favourable 5-day sums on P consecutive days, run ending on a forecast day, plus rain.
    const P = JHULSA_RAINY_PERSIST_DAYS;
    for (let end = P - 1; end < ds.length; end++) {
      const start = end - P + 1;
      if (!isForecast(ds[end]) || !contiguous(ds, start, end)) continue;
      let allOk = true;
      for (let k = start; k <= end; k++) if (!ok5[k].ok) allOk = false;
      if (!allOk) continue;
      const spanStart = start - w5 + 1;
      let rainPair = null;
      for (let j = spanStart; j < end; j++) {
        if (consecutive(ds[j], ds[j + 1]) && rain(ds[j]) + rain(ds[j + 1]) >= JHULSA_RAIN_TWO_DAY_SUM_MM) {
          rainPair = [ds[j].date, ds[j + 1].date];
          break;
        }
      }
      if (!rainPair) continue;
      let runEnd = end;
      while (runEnd + 1 < ds.length && ok5[runEnd + 1].ok && consecutive(ds[runEnd], ds[runEnd + 1])) runEnd++;
      const ratios = [];
      for (let k = start; k <= runEnd; k++) ratios.push(ok5[k].ratio);
      const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      return makeResult(
        "high",
        meanRatio - 1,
        `Long humid spells in mild weather during ${describeRange(ds[spanStart].date, ds[runEnd].date)}, with rain on ${describeDates(rainPair)}, meet the ICAR-CPRI JHULSACAST late blight rule, so blight may appear in potato within about 8 to 10 days.`,
        { from: ds[spanStart].date, to: ds[runEnd].date },
        dailyScores
      );
    }

    // Moderate: 5-day sums met on some forecast day(s), or the 7-day dry-weather sums met.
    const okDates5 = ds.filter((d, i) => isForecast(d) && ok5[i].ok).map((d) => d.date);
    if (okDates5.length) {
      const from = ds[Math.max(0, ds.findIndex((d) => d.date === okDates5[0]) - w5 + 1)].date;
      const to = okDates5[okDates5.length - 1];
      return makeResult(
        "moderate",
        okDates5.length / P,
        `Humid, mild weather during ${describeRange(from, to)} comes close to the JHULSACAST late blight warning, but not for five days in a row together with enough rain, so the risk to potato is moderate.`,
        { from, to },
        dailyScores
      );
    }
    const okDates7 = ds.filter((d, i) => isForecast(d) && ok7[i]).map((d) => d.date);
    if (okDates7.length) {
      const from = ds[Math.max(0, ds.findIndex((d) => d.date === okDates7[0]) - w7 + 1)].date;
      const to = okDates7[okDates7.length - 1];
      return makeResult(
        "moderate",
        0.5,
        `Long humid spells during ${describeRange(from, to)} match the JHULSACAST dry-weather late blight pattern, but the forecast is too short to confirm it, so the risk to potato is moderate.`,
        { from, to },
        dailyScores
      );
    }
    const ratios = ds.map((d, i) => (isForecast(d) && isNum(ok5[i].ratio) ? ok5[i].ratio : 0));
    return makeResult(
      "low",
      Math.max(0, ...ratios),
      `Between ${describeRange(ds[0].date, ds[ds.length - 1].date)} there are not enough humid hours in mild weather for the JHULSACAST late blight rule.`,
      null,
      dailyScores
    );
  },
});

/* ------------------------------------------------------------------ */
/* 3. Early blight - TOMCAST (potato and tomato)                       */
/* ------------------------------------------------------------------ */

// TOMCAST daily disease severity values (DSV 0-4) from hours of leaf wetness and mean air temperature
// during the wetness period. Original: Madden, Pennypacker & MacNab (1978) FAST, Phytopathology 68:1354-1358.
// Table as reproduced in Asalf et al. (NIBIO) poster "Evaluating TOMCAST model ... Alternaria diseases in
// Carrot and Potato", which also notes the original lower temperature limit of 13 °C (used here).
// Spray guidance in the same poster: accumulated DSV 0-15 green, 15-20 yellow, > 20 red; sprays were
// triggered at DSV = 20. UConn IPM and METOS also give a 15-20 DSV spray interval.
// Table cross-checked (2026-09) against Agronomy 10(12):1872 (doi:10.3390/agronomy10121872), which states that at
// 13-17 °C a DSV of 1 is assigned for leaf wetness of 7-15 h - matching the 13-17 °C row below - and against
// Plants 12(8):1634 (TOMCAST in China), which confirms DSV 0-4 and spray thresholds accumulated at 10/15/20/25.
const TOMCAST_DSV_TABLE = [
  { tFromC: 13, tToC: 18, minHoursForDsv: [7, 16, 21] }, //     13-17 °C: 0-6 h ->0, 7-15 ->1, 16-20 ->2, 21+ ->3
  { tFromC: 18, tToC: 21, minHoursForDsv: [4, 9, 16, 23] }, //  18-20 °C: 0-3 ->0, 4-8 ->1, 9-15 ->2, 16-22 ->3, 23+ ->4
  { tFromC: 21, tToC: 26, minHoursForDsv: [3, 6, 13, 21] }, //  21-25 °C: 0-2 ->0, 3-5 ->1, 6-12 ->2, 13-20 ->3, 21+ ->4
  { tFromC: 26, tToC: 30, minHoursForDsv: [4, 9, 16, 23] }, //  26-29 °C: 0-3 ->0, 4-8 ->1, 9-15 ->2, 16-22 ->3, 23+ ->4
];
const TOMCAST_HIGH_DSV = 20; // spray trigger used by NIBIO; "red" band
const TOMCAST_MODERATE_DSV = 15; // lower end of the 15-20 DSV spray interval; "yellow" band
// Adaptations:
//  - Leaf wetness hours = hoursRh90 (A1); temperature during wetness = tmeanHumid (A3).
//  - The published table uses whole-degree bands; a non-integer temperature is placed by its whole-degree
//    part (e.g. 17.6 °C -> 13-17 row). Below 13 °C or at/above 30 °C the DSV is 0.
//  - We do not know when the farmer last sprayed, so DSVs are summed over the whole input window
//    (3 past + 7 forecast days). Forecast days must add at least one DSV. Past days alone can reach at most
//    12 DSV, so the thresholds can only be crossed with forecast weather.
//  - TOMCAST was built for tomato; its use on potato follows Abuley & Nielsen (2017, Crop Protection 102:118-128),
//    cited in the same poster.

function tomcastDsv(d) {
  const h = wetHours(d);
  const t = wetTemp(d);
  if (h <= 0 || !isNum(t)) return 0;
  const row = TOMCAST_DSV_TABLE.find((r) => t >= r.tFromC && t < r.tToC);
  return row ? row.minHoursForDsv.filter((minH) => h >= minH).length : 0;
}

function tomcastRule({ id, crop, diseaseKey, cropName }) {
  return guarded({
    id,
    crop,
    diseaseKey,
    model: "TOMCAST disease severity values",
    source: "https://www.vips-landbruk.no/media/attachments/information/Tomcast_poster_Asalf_et_al.pdf",
    evaluate(days) {
      const ds = cleanDays(days);
      const dsv = ds.map(tomcastDsv);
      const dailyScores = ds.map((d, i) => ({ date: d.date, value: round2(dsv[i] / 4) }));
      if (!ds.some(isForecast)) return noForecastResult("early blight", dailyScores);

      const forecastDsv = ds.reduce((s, d, i) => s + (isForecast(d) ? dsv[i] : 0), 0);
      let running = 0;
      let crossHigh = -1;
      let crossMod = -1;
      dsv.forEach((v, i) => {
        running += v;
        if (crossMod < 0 && running >= TOMCAST_MODERATE_DSV) crossMod = i;
        if (crossHigh < 0 && running >= TOMCAST_HIGH_DSV) crossHigh = i;
      });
      const total = running;
      const wetDates = ds.filter((_, i) => dsv[i] > 0).map((d) => d.date);
      const firstWet = wetDates[0];

      if (forecastDsv > 0 && crossHigh >= 0) {
        return makeResult(
          "high",
          (total - TOMCAST_HIGH_DSV) / 10,
          `Long wet-leaf spells in warm weather on ${describeDates(wetDates)} add up to ${total} TOMCAST severity points (the spray trigger is ${TOMCAST_HIGH_DSV}, reached on ${fmtDay(ds[crossHigh].date)}), so early blight can infect ${cropName}.`,
          { from: firstWet, to: ds[crossHigh].date },
          dailyScores
        );
      }
      if (forecastDsv > 0 && crossMod >= 0) {
        return makeResult(
          "moderate",
          (total - TOMCAST_MODERATE_DSV) / (TOMCAST_HIGH_DSV - TOMCAST_MODERATE_DSV),
          `Wet-leaf spells on ${describeDates(wetDates)} add up to ${total} TOMCAST severity points, close to the spray trigger of ${TOMCAST_HIGH_DSV}, so early blight risk for ${cropName} is moderate.`,
          { from: firstWet, to: ds[crossMod].date },
          dailyScores
        );
      }
      return makeResult(
        "low",
        total / TOMCAST_MODERATE_DSV,
        `Between ${describeRange(ds[0].date, ds[ds.length - 1].date)} leaves are not expected to stay wet long enough in warm weather for early blight on ${cropName} (${total} of ${TOMCAST_HIGH_DSV} TOMCAST points).`,
        null,
        dailyScores
      );
    },
  });
}

/* ------------------------------------------------------------------ */
/* 4. Rice leaf blast - Indian blast forecasting rule                  */
/* ------------------------------------------------------------------ */

// TNAU e-course PATH 272 (Diseases of field crops), lecture on rice diseases: "Forecast for rice blast can be
// made on the basis of minimum night temperature range of 20-26°C in association with a high relative
// humidity range of 90 per cent and above lasting for a period of a week or more during any of the three
// susceptible phases of crop growth, viz., seedling stage, post transplanting tillering stage and neck
// emergence stage."
// Verified verbatim (2026-09) in RVSKVV course notes PAT 301, which reproduce the same TNAU PATH 272 text;
// cited instead of eagri.org/eagri50/PATH272/lecture01/lec07.pdf because that host's TLS certificate has expired.
const BLAST_TMIN_LOW_C = 20;
const BLAST_TMIN_HIGH_C = 26;
const BLAST_RH_PCT = 90;
const BLAST_MIN_RUN_DAYS = 7; // "a week or more"
const BLAST_MODERATE_RUN_DAYS = 4; // KrishiScan heuristic: more than half the required week
// Adaptations:
//  - "Minimum night temperature" = daily tmin.
//  - "RH of 90 % and above lasting" is read strictly as daily mean RH >= 90 % (rhMean, else (rhMin+rhMax)/2).
//    This is conservative: humid nights with drier afternoons do not count toward "high".
//  - KrishiScan heuristic (moderate): (a) a 7+ day run where RH only reaches 90 % at some point in the day
//    (rhMax >= 90 or hoursRh90 > 0) with tmin 20-26 °C, or (b) a strict run of 4-6 days.
//  - Runs may start on past days but must contain at least one forecast day.
//  - Crop growth stage is unknown; the rule applies to the susceptible stages named above.
//  - EPIBLA (Manibhushanrao & Krishnan) thresholds could not be retrieved, so EPIBLA is not implemented.

function blastStrict(d) {
  const rh = dayMeanRh(d);
  return inRange(d.tmin, BLAST_TMIN_LOW_C, BLAST_TMIN_HIGH_C) && isNum(rh) && rh >= BLAST_RH_PCT;
}
function blastLenient(d) {
  return (
    inRange(d.tmin, BLAST_TMIN_LOW_C, BLAST_TMIN_HIGH_C) &&
    ((isNum(d.rhMax) && d.rhMax >= BLAST_RH_PCT) || wetHours(d) > 0)
  );
}

/** Longest run of consecutive dates satisfying pred that contains a forecast day. */
function longestForecastRun(ds, pred) {
  let best = null;
  let i = 0;
  while (i < ds.length) {
    if (!pred(ds[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < ds.length && pred(ds[j + 1]) && consecutive(ds[j], ds[j + 1])) j++;
    const run = ds.slice(i, j + 1);
    if (run.some(isForecast) && (!best || run.length > best.length)) {
      best = { from: ds[i].date, to: ds[j].date, length: run.length };
    }
    i = j + 1;
  }
  return best;
}

const riceLeafBlast = guarded({
  id: "rice_leaf_blast_tnau",
  crop: "rice",
  diseaseKey: "rice_leaf_blast",
  model: "Blast forecast rule (night 20-26°C, RH >= 90% for a week)",
  source: "https://rvsagri.ac.in/modules/academics/timetable/PAT%20301.pdf",
  evaluate(days) {
    const ds = cleanDays(days);
    const dailyScores = ds.map((d) => ({
      date: d.date,
      value: blastStrict(d) ? 1 : blastLenient(d) ? 0.5 : inRange(d.tmin, BLAST_TMIN_LOW_C, BLAST_TMIN_HIGH_C) ? 0.2 : 0,
    }));
    if (!ds.some(isForecast)) return noForecastResult("rice blast", dailyScores);

    const strict = longestForecastRun(ds, blastStrict);
    if (strict && strict.length >= BLAST_MIN_RUN_DAYS) {
      return makeResult(
        "high",
        (strict.length - BLAST_MIN_RUN_DAYS) / 3,
        `Nights of 20–26°C with humidity at or above 90% for ${strict.length} days in a row (${describeRange(strict.from, strict.to)}) match the blast forecasting rule, so leaf blast can infect rice, especially at nursery, tillering or panicle-emergence stage.`,
        { from: strict.from, to: strict.to },
        dailyScores
      );
    }
    const lenient = longestForecastRun(ds, blastLenient);
    if (lenient && lenient.length >= BLAST_MIN_RUN_DAYS) {
      return makeResult(
        "moderate",
        0.7,
        `Warm nights (20–26°C) with humid spells from ${describeRange(lenient.from, lenient.to)} partly match the blast rule, but the average daily humidity is not expected to stay at 90% or more, so the risk to rice is moderate.`,
        { from: lenient.from, to: lenient.to },
        dailyScores
      );
    }
    if (strict && strict.length >= BLAST_MODERATE_RUN_DAYS) {
      return makeResult(
        "moderate",
        (strict.length - BLAST_MODERATE_RUN_DAYS) / (BLAST_MIN_RUN_DAYS - BLAST_MODERATE_RUN_DAYS),
        `Warm, very humid weather on ${describeRange(strict.from, strict.to)} partly matches the blast rule, which needs a full week of such weather, so the risk to rice is moderate.`,
        { from: strict.from, to: strict.to },
        dailyScores
      );
    }
    const fc = ds.filter(isForecast);
    return makeResult(
      "low",
      ((strict ? strict.length : 0) / BLAST_MIN_RUN_DAYS),
      `Nights between ${describeRange(fc[0].date, fc[fc.length - 1].date)} are not expected to stay at 20–26°C with 90% humidity for long enough to cause rice leaf blast.`,
      null,
      dailyScores
    );
  },
});

/* ------------------------------------------------------------------ */
/* 5. Rice brown spot - IRRI + TNAU favourable conditions              */
/* ------------------------------------------------------------------ */

// IRRI Rice Knowledge Bank, Brown spot fact sheet: the disease develops with relative humidity 86-100 % and
// temperature 16-36 °C; "for infection to occur, the leaves must be wet for 8-24 hours".
// TNAU e-course PATH 272 rice lecture (https://rvsagri.ac.in/modules/academics/timetable/PAT%20301.pdf):
// "Temperature of 25-30°C with relative humidity above 80 per cent are highly favourable."
const BROWN_SPOT_IRRI_WET_HOURS = 8;
const BROWN_SPOT_IRRI_T_MIN_C = 16;
const BROWN_SPOT_IRRI_T_MAX_C = 36;
const BROWN_SPOT_TNAU_T_MIN_C = 25;
const BROWN_SPOT_TNAU_T_MAX_C = 30;
const BROWN_SPOT_TNAU_RH_ABOVE_PCT = 80;
// Adaptations:
//  - High = IRRI infection condition (>= 8 wet hours at 16-36 °C; RH >= 90 % hours also satisfy IRRI's
//    86-100 % humidity) AND TNAU "highly favourable" day (daily mean 25-30 °C, daily mean RH > 80 %).
//  - Moderate = only one of the two sources' conditions is met.
//  - These are favourable-condition statements, not a validated forecasting model (lower confidence).
//  - IRRI's page could not be fetched directly during research; its numbers were confirmed from two
//    separate search-index extracts of that page.

const riceBrownSpot = dailyInfectionRule({
  id: "rice_brown_spot_irri_tnau",
  crop: "rice",
  diseaseKey: "rice_brown_spot",
  diseaseName: "brown spot",
  model: "IRRI/TNAU brown spot favourable conditions",
  source: "http://www.knowledgebank.irri.org/training/fact-sheets/pest-management/diseases/item/brown-spot",
  classify(d) {
    const h = wetHours(d);
    const tw = wetTemp(d);
    const tday = dayMeanTemp(d);
    const rh = dayMeanRh(d);
    const irri = h >= BROWN_SPOT_IRRI_WET_HOURS && inRange(tw, BROWN_SPOT_IRRI_T_MIN_C, BROWN_SPOT_IRRI_T_MAX_C);
    const tnau =
      inRange(tday, BROWN_SPOT_TNAU_T_MIN_C, BROWN_SPOT_TNAU_T_MAX_C) && isNum(rh) && rh > BROWN_SPOT_TNAU_RH_ABOVE_PCT;
    if (irri && tnau) return { cls: "high", value: 1 };
    if (irri || tnau) return { cls: "moderate", value: 0.5 };
    const partial = inRange(tw, BROWN_SPOT_IRRI_T_MIN_C, BROWN_SPOT_IRRI_T_MAX_C) ? h / BROWN_SPOT_IRRI_WET_HOURS : 0;
    return { cls: "low", value: 0.4 * clamp01(partial) };
  },
  reasonHigh: (dates) =>
    `Warm (25–30°C), humid weather with leaves wet for 8 hours or more on ${dates} favours brown spot infection in rice.`,
  reasonModerate: (dates) =>
    `Weather on ${dates} meets some but not all of the conditions brown spot needs (long leaf wetness together with 25–30°C and humidity above 80%), so the risk to rice is moderate.`,
  reasonLow: (range) =>
    `Between ${range} rice leaves are not expected to stay wet long enough in warm, humid weather for brown spot.`,
});

/* ------------------------------------------------------------------ */
/* 6. Wheat yellow (stripe) rust and brown (leaf) rust                 */
/* ------------------------------------------------------------------ */

const WHEAT_RUST_SOURCE = "https://extensionpubs.unl.edu/publication/g2180/2012/html/view";
// University of Nebraska-Lincoln Extension G2180 "Rust Diseases of Wheat", Table 2 and text:
//   Stripe rust: "Optimal conditions for infection are temperatures between 45 and 54°F and eight hours of
//   free moisture on the leaf surface"; development 50-59°F with intermittent rain or dew.
//   Leaf rust: "Optimal conditions for infection are a temperature range of 59-68°F and at least six hours
//   of free moisture on the leaf surface"; development 68-77°F with wet weather.
// Corroboration: Singh, Huerta-Espino & Roelfs, "The wheat rusts", FAO Bread Wheat (2002), Table 13.2 and text,
// https://www.fao.org/4/y4011e/y4011e0g.htm - stripe rust germination/penetration min 2 (0) °C, optimum 9-13 °C,
// max 23 °C, free water essential; leaf rust "can infect with dew periods of three hours or less at
// temperatures of about 20°C", "at 10°C a 12-hour dew period is necessary", few infections above 32 °C or below 2 °C.

const YELLOW_RUST_INFECT_T_MIN_C = fToC(45); // 7.2 °C  (UNL G2180)
const YELLOW_RUST_INFECT_T_MAX_C = fToC(54); // 12.2 °C (UNL G2180)
const YELLOW_RUST_INFECT_WET_HOURS = 8; //       (UNL G2180)
const YELLOW_RUST_DEV_T_MIN_C = fToC(50); //    10 °C   (UNL G2180, development)
const YELLOW_RUST_DEV_T_MAX_C = fToC(59); //    15 °C   (UNL G2180, development)
const YELLOW_RUST_PENETRATION_T_MIN_C = 2; //   (FAO Table 13.2)
const YELLOW_RUST_PENETRATION_T_MAX_C = 23; //  (FAO Table 13.2)
// Adaptations:
//  - Free moisture hours = hoursRh90 (A1); infection temperature = tmeanHumid (A3).
//  - High = UNL optimal infection conditions on a forecast day.
//  - Moderate = >= 8 wet hours at a temperature where FAO says penetration is still possible (2-23 °C), or a
//    development-temperature day (daily mean 10-15 °C) with dew or rain (humid hours > 0 or rain > 0).
//  - Inoculum presence and crop stage are not considered.

const wheatYellowRust = dailyInfectionRule({
  id: "wheat_yellow_rust_unl",
  crop: "wheat",
  diseaseKey: "wheat_yellow_rust",
  diseaseName: "yellow rust",
  model: "Stripe rust infection conditions (UNL Extension G2180)",
  source: WHEAT_RUST_SOURCE,
  classify(d) {
    const h = wetHours(d);
    const tw = wetTemp(d);
    const tday = dayMeanTemp(d);
    if (h >= YELLOW_RUST_INFECT_WET_HOURS && inRange(tw, YELLOW_RUST_INFECT_T_MIN_C, YELLOW_RUST_INFECT_T_MAX_C)) {
      return { cls: "high", value: 1 };
    }
    const penetrationOk =
      h >= YELLOW_RUST_INFECT_WET_HOURS && inRange(tw, YELLOW_RUST_PENETRATION_T_MIN_C, YELLOW_RUST_PENETRATION_T_MAX_C);
    const developmentOk = inRange(tday, YELLOW_RUST_DEV_T_MIN_C, YELLOW_RUST_DEV_T_MAX_C) && (h > 0 || rain(d) > 0);
    if (penetrationOk || developmentOk) return { cls: "moderate", value: 0.5 };
    const partial = inRange(tw, YELLOW_RUST_INFECT_T_MIN_C, YELLOW_RUST_INFECT_T_MAX_C) ? h / YELLOW_RUST_INFECT_WET_HOURS : 0;
    return { cls: "low", value: 0.4 * clamp01(partial) };
  },
  reasonHigh: (dates) =>
    `Cool (about 7–12°C), wet-leaf conditions lasting 8 hours or more on ${dates} are ideal for yellow rust spores to infect wheat.`,
  reasonModerate: (dates) =>
    `Cool weather with dew or rain on ${dates} can help yellow rust develop, but not under its ideal infection conditions, so the risk to wheat is moderate.`,
  reasonLow: (range) =>
    `Between ${range} the weather is not expected to be cool and wet enough for yellow rust to infect wheat.`,
});

const BROWN_RUST_INFECT_T_MIN_C = fToC(59); // 15 °C (UNL G2180)
const BROWN_RUST_INFECT_T_MAX_C = fToC(68); // 20 °C (UNL G2180)
const BROWN_RUST_INFECT_WET_HOURS = 6; //      (UNL G2180)
const BROWN_RUST_DEV_T_MIN_C = fToC(68); //    20 °C (UNL G2180, development)
const BROWN_RUST_DEV_T_MAX_C = fToC(77); //    25 °C (UNL G2180, development)
const BROWN_RUST_SHORT_DEW_HOURS = 3; //       FAO: 3 h dew can suffice at about 20 °C
const BROWN_RUST_COOL_T_MIN_C = 10; //         FAO: at 10 °C ...
const BROWN_RUST_COOL_DEW_HOURS = 12; //       ... a 12-hour dew period is necessary
// Adaptations:
//  - Free moisture hours = hoursRh90 (A1); infection temperature = tmeanHumid (A3).
//  - High = UNL optimal infection conditions (15-20 °C, >= 6 h) on a forecast day.
//  - Moderate = FAO lighter infection conditions: 3-5 h wetness at 15-20 °C, or >= 12 h wetness at
//    10-15 °C (the FAO 10 °C requirement applied to the whole cooler band, which is conservative), or a UNL
//    development-temperature day (daily mean 20-25 °C) with dew or rain.

const wheatBrownRust = dailyInfectionRule({
  id: "wheat_brown_rust_unl",
  crop: "wheat",
  diseaseKey: "wheat_brown_rust",
  diseaseName: "brown rust",
  model: "Leaf rust infection conditions (UNL Extension G2180)",
  source: WHEAT_RUST_SOURCE,
  classify(d) {
    const h = wetHours(d);
    const tw = wetTemp(d);
    const tday = dayMeanTemp(d);
    const inInfectBand = inRange(tw, BROWN_RUST_INFECT_T_MIN_C, BROWN_RUST_INFECT_T_MAX_C);
    if (h >= BROWN_RUST_INFECT_WET_HOURS && inInfectBand) return { cls: "high", value: 1 };
    const shortDew = h >= BROWN_RUST_SHORT_DEW_HOURS && inInfectBand;
    const coolLongDew =
      h >= BROWN_RUST_COOL_DEW_HOURS && isNum(tw) && tw >= BROWN_RUST_COOL_T_MIN_C && tw < BROWN_RUST_INFECT_T_MIN_C;
    const developmentOk = inRange(tday, BROWN_RUST_DEV_T_MIN_C, BROWN_RUST_DEV_T_MAX_C) && (h > 0 || rain(d) > 0);
    if (shortDew || coolLongDew || developmentOk) return { cls: "moderate", value: 0.5 };
    return { cls: "low", value: inInfectBand ? 0.4 * clamp01(h / BROWN_RUST_INFECT_WET_HOURS) : 0 };
  },
  reasonHigh: (dates) =>
    `Mild (15–20°C) weather with leaves wet for 6 hours or more on ${dates} is ideal for brown rust spores to infect wheat.`,
  reasonModerate: (dates) =>
    `Weather on ${dates} allows some brown rust infection or spread (short dew spells or warm, damp days), so the risk to wheat is moderate.`,
  reasonLow: (range) =>
    `Between ${range} leaves are not expected to stay wet long enough at the right temperature for brown rust on wheat.`,
});

/* ------------------------------------------------------------------ */
/* 7. Maize: northern leaf blight, common rust, gray leaf spot         */
/* ------------------------------------------------------------------ */

// Crop Protection Network, "Northern Corn Leaf Blight": favoured by "moderate temperatures (64-81°F)" and
// "extended periods (>6 hours) of leaf wetness (rain or dew)".
const NLB_T_MIN_C = fToC(64); // 17.8 °C
const NLB_T_MAX_C = fToC(81); // 27.2 °C
const NLB_WET_HOURS_MORE_THAN = 6;
const NLB_MODERATE_WET_HOURS = 3; // KrishiScan heuristic: half the wetness requirement, temperature in range
// Adaptations: wetness = hoursRh90 (A1); temperature = tmeanHumid (A3); "> 6 hours" means 7+ whole hours.

const maizeNorthernLeafBlight = dailyInfectionRule({
  id: "maize_northern_leaf_blight_cpn",
  crop: "maize",
  diseaseKey: "maize_northern_leaf_blight",
  diseaseName: "northern leaf blight",
  model: "NLB favourable conditions (Crop Protection Network)",
  source: "https://cropprotectionnetwork.org/encyclopedia/northern-corn-leaf-blight-of-corn",
  classify(d) {
    const h = wetHours(d);
    const tOk = inRange(wetTemp(d), NLB_T_MIN_C, NLB_T_MAX_C);
    if (tOk && h > NLB_WET_HOURS_MORE_THAN) return { cls: "high", value: 1 };
    if (tOk && h >= NLB_MODERATE_WET_HOURS) return { cls: "moderate", value: 0.5 };
    return { cls: "low", value: tOk ? 0.4 * clamp01(h / NLB_MODERATE_WET_HOURS) : 0 };
  },
  reasonHigh: (dates) =>
    `Leaves are expected to stay wet for more than 6 hours at 18–27°C on ${dates}, which favours northern leaf blight infection in maize.`,
  reasonModerate: (dates) =>
    `Mild weather with shorter wet-leaf spells on ${dates} gives some chance of northern leaf blight, so the risk to maize is moderate.`,
  reasonLow: (range) =>
    `Between ${range} maize leaves are not expected to stay wet long enough in mild weather for northern leaf blight.`,
});

// University of Minnesota Extension, "Common rust on corn": favours "cool temperatures (60 - 76 degrees F),
// heavy dews, about six hours of leaf wetness, and relative humidity greater than 95 percent";
// "temperatures above 80 degrees F suppress disease development and spread".
const COMMON_RUST_T_MIN_C = fToC(60); // 15.6 °C
const COMMON_RUST_T_MAX_C = fToC(76); // 24.4 °C
const COMMON_RUST_WET_HOURS = 6;
const COMMON_RUST_RH_MORE_THAN_PCT = 95;
const COMMON_RUST_SUPPRESS_ABOVE_C = fToC(80); // 26.7 °C
const COMMON_RUST_MODERATE_WET_HOURS = 3; // KrishiScan heuristic: half the wetness requirement
// Adaptations:
//  - Wetness = hoursRh90 (A1); infection temperature = tmeanHumid (A3).
//  - "RH greater than 95 %" is checked as the day's maximum RH (rhMax > 95); our hours field only counts >= 90 %.
//  - "Temperatures above 80°F" is checked on the daily mean temperature; such days are capped at moderate.
//  - Moderate = infection temperature and 6 h wetness but RH > 95 % not confirmed or suppressing heat, or
//    >= 3 h wetness with RH > 95 % in the temperature range (heuristic).

const maizeCommonRust = dailyInfectionRule({
  id: "maize_common_rust_umn",
  crop: "maize",
  diseaseKey: "maize_common_rust",
  diseaseName: "common rust",
  model: "Common rust favourable conditions (UMN Extension)",
  source: "https://extension.umn.edu/corn-pest-management/common-rust-corn",
  classify(d) {
    const h = wetHours(d);
    const tOk = inRange(wetTemp(d), COMMON_RUST_T_MIN_C, COMMON_RUST_T_MAX_C);
    const veryHumid = isNum(d.rhMax) && d.rhMax > COMMON_RUST_RH_MORE_THAN_PCT;
    const tday = dayMeanTemp(d);
    const tooHot = isNum(tday) && tday > COMMON_RUST_SUPPRESS_ABOVE_C;
    if (tOk && h >= COMMON_RUST_WET_HOURS && veryHumid && !tooHot) return { cls: "high", value: 1 };
    if (tOk && (h >= COMMON_RUST_WET_HOURS || (h >= COMMON_RUST_MODERATE_WET_HOURS && veryHumid))) {
      return { cls: "moderate", value: 0.5 };
    }
    return { cls: "low", value: tOk ? 0.4 * clamp01(h / COMMON_RUST_WET_HOURS) : 0 };
  },
  reasonHigh: (dates) =>
    `Cool (16–24°C), very humid weather with about 6 hours or more of wet leaves on ${dates} favours common rust infection in maize.`,
  reasonModerate: (dates) =>
    `Weather on ${dates} is partly suitable for common rust (wet leaves at mild temperatures, but not all conditions are met), so the risk to maize is moderate.`,
  reasonLow: (range) =>
    `Between ${range} the weather is not expected to be cool and humid enough for common rust on maize.`,
});

// NC State Extension, "Gray Leaf Spot in Corn": infection favoured by "warm (70-90°F)", "humid (>= 90%)"
// weather with "leaf wetness for at least 12 hours".
const GLS_T_MIN_C = fToC(70); // 21.1 °C
const GLS_T_MAX_C = fToC(90); // 32.2 °C
const GLS_WET_HOURS = 12;
const GLS_MODERATE_WET_HOURS = 6; // KrishiScan heuristic: half the wetness requirement
// Adaptations: hoursRh90 is both the ">= 90 % humidity" and the leaf-wetness measure (A1);
// temperature = tmeanHumid (A3).

const maizeGrayLeafSpot = dailyInfectionRule({
  id: "maize_gray_leaf_spot_ncsu",
  crop: "maize",
  diseaseKey: "maize_gray_leaf_spot",
  diseaseName: "gray leaf spot",
  model: "GLS favourable conditions (NC State Extension)",
  source: "https://content.ces.ncsu.edu/gray-leaf-spot-in-corn",
  classify(d) {
    const h = wetHours(d);
    const tOk = inRange(wetTemp(d), GLS_T_MIN_C, GLS_T_MAX_C);
    if (tOk && h >= GLS_WET_HOURS) return { cls: "high", value: 1 };
    if (tOk && h >= GLS_MODERATE_WET_HOURS) return { cls: "moderate", value: 0.5 };
    return { cls: "low", value: tOk ? 0.4 * clamp01(h / GLS_MODERATE_WET_HOURS) : 0 };
  },
  reasonHigh: (dates) =>
    `Warm (21–32°C) weather with humidity above 90% for 12 hours or more on ${dates} favours gray leaf spot infection in maize.`,
  reasonModerate: (dates) =>
    `Warm weather with fairly long humid spells on ${dates} gives some chance of gray leaf spot, so the risk to maize is moderate.`,
  reasonLow: (range) =>
    `Between ${range} maize leaves are not expected to stay humid long enough in warm weather for gray leaf spot.`,
});

/* ------------------------------------------------------------------ */
/* 8. Grape black rot - Spotts (1977)                                  */
/* ------------------------------------------------------------------ */

// Spotts, R.A. 1977. Effect of leaf wetness duration and temperature on the infectivity of Guignardia bidwellii
// on grape leaves. Phytopathology 67:1378-1381. Table as published by University of Maine Cooperative Extension
// fact sheet 5106e: hours of continuous leaf wetness required for infection at each temperature.
const BLACK_ROT_SPOTTS_TABLE = [
  { tC: fToC(50), hours: 24 }, // 10 °C
  { tC: fToC(55), hours: 12 }, // 13 °C
  { tC: fToC(60), hours: 9 }, //  16 °C
  { tC: fToC(65), hours: 8 }, //  18 °C
  { tC: fToC(70), hours: 7 }, //  21 °C
  { tC: fToC(75), hours: 7 }, //  24 °C
  { tC: fToC(80), hours: 6 }, //  27 °C (optimum)
  { tC: fToC(85), hours: 9 }, //  29 °C
  { tC: fToC(90), hours: 12 }, // 32 °C
];
// Adaptations:
//  - Continuous wetness is not available; hoursRh90 per calendar day is used (A1, A2), which can overstate
//    continuity.
//  - Temperature = tmeanHumid (A3). Outside 10-32.2 °C no requirement is defined, so no infection is flagged.
//  - Between table rows we do not interpolate: "high" needs the LONGER of the two bracketing requirements
//    (conservative); meeting only the shorter one gives "moderate".
//  - KrishiScan heuristic (moderate): at least half of the required hours.
//  - Susceptible tissue and inoculum (roughly bud break to berry touch/veraison) are not checked.

function blackRotRequirement(t) {
  const rows = BLACK_ROT_SPOTTS_TABLE;
  if (!isNum(t) || t < rows[0].tC - 1e-9 || t > rows[rows.length - 1].tC + 1e-9) return null;
  for (let i = 0; i < rows.length - 1; i++) {
    if (t >= rows[i].tC - 1e-9 && t <= rows[i + 1].tC + 1e-9) {
      if (Math.abs(t - rows[i].tC) < 1e-9) return { strict: rows[i].hours, lenient: rows[i].hours };
      if (Math.abs(t - rows[i + 1].tC) < 1e-9) return { strict: rows[i + 1].hours, lenient: rows[i + 1].hours };
      return {
        strict: Math.max(rows[i].hours, rows[i + 1].hours),
        lenient: Math.min(rows[i].hours, rows[i + 1].hours),
      };
    }
  }
  return null;
}

const grapeBlackRot = dailyInfectionRule({
  id: "grape_black_rot_spotts1977",
  crop: "grape",
  diseaseKey: "grape_black_rot",
  diseaseName: "black rot",
  model: "Spotts (1977) wetness-temperature infection table",
  source: "https://extension.umaine.edu/ipm/ipddl/publications/5106e/",
  classify(d) {
    const h = wetHours(d);
    const req = blackRotRequirement(wetTemp(d));
    if (!req) return { cls: "low", value: 0 };
    if (h >= req.strict) return { cls: "high", value: 1 };
    if (h >= req.lenient || h >= Math.ceil(req.strict / 2)) return { cls: "moderate", value: 0.5 };
    return { cls: "low", value: 0.4 * clamp01(h / Math.ceil(req.strict / 2)) };
  },
  reasonHigh: (dates) =>
    `Grape leaves are expected to stay wet long enough for the temperature on ${dates} (for example 6–7 hours at 21–27°C) for black rot spores to infect.`,
  reasonModerate: (dates) =>
    `Grape leaves may stay wet for part of the time black rot needs on ${dates}, so the infection risk is moderate.`,
  reasonLow: (range) =>
    `Between ${range} grape leaves are not expected to stay wet long enough for black rot infection.`,
});

/* ------------------------------------------------------------------ */
/* Exported rules                                                      */
/* ------------------------------------------------------------------ */
// Note: potato_late_blight has two rules (Hutton Criteria and JHULSACAST). Show the highest level per
// diseaseKey, or show both with their model names.

export const RULES = [
  huttonRule({ id: "potato_late_blight_hutton", crop: "potato", diseaseKey: "potato_late_blight", cropName: "potato" }),
  potatoLateBlightJhulsacast,
  huttonRule({ id: "tomato_late_blight_hutton", crop: "tomato", diseaseKey: "tomato_late_blight", cropName: "tomato" }),
  tomcastRule({ id: "potato_early_blight_tomcast", crop: "potato", diseaseKey: "potato_early_blight", cropName: "potato" }),
  tomcastRule({ id: "tomato_early_blight_tomcast", crop: "tomato", diseaseKey: "tomato_early_blight", cropName: "tomato" }),
  riceLeafBlast,
  riceBrownSpot,
  wheatYellowRust,
  wheatBrownRust,
  maizeNorthernLeafBlight,
  maizeCommonRust,
  maizeGrayLeafSpot,
  grapeBlackRot,
];
