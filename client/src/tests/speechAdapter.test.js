import { getVoiceConfigForLocale } from '../utils/speechAdapter';

describe('speechAdapter', () => {
  it('sets slower pace rate for Hindi and Tamil speech readability', () => {
    expect(getVoiceConfigForLocale('hi').rate).toBe(0.9);
    expect(getVoiceConfigForLocale('ta').lang).toBe('ta-IN');
  });
});
