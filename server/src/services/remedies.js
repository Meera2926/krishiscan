/**
 * Turns the organic control advice already in the knowledge base into something a farmer can
 * actually buy.
 *
 * It never invents a recommendation. Every suggestion comes from the disease's own
 * `organicControl` entries, which were taken from the extension source recorded on the disease.
 * What this adds is the product name to search for and links to retailers that stock farm
 * inputs — and because stock and prices cannot be verified from here, each link opens a search
 * on that retailer rather than claiming a particular product is in stock at a particular price.
 */

/**
 * Bio-control and botanical actives in common use on Indian farms. `match` is run against the
 * advice line; `search` is the phrase a shop will actually recognise.
 */
const ORGANIC_AGENTS = [
  { match: /trichoderma/i, name: 'Trichoderma viride', kind: 'biofungicide', search: 'Trichoderma viride biofungicide' },
  { match: /pseudomonas\s*fluorescens/i, name: 'Pseudomonas fluorescens', kind: 'biofungicide', search: 'Pseudomonas fluorescens biofungicide' },
  { match: /bacillus\s*subtilis/i, name: 'Bacillus subtilis', kind: 'biofungicide', search: 'Bacillus subtilis biofungicide' },
  { match: /bacillus\s*thuringiensis|\bbt\b/i, name: 'Bacillus thuringiensis', kind: 'biopesticide', search: 'Bacillus thuringiensis insecticide' },
  { match: /beauveria/i, name: 'Beauveria bassiana', kind: 'biopesticide', search: 'Beauveria bassiana' },
  { match: /metarhizium/i, name: 'Metarhizium anisopliae', kind: 'biopesticide', search: 'Metarhizium anisopliae' },
  { match: /verticillium|lecanicillium/i, name: 'Lecanicillium lecanii', kind: 'biopesticide', search: 'Verticillium lecanii bio insecticide' },
  { match: /neem|azadirachtin/i, name: 'Neem oil (azadirachtin)', kind: 'botanical', search: 'neem oil azadirachtin 1500 ppm' },
  { match: /bordeaux/i, name: 'Bordeaux mixture', kind: 'mineral', search: 'Bordeaux mixture copper sulphate lime' },
  { match: /copper\s*(oxychloride|hydroxide)/i, name: 'Copper oxychloride', kind: 'mineral', search: 'copper oxychloride 50 WP fungicide' },
  { match: /\bsulphur\b|\bsulfur\b/i, name: 'Wettable sulphur', kind: 'mineral', search: 'wettable sulphur 80 WDG fungicide' },
  { match: /potassium\s*bicarbonate/i, name: 'Potassium bicarbonate', kind: 'mineral', search: 'potassium bicarbonate fungicide' },
  { match: /pheromone|trap/i, name: 'Pheromone trap', kind: 'trap', search: 'pheromone trap agriculture' },
  { match: /sticky\s*trap/i, name: 'Sticky trap', kind: 'trap', search: 'yellow sticky trap agriculture' },
];

/** Prepared on the farm, so there is nothing to buy; the advice still stands on its own. */
const HOMEMADE = /cow\s*urine|panchagavya|jeevamrut|buttermilk|ash\b|compost tea/i;

/**
 * Retailers whose search URL was checked by hand. Add Indian agri-input specialists here as you
 * confirm their search path — a guessed pattern gives farmers a dead link.
 */
export const RETAILERS = [
  { id: 'amazon', name: 'Amazon.in', url: (q) => `https://www.amazon.in/s?k=${encodeURIComponent(q)}` },
  { id: 'flipkart', name: 'Flipkart', url: (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}` },
];

/** Strips doses and application notes, leaving something worth typing into a shop's search box. */
function fallbackSearch(advice) {
  return advice
    .replace(/@.*$/, '')
    .replace(/\b\d+(\.\d+)?\s*(kg|g|ml|l|litre|liters?|%|ppm)\b/gi, ' ')
    .replace(/\b(soil|foliar|seed)\s+(application|treatment|spray)\b/gi, ' ')
    .replace(/\bper\s+(acre|hectare|ha|litre|l)\b/gi, ' ')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 6)
    .join(' ');
}

/**
 * @param {{organicControl?: string[]}} disease
 * @returns {Array<{advice: string, product: {name: string, kind: string}|null, buy: Array<{id,name,url}>}>}
 */
export function organicRemedies(disease) {
  const lines = disease?.organicControl ?? [];
  return lines.map((advice) => {
    const agent = ORGANIC_AGENTS.find((a) => a.match.test(advice));
    const homemade = HOMEMADE.test(advice);
    const query = agent?.search ?? fallbackSearch(advice);

    return {
      advice,
      product: agent ? { name: agent.name, kind: agent.kind } : null,
      // Nothing to link to for something mixed up on the farm.
      buy: homemade || !query ? [] : RETAILERS.map((r) => ({ id: r.id, name: r.name, url: r.url(query) })),
      searchTerm: homemade ? null : query,
      homemade,
    };
  });
}
