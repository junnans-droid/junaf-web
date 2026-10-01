importScripts('/tools/music-structure/audio-analysis.js');
self.onmessage = event => {
  try {
    const {samples,sampleRate} = event.data;
    const result = self.JUNAFAudioAnalysis.analyzePCM(new Float32Array(samples),sampleRate,
      progress => self.postMessage({type:'progress',progress}));
    self.postMessage({type:'result',result});
  } catch (error) {
    self.postMessage({type:'error',message:error.message || '分析失败'});
  }
};
