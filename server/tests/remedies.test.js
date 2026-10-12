import { describe, expect, it } from 'vitest';
import { followUpDays, followUpPlan } from '../src/services/followUp.js';
import { RETAILERS, organicRemedies } from '../src/services/remedies.js';

describe('organic remedies', () => {
  it('names the product behind a line of advice and links a search for it', () => {
    const [r] = organicRemedies({ organicControl: ['Soil application of Trichoderma asperellum (viride) @ 1.0 kg per acre'] });
    expect(r.product).toMatchObject({ name: 'Trichoderma viride', kind: 'biofungicide' });
    expect(r.buy).toHaveLength(RETAILERS.length);
    for (const link of r.buy) expect(link.url).toContain(encodeURIComponent('Trichoderma'));
    // The advice itself is kept verbatim: the dose and method are the part that matters.
    expect(r.advice).toContain('1.0 kg per acre');
  });

  it('suggests nothing to buy for something mixed on the farm', () => {
    const [r] = organicRemedies({ organicControl: ['Spray diluted cow urine every 10 days'] });
    expect(r.homemade).toBe(true);
    expect(r.buy).toEqual([]);
    expect(r.searchTerm).toBeNull();
  });

  it('still gives a usable search term for advice it does not recognise', () => {
    const [r] = organicRemedies({ organicControl: ['Foliar spray of seaweed extract @ 3 ml per litre'] });
    expect(r.product).toBeNull();
    expect(r.searchTerm).toContain('seaweed extract');
    // Doses and application words are noise in a shop's search box.
    expect(r.searchTerm).not.toMatch(/\d|per litre|Foliar spray/i);
    expect(r.buy.length).toBeGreaterThan(0);
  });

  it('sends nobody shopping for something they do rather than buy', () => {
    // Every one of these used to come back with Amazon and Flipkart search links.
    const practices = organicRemedies({
      organicControl: [
        'Remove and destroy infected lower leaves and all crop residue after harvest',
        'Three-year rotation away from all cole crops and mustard, and control cruciferous weeds',
        'Hot water seed treatment at 50°C for 30 minutes before sowing',
      ],
    });
    for (const r of practices) {
      expect(r).toMatchObject({ practice: true, product: null, buy: [], searchTerm: null, homemade: false });
    }
    // A product with a dose is still something to buy, recognised or not.
    const [fym] = organicRemedies({ organicControl: ['Add well rotten FYM @ 10 t/acre at field preparation'] });
    expect(fym.practice).toBe(false);
    expect(fym.buy.length).toBeGreaterThan(0);
  });

  it('invents no advice of its own', () => {
    expect(organicRemedies({ organicControl: [] })).toEqual([]);
    expect(organicRemedies({})).toEqual([]);
    expect(organicRemedies(null)).toEqual([]);
  });
});

describe('follow-up scan date', () => {
  it('comes back sooner for a disease that moves fast', () => {
    const blight = followUpDays({ causalAgentType: 'oomycete', severity: 'severe' });
    const virus = followUpDays({ causalAgentType: 'viral', severity: 'moderate' });
    expect(blight).toBeLessThan(virus);
    expect(blight).toBeGreaterThanOrEqual(3);
  });

  it('comes back sooner again when a lot of the leaf has already gone', () => {
    const disease = { causalAgentType: 'fungal', severity: 'moderate' };
    expect(followUpDays(disease, { percent: 40 })).toBeLessThan(followUpDays(disease, { percent: 2 }));
  });

  it('gives a healthy leaf a longer interval, and always returns a date', () => {
    const from = new Date('2026-05-01T00:00:00Z');
    const healthy = followUpPlan({ isHealthy: true }, null, from);
    expect(healthy.healthy).toBe(true);
    expect(healthy.days).toBe(14);
    expect(healthy.date.toISOString().slice(0, 10)).toBe('2026-05-15');

    // No disease record at all must still produce a date rather than crash the result page.
    expect(followUpPlan(null, null, from).date).toBeInstanceOf(Date);
  });

  it('keeps the interval inside sane bounds', () => {
    for (const agent of ['oomycete', 'bacterial', 'fungal', 'pest', 'viral', 'deficiency', 'none']) {
      for (const severity of ['low', 'moderate', 'severe']) {
        const days = followUpDays({ causalAgentType: agent, severity }, { percent: 90 });
        expect(days).toBeGreaterThanOrEqual(3);
        expect(days).toBeLessThanOrEqual(21);
      }
    }
  });
});
