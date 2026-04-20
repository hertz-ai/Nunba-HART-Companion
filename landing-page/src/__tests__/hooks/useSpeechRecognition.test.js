/**
 * Jest smoke tests for hooks/useSpeechRecognition — batch #22.
 */

describe('useSpeechRecognition module', () => {
  it('module loads without error', () => {
    const mod = require('../../hooks/useSpeechRecognition');
    expect(mod).toBeDefined();
  });

  it('exports a hook (default or named)', () => {
    const mod = require('../../hooks/useSpeechRecognition');
    const hook = mod.default || mod.useSpeechRecognition;
    expect(typeof hook).toBe('function');
  });
});
