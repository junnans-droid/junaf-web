(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JUNAFAudioAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FFT_SIZE = 2048;
  const bins = [80, 160, 320, 640, 1280, 2600];
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  function fftMagnitude(samples, start, sampleRate) {
    const real = new Float32Array(FFT_SIZE), imag = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      const index = start + i;
      real[i] = (index < samples.length ? samples[index] : 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
    }
    for (let i = 1, j = 0; i < FFT_SIZE; i++) {
      let bit = FFT_SIZE >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const tmp = real[i]; real[i] = real[j]; real[j] = tmp; }
    }
    for (let length = 2; length <= FFT_SIZE; length <<= 1) {
      const angle = -2 * Math.PI / length, wr = Math.cos(angle), wi = Math.sin(angle);
      for (let offset = 0; offset < FFT_SIZE; offset += length) {
        let cr = 1, ci = 0;
        for (let j = 0; j < length / 2; j++) {
          const a = offset + j, b = a + length / 2;
          const tr = cr * real[b] - ci * imag[b], ti = cr * imag[b] + ci * real[b];
          real[b] = real[a] - tr; imag[b] = imag[a] - ti;
          real[a] += tr; imag[a] += ti;
          const nextR = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = nextR;
        }
      }
    }
    const chroma = new Float32Array(12), bands = new Float32Array(6);
    let total = 0, weighted = 0;
    for (let i = 1; i < FFT_SIZE / 2; i++) {
      const hz = i * sampleRate / FFT_SIZE;
      if (hz < 55 || hz > 2600) continue;
      const magnitude = Math.hypot(real[i], imag[i]);
      total += magnitude; weighted += magnitude * hz;
      const midi = Math.round(69 + 12 * Math.log2(hz / 440));
      chroma[((midi % 12) + 12) % 12] += magnitude;
      const band = bins.findIndex(limit => hz <= limit);
      if (band >= 0) bands[band] += magnitude;
    }
    if (total > 0) for (let i = 0; i < 12; i++) chroma[i] /= total;
    if (total > 0) for (let i = 0; i < 6; i++) bands[i] /= total;
    return {chroma, bands, centroid: total ? weighted / total / 2600 : 0};
  }
  function energyFrames(samples, sampleRate, seconds) {
    const count = Math.ceil(seconds * 10), step = sampleRate / 10, levels = new Float32Array(count);
    for (let frame = 0; frame < count; frame++) {
      const start = Math.floor(frame * step), end = Math.min(samples.length, Math.floor((frame + 1) * step));
      let sum = 0;
      for (let i = start; i < end; i++) sum += samples[i] * samples[i];
      levels[frame] = Math.sqrt(sum / Math.max(1, end - start));
    }
    return levels;
  }
  function tempoOf(levels) {
    if (levels.length < 100) return {bpm:null, confidence:0};
    const novelty = new Float32Array(levels.length);
    for (let i = 1; i < levels.length; i++) novelty[i] = Math.max(0, levels[i] - levels[i - 1]);
    const avg = mean([...novelty]);
    if (avg < 0.0003) return {bpm:null, confidence:0};
    let best = {score:0, lag:0}, sumScores = 0, tested = 0;
    for (let lag = 3; lag <= 10; lag++) {
      let score = 0;
      for (let i = lag; i < novelty.length; i++) score += novelty[i] * novelty[i - lag];
      score /= novelty.length - lag;
      sumScores += score; tested++;
      if (score > best.score) best = {score, lag};
    }
    const strength = best.score / Math.max(1e-10, sumScores / tested);
    return strength < 1.22 ? {bpm:null, confidence:0} :
      {bpm:Math.round(600 / best.lag), confidence:clamp((strength - 1.1) / 1.8,0,1)};
  }
  function featureFrames(samples, sampleRate, seconds, onProgress) {
    const count = Math.ceil(seconds), frames = [];
    for (let second = 0; second < count; second++) {
      const start = Math.max(0, Math.min(samples.length - 1,
        Math.floor((second + 0.5) * sampleRate - FFT_SIZE / 2)));
      let sum = 0;
      for (let i = start; i < Math.min(samples.length, start + FFT_SIZE); i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / FFT_SIZE), spectrum = fftMagnitude(samples, start, sampleRate);
      frames.push({rms, vector:[...spectrum.chroma, ...spectrum.bands, spectrum.centroid]});
      if (onProgress && second % 20 === 0) onProgress(Math.round(10 + second / count * 75));
    }
    return frames;
  }
  function distance(left, right) {
    let sum = 0, leftNorm = 0, rightNorm = 0;
    for (let i = 0; i < left.length; i++) {
      sum += left[i] * right[i]; leftNorm += left[i] * left[i]; rightNorm += right[i] * right[i];
    }
    return leftNorm && rightNorm ? 1 - sum / Math.sqrt(leftNorm * rightNorm) : 0;
  }
  function averageVector(frames, from, to) {
    const out = new Float32Array(20);
    for (let i = from; i < to; i++) {
      const f = frames[i];
      for (let j = 0; j < 19; j++) out[j] += f.vector[j];
      out[19] += f.rms;
    }
    const count = Math.max(1, to - from);
    for (let j = 0; j < 20; j++) out[j] /= count;
    return out;
  }
  function boundariesOf(frames, seconds) {
    const window = 6, scores = [];
    for (let at = window; at < frames.length - window; at++) {
      const before = averageVector(frames, at - window, at), after = averageVector(frames, at, at + window);
      const timbre = distance(before, after);
      const energy = Math.abs(Math.log1p(before[19] * 30) - Math.log1p(after[19] * 30));
      scores.push({at, score:timbre + energy * 0.38});
    }
    const sorted = scores.map(row => row.score).sort((a,b) => a-b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const top = sorted[Math.floor(sorted.length * .9)] || 0;
    const threshold = Math.max(.085, median + (top - median) * .38);
    const candidates = scores.filter((row,index) => row.score >= threshold &&
      row.score >= (scores[index - 1]?.score ?? 0) && row.score >= (scores[index + 1]?.score ?? 0))
      .sort((a,b) => b.score - a.score);
    const selected = [], maximum = Math.min(12,Math.max(2,Math.round(seconds / 27)));
    for (const candidate of candidates) {
      if (selected.length >= maximum || candidate.at < 8 || seconds - candidate.at < 8 ||
        selected.some(item => Math.abs(item.at - candidate.at) < 12)) continue;
      selected.push(candidate);
    }
    return {times:[0,...selected.map(item => item.at).sort((a,b) => a-b),seconds],
      strength:selected.length ? mean(selected.map(item => item.score)) : 0};
  }
  function sectionsOf(frames, boundaryResult, seconds) {
    const {times,strength} = boundaryResult;
    const sections = times.slice(0,-1).map((start,index) => {
      const end = times[index + 1];
      const from = Math.floor(start), to = Math.min(frames.length,Math.ceil(end));
      return {start,end,vector:averageVector(frames,from,to),energy:mean(frames.slice(from,to).map(f => f.rms))};
    });
    const peak = Math.max(...sections.map(s => s.energy),1e-6), groups = [];
    for (const section of sections) {
      const match = groups.findIndex(group => distance(section.vector,group.vector) < .095 &&
        Math.abs(section.energy-group.energy) / peak < .3);
      if (match < 0) {groups.push(section);section.group=groups.length-1;}
      else section.group=match;
    }
    const countByGroup = groups.map((_,index) => sections.filter(s => s.group===index).length);
    return sections.map((section,index) => {
      const relative = section.energy / peak;
      let role = '段落变化';
      if (sections.length === 1) role = '连续段落';
      else if (index === 0 && section.end - section.start < 28 && relative < .75) role = '可能的前奏';
      else if (index === sections.length-1 && relative < .65) role = '可能的尾奏';
      else if (countByGroup[section.group] > 1 && relative > .7) role = '可能的副歌 / 主题回归';
      else if (relative < .58) role = '较安静的过渡';
      else if (countByGroup[section.group] > 1) role = '重复段落';
      else role = '新段落';
      return {start:Math.round(section.start),end:Math.round(section.end),
        label:String.fromCharCode(65 + section.group),role,
        energy:Math.round(relative * 100),confidence:clamp(strength * 1.7,0,.75)};
    });
  }
  function analyzePCM(samples, sampleRate, onProgress) {
    if (!(samples instanceof Float32Array) || !Number.isFinite(sampleRate) || sampleRate < 4000)
      throw Error('音频数据无效');
    const seconds = samples.length / sampleRate;
    if (seconds < 15) throw Error('音频至少需要 15 秒才能分析结构');
    if (seconds > 600) throw Error('当前最多分析 10 分钟音频');
    const levels = energyFrames(samples,sampleRate,seconds);
    onProgress?.(10);
    const tempo = tempoOf(levels);
    const frames = featureFrames(samples,sampleRate,seconds,onProgress);
    const boundary = boundariesOf(frames,seconds);
    const sections = sectionsOf(frames,boundary,seconds);
    onProgress?.(100);
    return {duration:Math.round(seconds),tempo:tempo.bpm,tempoConfidence:tempo.confidence,
      sections,levels:Array.from({length:Math.ceil(seconds)},(_,i) =>
        Math.round(Math.max(...levels.slice(i*10,Math.min(levels.length,(i+1)*10))) * 1000) / 1000),
      method:'本机音频特征分析：音量、频谱、音高类分布、段落变化与重复；功能标签为推测。'};
  }
  return {analyzePCM};
});
