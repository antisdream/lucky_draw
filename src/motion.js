export function motionModeFromConfig(config = {}) {
  if (['system', 'full', 'reduced'].includes(config.motionMode)) return config.motionMode;
  // Older HTML files only stored the app's reduce-motion switch.
  return config.reduced === true ? 'reduced' : 'system';
}

export function shouldReduceMotion(mode, systemPreference) {
  return mode === 'reduced' || (mode === 'system' && !!systemPreference);
}
