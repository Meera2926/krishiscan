import { parseFarmerVoiceCommand } from '../utils/voiceCommandParser';

describe('voiceCommandParser', () => {
  it('identifies scan intent from Hindi and English voice input', () => {
    expect(parseFarmerVoiceCommand('kripya tasveer lijiye')).toBe('ACTION_SCAN');
    expect(parseFarmerVoiceCommand('scan this leaf')).toBe('ACTION_SCAN');
  });

  it('identifies mandi rate queries', () => {
    expect(parseFarmerVoiceCommand('aaj ka mandi bhav')).toBe('ACTION_MANDI');
  });
});
