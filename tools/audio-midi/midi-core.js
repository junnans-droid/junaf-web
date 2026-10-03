(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.JunafMidi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PPQ = 480;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const noteName = midi => `${['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi % 12]}${Math.floor(midi / 12) - 1}`;
  const vlq = number => { const out = [number & 127]; while ((number >>= 7)) out.unshift((number & 127) | 128); return out; };
  const u16 = number => [(number >> 8) & 255, number & 255];
  const u32 = number => [(number >>> 24) & 255, (number >>> 16) & 255, (number >>> 8) & 255, number & 255];
  const chunk = (name, bytes) => [...Array.from(name).map(char => char.charCodeAt(0)), ...u32(bytes.length), ...bytes];
  function writeMidi(project) {
    const tempo = clamp(Number(project.tempo) || 120, 40, 240);
    const ticks = seconds => Math.max(0, Math.round(Number(seconds) * tempo / 60 * PPQ));
    const microseconds = Math.round(60000000 / tempo);
    const tempoTrack = [0, 255, 81, 3, (microseconds >> 16) & 255, (microseconds >> 8) & 255,
      microseconds & 255, 0, 255, 47, 0];
    const tracks = [chunk('MTrk', tempoTrack)];
    let melodicChannel = 0;
    for (const track of project.tracks || []) {
      if (!track.isDrum && melodicChannel === 9) melodicChannel++;
      const channel = track.isDrum ? 9 : melodicChannel++;
      if (channel > 15) break;
      const events = [{time: 0, order: 0, data: [0xc0 | channel, clamp(track.program | 0, 0, 127)]}];
      for (const note of track.notes || []) {
        const pitch = clamp(note.pitch | 0, 0, 127);
        const start = ticks(note.start);
        const end = Math.max(start + 1, ticks(Number(note.start) + Number(note.duration)));
        events.push({time: start, order: 2, data: [0x90 | channel, pitch, clamp(note.velocity | 0, 1, 127)]});
        events.push({time: end, order: 1, data: [0x80 | channel, pitch, 0]});
      }
      events.sort((a, b) => a.time - b.time || a.order - b.order);
      let previous = 0;
      const bytes = [];
      for (const event of events) { bytes.push(...vlq(event.time - previous), ...event.data); previous = event.time; }
      bytes.push(0, 255, 47, 0);
      tracks.push(chunk('MTrk', bytes));
    }
    return new Uint8Array([...chunk('MThd', [0, 1, ...u16(tracks.length), ...u16(PPQ)]), ...tracks.flat()]);
  }
  return {writeMidi, noteName, PPQ};
});
