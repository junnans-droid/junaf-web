(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JUNAFMusicStructure = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Curated creative presets. These are arrangements to explore, not fixed genre definitions.
  const groups = Object.freeze({
    popular: {name: '流行与摇滚', styles: ['pop', 'indie-pop', 'rock', 'indie-rock', 'punk', 'metal', 'folk', 'country']},
    electronic: {name: '电子与舞曲', styles: ['house', 'techno', 'trance', 'dnb', 'dubstep', 'ambient', 'synthwave', 'disco']},
    groove: {name: '嘻哈与律动', styles: ['hip-hop', 'trap', 'rnb', 'soul', 'funk', 'reggae', 'dancehall']},
    jazz: {name: '爵士与世界', styles: ['jazz', 'blues', 'bossa-nova', 'latin-pop', 'afrobeats', 'gospel']},
    score: {name: '古典与配乐', styles: ['classical', 'orchestral', 'film-score', 'new-age']}
  });
  const profileRows = [
    ['pop','流行 Pop','song',88,124,'4/4','清晰主歌与记忆点副歌','常用重复和弦，靠旋律与层次形成变化','鼓组','贝斯','键盘'],
    ['indie-pop','独立流行 Indie Pop','song',82,118,'4/4','保留音色个性与段落留白','可用短动机和微妙和声变化','吉他','合成器','轻鼓组'],
    ['rock','摇滚 Rock','song',90,140,'4/4','吉他推动，副歌扩大动态','重复 riff 与和弦对比','电吉他','鼓组','贝斯'],
    ['indie-rock','独立摇滚 Indie Rock','song',90,136,'4/4','在主歌克制与副歌释放之间建立张力','riff 与反复音型驱动','电吉他','鼓组','贝斯'],
    ['punk','朋克 Punk','song',150,200,'4/4','短段落、快速进入主题','少量和弦，高重复度','失真吉他','快速鼓组','贝斯'],
    ['metal','金属 Metal','song',90,180,'4/4','重 riff、停顿和强烈段落反差','重音节奏与调式色彩','失真吉他','重鼓组','贝斯'],
    ['folk','民谣 Folk','song',72,112,'4/4','叙事型主歌，编制逐步扩展','开放和弦与自然旋律','原声吉他','轻打击','人声'],
    ['country','乡村 Country','song',80,132,'4/4','故事性主歌与易记副歌','清晰和弦进行与句尾回应','原声吉他','钢弦吉他','贝斯'],
    ['house','浩室 House','loop',118,130,'4/4','四拍底鼓、循环叠层与段落收放','短和弦循环与滤波变化','四拍鼓组','贝斯合成器','和弦合成器'],
    ['techno','科技舞曲 Techno','loop',120,140,'4/4','重复律动和渐变音色构成推进','少和声变化，重纹理与节奏','电子鼓','低频合成器','质感音效'],
    ['trance','迷幻舞曲 Trance','loop',128,145,'4/4','长铺垫、breakdown 与高潮释放','延展和弦和上行张力','琶音合成器','铺底合成器','四拍鼓组'],
    ['dnb','鼓打贝斯 Drum & Bass','loop',160,180,'4/4','切分鼓与低音对话','短动机循环，快速节奏变化','碎拍鼓组','次低音','音色切片'],
    ['dubstep','回响贝斯 Dubstep','loop',130,150,'4/4','半拍感与 drop 对比','低音音色变化胜过复杂和声','半拍鼓组','调制贝斯','冲击音效'],
    ['ambient','氛围 Ambient','ambient',55,90,'4/4','缓慢渐变和宽阔空间','持续音、少和声或开放式调性','氛围铺底','环境纹理','稀疏音点'],
    ['synthwave','合成器浪潮 Synthwave','loop',82,118,'4/4','复古合成音色与稳定脉冲','重复和弦和旋律动机','模拟合成器','电子鼓','合成贝斯'],
    ['disco','迪斯科 Disco','loop',108,126,'4/4','四拍律动、活跃贝斯和明亮层次','循环和弦与乐器回应','四拍鼓组','弹性贝斯','节奏吉他'],
    ['hip-hop','嘻哈 Hip-Hop','beat',75,105,'4/4','节拍、采样或音色循环承载主歌','短循环与节奏变化','鼓机','贝斯','键盘采样'],
    ['trap','陷阱说唱 Trap','beat',130,160,'4/4','半拍律动、808 与快速踩镲','稀疏和声与低频空间','808 贝斯','踩镲','氛围合成器'],
    ['rnb','节奏布鲁斯 R&B','song',65,105,'4/4','人声律动与细致层次','延伸和弦与和声转位','电钢琴','柔和鼓组','贝斯'],
    ['soul','灵魂乐 Soul','song',70,120,'4/4','人声情绪和乐队互动','蓝调语汇与丰富和声','钢琴','鼓组','贝斯'],
    ['funk','放克 Funk','groove',95,125,'4/4','切分节奏比和弦变化更重要','短和弦与节奏重音','弹性贝斯','节奏吉他','鼓组'],
    ['reggae','雷鬼 Reggae','groove',70,100,'4/4','反拍和宽松低频','简洁循环和弦','反拍吉他','贝斯','鼓组'],
    ['dancehall','舞厅雷鬼 Dancehall','groove',90,115,'4/4','稀疏节拍与人声律动','节奏型循环为主','鼓机','次低音','短句合成器'],
    ['jazz','爵士 Jazz','jazz',80,160,'4/4','主题、即兴与主题回归','扩展和弦与即兴空间','钢琴','低音提琴','鼓组'],
    ['blues','布鲁斯 Blues','jazz',70,125,'4/4','反复主题与器乐回应','十二小节等循环形式可作为起点','电吉他','贝斯','鼓组'],
    ['bossa-nova','巴萨诺瓦 Bossa Nova','jazz',90,140,'4/4','轻柔切分与旋律流动','爵士和声与持续律动','尼龙弦吉他','轻打击','贝斯'],
    ['latin-pop','拉丁流行 Latin Pop','song',90,130,'4/4','打击乐推动副歌','节奏分层与易记动机','拉丁打击乐','贝斯','吉他'],
    ['afrobeats','非洲流行 Afrobeats','groove',90,120,'4/4','多层切分与循环律动','简短和弦，乐器彼此错位','打击乐','贝斯','吉他'],
    ['gospel','福音音乐 Gospel','song',70,120,'4/4','人声应答与渐进式高潮','丰富和声与动态提升','钢琴','合唱','鼓组'],
    ['classical','古典 Classical','score',60,140,'4/4','动机发展而非固定流行段落','调性与对位由作品目标决定','钢琴','弦乐','木管'],
    ['orchestral','管弦 Orchestral','score',65,140,'4/4','主题在声部间传递并扩大配器','动机变奏与和声张力','弦乐','铜管','木管'],
    ['film-score','影视配乐 Film Score','score',60,130,'4/4','服务画面节奏与情绪转折','主题动机与配器变化','弦乐','钢琴','氛围音色'],
    ['new-age','新世纪 New Age','ambient',60,100,'4/4','平缓旋律与空间层次','开放和弦与缓慢变奏','钢琴','合成铺底','环境纹理']
  ];
  const profiles = Object.fromEntries(profileRows.map(([id,label,form,min,max,meter,analysis,harmony,...instruments]) =>
    [id,{id,label,form,bpm:[min,max],meter,analysis,harmony,instruments}]));
  const forms = {
    song: [['前奏','主歌一','预副歌','副歌','主歌二','副歌变化','尾奏'],['前奏','主歌','副歌','间奏','主歌变化','桥段','终副歌','尾奏'],['引子','主歌','预副歌','副歌','桥段','终副歌','尾奏']],
    loop: [['引子','律动建立','主题进入','推进','间歇','高潮 / Drop','尾声'],['引子','节奏叠层','主段 A','Breakdown','主段 B','释放','尾声'],['序奏','主题 A','变化 A′','留白','主题回归','尾声']],
    beat: [['引子','主歌一','Hook','主歌二','Hook 变化','尾声'],['引子','主歌','副歌','间奏','主歌变化','终副歌','尾声']],
    groove: [['引子','核心律动','主题 A','回应段','主题变化','收束'],['引子','主歌','Hook','器乐段','主歌变化','Hook','尾声']],
    jazz: [['引子','主题 Head','即兴一','即兴二','主题回归','尾声'],['引子','主题 A','主题 B','即兴','主题回归','尾声']],
    ambient: [['静入','纹理建立','音色展开','转折','缓慢回归','消散'],['引子','主题浮现','层次增加','留白','主题变奏','尾声']],
    score: [['动机呈示','发展','对比','再现','收束'],['引子','主题 A','主题 B','发展','高潮','尾声']]
  };
  const palettes = ['C 大调 / A 小调','G 大调 / E 小调','D 大调 / B 小调','F 大调 / D 小调','E♭ 大调 / C 小调'];
  const pick = (array, random) => array[Math.floor(random() * array.length)];
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  function generate(input, random = Math.random) {
    const channel = groups[input.channel] ? input.channel : 'popular';
    const style = groups[channel].styles.includes(input.style) ? input.style : groups[channel].styles[0];
    const profile = profiles[style];
    const duration = [90,150,210].includes(Number(input.duration)) ? Number(input.duration) : 150;
    const energy = ['low','medium','high'].includes(input.energy) ? input.energy : 'medium';
    const bpm = Math.round((profile.bpm[0] + random() * (profile.bpm[1] - profile.bpm[0])) / 2) * 2;
    const names = pick(forms[profile.form], random);
    const weights = names.map(name => /引子|前奏|序奏|静入|尾声|尾奏|消散/.test(name) ? .65 : /高潮|Drop|终副歌|副歌/.test(name) ? 1.2 : 1);
    const total = weights.reduce((a,b) => a+b,0);
    let remaining = duration;
    const sections = names.map((name,i) => {
      const seconds = i === names.length-1 ? remaining : Math.max(8,Math.round(duration*weights[i]/total));
      remaining -= seconds;
      const arc = [1,2,3,2,4,1][Math.round(i*5/Math.max(1,names.length-1))];
      const level = clamp(arc + {low:-1,medium:0,high:1}[energy],1,5);
      return {name,seconds,bars:Math.max(4,Math.round(seconds*bpm/240/4)*4),energy:level,
        focus: level>=4?'层次与动态推进':level<=2?'留白与主题铺陈':'主题或节奏变化'};
    });
    return {channel,style,label:profile.label,duration,bpm,meter:profile.meter,tonalPalette:pick(palettes,random),energy,
      analysis:profile.analysis,harmony:profile.harmony,instruments:[...profile.instruments],sections,
      note:'结构草案，不是曲风的固定公式。BPM、时长和小节数均为创作起点，实际作品可自由打破。'};
  }
  return {groups,profiles,generate};
});
