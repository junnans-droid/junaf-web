(() => {
  'use strict';
  const {groups, profiles, generate} = window.JUNAFMusicStructure;
  const $ = selector => document.querySelector(selector);
  const state = {channel:'popular',style:groups.popular.styles[0],result:null,variant:0,signature:''};
  function button(label, selected, action, className) {
    const node = document.createElement('button');
    node.type='button';node.textContent=label;node.className=className;
    node.setAttribute('aria-pressed',String(selected));node.addEventListener('click',action);
    return node;
  }
  function renderInputs() {
    $('#channels').replaceChildren(...Object.entries(groups).map(([id,group]) => button(group.name,id===state.channel,() => {
      state.channel=id;state.style=group.styles[0];renderInputs();create();
    },'choice')));
    $('#styles').replaceChildren(...groups[state.channel].styles.map(id => button(profiles[id].label,id===state.style,() => {
      state.style=id;renderInputs();create();
    },'tag')));
    const profile=profiles[state.style];
    $('#genre-analysis').textContent=profile.analysis;
    $('#genre-harmony').textContent=profile.harmony;
    $('#genre-range').textContent=`参考速度 ${profile.bpm[0]}–${profile.bpm[1]} BPM · ${profile.meter}`;
    $('#genre-instruments').textContent=profile.instruments.join(' · ');
  }
  function textResult(result) {
    return [`JUNAF 音乐结构 / ${result.label}`,`建议速度：${result.bpm} BPM｜目标 ${result.duration} 秒｜${result.meter}`,
      `结构特点：${result.analysis}`,`和声思路：${result.harmony}`,`音色建议：${result.instruments.join('、')}`,
      `调性参考：${result.tonalPalette}`,'',...result.sections.map((item,index) =>
        `${String(index+1).padStart(2,'0')}. ${item.name}｜约 ${item.seconds} 秒｜${item.bars} 小节｜能量 ${item.energy}/5｜${item.focus}`),
      '',result.note].join('\n');
  }
  function renderResult() {
    const result=state.result;
    $('#result').hidden=false;$('#next').hidden=false;
    $('#variant').textContent=`VARIATION ${String(state.variant).padStart(2,'0')}`;
    $('#result-context').textContent=groups[result.channel].name.toUpperCase();
    $('#result-title').textContent=`${result.label} / 结构草案`;
    $('#summary').replaceChildren();
    for (const [label,value] of [['TEMPO',`${result.bpm} BPM`],['DURATION',`${result.duration} 秒`],
      ['METER',result.meter],['TONALITY',result.tonalPalette],['PALETTE',result.instruments.join(' · ')]]) {
      const card=document.createElement('div'),small=document.createElement('span'),strong=document.createElement('strong');
      small.textContent=label;strong.textContent=value;card.append(small,strong);$('#summary').append(card);
    }
    $('#timeline').replaceChildren(...result.sections.map(section => {
      const item=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('span');
      title.textContent=section.name;detail.textContent=`约 ${section.seconds} 秒 · ${section.bars} 小节 · ${section.focus}`;
      const meter=document.createElement('i'),track=document.createElement('div');
      meter.style.width=`${section.energy*20}%`;track.className='energy';track.append(meter);item.append(title,detail,track);return item;
    }));
    $('#note').textContent=result.note;
    $('#status').textContent=`已生成第 ${state.variant} 组结构`;
  }
  function create() {
    const input={channel:state.channel,style:state.style,duration:Number($('#duration').value),energy:$('#energy').value};
    const key=JSON.stringify(input);if(key!==state.signature)state.variant=0;state.signature=key;
    const previous=state.result&&JSON.stringify(state.result);let next;
    for(let attempt=0;attempt<8;attempt++){next=generate(input);if(JSON.stringify(next)!==previous)break;}
    state.result=next;state.variant++;renderResult();
  }
  $('#generate').addEventListener('click',create);$('#next').addEventListener('click',create);
  for(const field of ['#duration','#energy'])$(field).addEventListener('change',()=>{if(state.result)create();});
  $('#copy').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(textResult(state.result));$('#status').textContent='结构已复制';}
    catch{$('#status').textContent='复制失败，请检查浏览器权限';}
  });
  renderInputs();
})();
