(() => {
  'use strict';
  const core = window.JUNAFMetronomeCore;
  class MetronomeAudio {
    constructor(onBeat) {
      this.onBeat = onBeat;
      this.context = null;
      this.timer = null;
      this.frame = null;
      this.queue = [];
      this.config = null;
    }
    async start(config, playedBeats) {
      if (this.context) this.stop();
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw Error('此浏览器不支持 Web Audio 节拍播放');
      const context = new Context();
      this.context = context;
      await context.resume();
      this.config = {...config};
      this.master = context.createGain();
      this.master.gain.value = Math.max(0,Math.min(1,config.volume / 100));
      this.master.connect(context.destination);
      this.noiseBuffer = context.createBuffer(1,Math.ceil(context.sampleRate * .35),context.sampleRate);
      const noise = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
      this.nextTime = context.currentTime + .045;
      this.nextBeat = playedBeats + 1;
      this.queue = [];
      this.timer = setInterval(() => this.schedule(),20);
      this.schedule();
      const visual = () => {
        if (!this.context) return;
        const now = this.context.currentTime;
        while (this.queue.length && this.queue[0].time <= now) {
          const item = this.queue.shift();
          this.onBeat(item.beat);
        }
        this.frame = requestAnimationFrame(visual);
      };
      this.frame = requestAnimationFrame(visual);
    }
    stop() {
      if (this.timer) clearInterval(this.timer);
      if (this.frame) cancelAnimationFrame(this.frame);
      this.timer = null;this.frame = null;this.queue = [];
      const context = this.context;
      this.context = null;
      if (context) context.close().catch(() => {});
    }
    update(config) {
      this.config = {...config};
      if (this.context && this.master) this.master.gain.setTargetAtTime(config.volume / 100,
        this.context?.currentTime || 0,.015);
    }
    tone(time,frequency,seconds,level,type='sine',endFrequency=frequency) {
      const ctx = this.context;
      if (!ctx) return;
      const oscillator = ctx.createOscillator(),gain = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency,time);
      if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1,endFrequency),time+seconds);
      gain.gain.setValueAtTime(Math.max(.001,level),time);
      gain.gain.exponentialRampToValueAtTime(.001,time+seconds);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(time);oscillator.stop(time+seconds+.005);
    }
    noise(time,seconds,level,filterType='highpass',frequency=1600) {
      const ctx = this.context;
      if (!ctx) return;
      const source = ctx.createBufferSource(),filter = ctx.createBiquadFilter(),gain = ctx.createGain();
      source.buffer = this.noiseBuffer;
      filter.type = filterType;filter.frequency.value = frequency;
      gain.gain.setValueAtTime(Math.max(.001,level),time);
      gain.gain.exponentialRampToValueAtTime(.001,time+seconds);
      source.connect(filter).connect(gain).connect(this.master);
      source.start(time);source.stop(time+seconds+.005);
    }
    click(time,accent) {
      const level = accent ? .28 : .17;
      switch (this.config.sound) {
        case 'digital': this.tone(time,accent ? 1420 : 980,.045,level,'sine');break;
        case 'rim': this.noise(time,.028,level,'bandpass',accent ? 2300 : 1700);break;
        case 'soft': this.tone(time,accent ? 740 : 520,.11,level*.85,'sine',accent ? 540 : 390);break;
        case 'shaker': this.noise(time,.05,level*.8,'highpass',4200);break;
        default: this.tone(time,accent ? 880 : 660,.055,level,'triangle',accent ? 620 : 470);
      }
    }
    voice(event,time) {
      switch (event.voice) {
        case 'kick': this.tone(time,125,.12,event.level,'sine',45);break;
        case 'snare': this.noise(time,.085,event.level,'highpass',850);break;
        case 'hat': this.noise(time,.035,event.level,'highpass',4800);break;
        case 'clave': this.tone(time,1300,.025,event.level,'triangle',1050);break;
        case 'pad': this.tone(time,330,.25,event.level,'sine',300);break;
      }
    }
    schedule() {
      const ctx = this.context,config = this.config;
      if (!ctx || !config || config.bpm <= 0) return;
      const interval = 60 / config.bpm;
      if (this.nextTime < ctx.currentTime - .2) this.nextTime = ctx.currentTime + .025;
      let scheduled = 0;
      while (this.nextTime < ctx.currentTime + .14 && scheduled++ < 16) {
        const beat = this.nextBeat,at = this.nextTime;
        this.click(at,core.isAccent(beat,config.meter));
        for (const event of core.styleEvents(config.style,beat,config.meter,config.bpm))
          this.voice(event,at + event.offset * interval);
        this.queue.push({beat,time:at});
        this.nextBeat += 1;this.nextTime += interval;
      }
    }
  }
  window.JUNAFMetronomeAudio = MetronomeAudio;
})();
