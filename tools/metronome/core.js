(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JUNAFMetronomeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const meters = Object.freeze({'2/4':2,'3/4':3,'4/4':4,'5/4':5,'6/8':6});
  const sounds = Object.freeze({wood:'木质敲击',digital:'电子短音',rim:'边鼓敲击',soft:'柔和音槌',shaker:'沙锤'});
  const styles = Object.freeze({straight:'基础直拍',swing:'摇摆 Swing',rock:'摇滚 Rock',house:'浩室 House',funk:'放克 Funk',latin:'拉丁 Latin',hiphop:'嘻哈 Hip-Hop',ambient:'氛围 Ambient'});
  function tempo(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1000, Math.round(number))) : 0;
  }
  function meterCount(meter) { return meters[meter] || 4; }
  function position(beatNumber, meter) {
    const count = meterCount(meter), beat = Math.max(0, Math.floor(Number(beatNumber) || 0));
    return {bar: beat ? Math.floor((beat - 1) / count) + 1 : 0,
      beat: beat ? ((beat - 1) % count) + 1 : 0};
  }
  function isAccent(beatNumber, meter) {
    const pos = position(beatNumber, meter);
    return pos.beat === 1 || (meter === '6/8' && pos.beat === 4);
  }
  function styleEvents(style, beatNumber, meter, bpm) {
    const count = meterCount(meter), beat = position(beatNumber, meter).beat || 1;
    const events = [];
    if (style === 'straight') return events;
    if (style === 'ambient') {
      if (beat === 1) events.push({voice:'pad',offset:0,level:.12});
      return events;
    }
    if (style === 'rock' || style === 'hiphop') {
      if (beat === 1 || beat === 3) events.push({voice:'kick',offset:0,level:.22});
      if (beat === 2 || beat === 4) events.push({voice:'snare',offset:0,level:.14});
      if (bpm <= 240) events.push({voice:'hat',offset:.5,level:.07});
    } else if (style === 'house') {
      events.push({voice:'kick',offset:0,level:.19});
      if (bpm <= 240) events.push({voice:'hat',offset:.5,level:.08});
    } else if (style === 'funk') {
      if (beat === 1 || beat === 3) events.push({voice:'kick',offset:0,level:.2});
      if (beat === 2 || beat === 4) events.push({voice:'snare',offset:0,level:.13});
      if (bpm <= 240) events.push({voice:'hat',offset:beat % 2 ? .75 : .5,level:.08});
    } else if (style === 'latin') {
      if (beat === 1 || beat === 3 || (count === 6 && beat === 4)) events.push({voice:'clave',offset:0,level:.16});
      if (bpm <= 240 && beat % 2 === 0) events.push({voice:'hat',offset:.5,level:.06});
    } else if (style === 'swing') {
      if (bpm <= 240) events.push({voice:'hat',offset:2/3,level:.09});
      else if (beat % 2 === 0) events.push({voice:'hat',offset:0,level:.06});
    }
    return events;
  }
  return {meters,sounds,styles,tempo,meterCount,position,isAccent,styleEvents};
});
