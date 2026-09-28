/**
 * Parses spoken vernacular farmer voice commands into application actions.
 */
export function parseFarmerVoiceCommand(transcript) {
  const clean = transcript.toLowerCase().trim();
  if (clean.includes('scan') || clean.includes('photo') || clean.includes('tasveer')) {
    return 'ACTION_SCAN';
  }
  if (clean.includes('weather') || clean.includes('mausam')) {
    return 'ACTION_WEATHER';
  }
  if (clean.includes('mandi') || clean.includes('bhav') || clean.includes('price')) {
    return 'ACTION_MANDI';
  }
  return 'ACTION_UNKNOWN';
}
