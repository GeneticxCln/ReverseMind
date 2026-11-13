let audio: AudioContext | null = null;

/** A short two-note chime for in-app notifications. Fails silently when audio is unavailable. */
export function playNotificationChime(): void {
  try {
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    audio ||= new Ctor();
    if (audio.state === 'suspended') void audio.resume();
    const start = audio.currentTime;
    [880, 1174.66].forEach((frequency, index) => {
      const oscillator = audio!.createOscillator();
      const gain = audio!.createGain();
      const at = start + index * 0.11;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.06, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      oscillator.connect(gain);
      gain.connect(audio!.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.18);
    });
  } catch {
    // Audio is a nicety; never let it interfere with notifications.
  }
}
