(() => {
'use strict';
const tools = {"prompter": ["提词器", "输入或导入 TXT，设置字号、速度；MIDI 设备需在浏览器授权。", "滚动提词、键盘与 MIDI 控制；TXT 可导出。", "稿件与设置保存在当前浏览器。", "浏览器本地运行"], "music-structure": ["音乐结构", "选择曲风生成结构，或上传音频进行分析。", "结构草图与音频段落分析；自动分段需要人工核对。", "分析结果请及时复制；上传的音频不随参数草稿保存。", "浏览器本地分析"], "metronome": ["节拍器", "设置速度、拍号和声音，开始节拍后记录段落与灵感。", "节拍练习、段落标记和 TXT 记录。", "未登录保存在本机；登录后可同步到账号。", "浏览器本地运行"], "jianpu": ["旋律灵感", "分段录制单声部旋律，或直接输入音符。", "校对音高、和弦、歌词后试听；导出 TXT 或 SVG。", "未登录曲谱保存在本机，录音请及时下载；登录后可同步曲谱与录音。", "浏览器识别 · 云端保存"], "booking": ["档期工作台", "登录后建立预约、项目、联系人和任务。", "查看档期、跟进项目与收支。", "业务记录保存在当前登录账号。", "云端 CPU · 需要登录"], "yue2": ["音乐生成实验", "填写至少 8 字声音方向；歌曲模式需原创歌词，纯音乐可导入 ABC。", "生成音乐并试听、下载；效果需人工判断。", "任务保存在账号；下方可保存文字参数草稿，文件需重新选择。", "4090 有卡运行 · 以页面权限检查为准"], "rvc": ["音色实验", "进入中文工作台，上传自己的干净人声并训练音色。", "使用已训练模型转换音频，试听并下载。", "训练录音、模型在 4090 实例数据盘，请自行备份重要成果。", "4090 · 管理员测试；训练与转换需要有卡"], "writing-inspiration": ["思考结构", "填写主题并选择构建路径，把个人观察写入结构。", "可编辑的写作提纲；复制或导出 TXT。", "下方可保存本机文字草稿，不会自动发布文章。", "浏览器本地构思 · 结构模板"], "tts": ["文字转语音", "输入不超过 300 字的文字，选择声音与速度。", "生成后试听并下载 WAV。", "文字参数可存本机草稿；生成音频请及时下载。", "云端 CPU · 需要登录"], "audio-midi": ["音频转 MIDI", "登录后上传短音频，选择识别方案。", "分轨试听、音符编辑和 MIDI 导出；识别结果需要校对。", "项目同步到账号；导出 MIDI 可继续在音乐软件制作。", "4090 · 有卡生成"], "comfy": ["视觉实验", "上传参考图，选择动态描述、尺寸和时长；续接可使用上一段尾帧。", "短视频预览、MP4 下载；Loop 模式使用周期运动算法。", "任务保存在账号；参数草稿不包含参考图与续接关联。", "5090 实例 1 / 2 · 有卡 AI 生成 · 管理员测试"], "musetalk": ["数字人口播", "准备人物素材和语音；也可用文字与已保存声音生成语音。", "选择画面比例，生成口播视频并下载。", "任务与声音资料由服务端管理；本机草稿仅保存文案与比例。", "5090 · 有卡生成 · 管理员测试"]}, fields = {"writing-inspiration": ["topic", "genre", "tone", "outline"], "tts": ["tts-text", "tts-voice", "tts-speed"], "yue2": ["style", "lyrics"], "comfy": ["prompt", "size", "duration", "speed"], "musetalk": ["speech-text", "aspect"]};
const slug = location.pathname.split('/').filter(Boolean)[1], info = tools[slug];
const main = document.querySelector('main'); if (!info || !main) return;
const panel = document.createElement('details'); panel.className = 'junaf-workspace-guide';
const summary = document.createElement('summary'); summary.textContent = '使用与保存 · ' + info[0]; panel.append(summary);
const body = document.createElement('div'); panel.append(body);
['开始','得到什么','保存在哪里','运行条件'].forEach((label,i) => {const p=document.createElement('p');const b=document.createElement('strong');b.textContent=label+'：';p.append(b,document.createTextNode(info[i+1]));body.append(p);});
const back=document.createElement('a');back.href='/tools/';back.textContent='全部工具 ↗';body.append(back);
const ids=fields[slug];
if(ids){
 const key='junaf_workspace_draft_v1:'+slug;
 const note=document.createElement('p');note.textContent='本机草稿只保存此浏览器的文字与参数。共用电脑请使用后清除。';body.append(note);
 const status=document.createElement('p');status.setAttribute('role','status');
 const controls=document.createElement('div');controls.className='junaf-workspace-actions';body.append(controls,status);
 const read=()=>{try{const d=JSON.parse(localStorage.getItem(key)||'null');return d&&d.version===1&&d.values&&typeof d.values==='object'?d:null;}catch{return null;}};
 const existing=read();if(existing)status.textContent='有本机草稿 · '+new Date(existing.savedAt).toLocaleString();
 const action=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',fn);controls.append(b);};
 action('保存参数草稿',()=>{try{const values={};ids.forEach(id=>{const el=document.getElementById(id);if(el)values[id]=el.value;});localStorage.setItem(key,JSON.stringify({version:1,savedAt:Date.now(),values}));status.textContent='本机参数草稿已保存；音视频文件未包含在内。';}catch{status.textContent='浏览器无法保存，请复制或导出内容。';}});
 action('恢复参数草稿',()=>{const d=read();if(!d){status.textContent='没有可恢复的本机草稿。';return;}if(!confirm('恢复将替换当前文字和参数，是否继续？'))return;ids.forEach(id=>{const el=document.getElementById(id),value=d.values[id];if(!el||typeof value!=='string')return;if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===value))return;el.value=el.maxLength>0?value.slice(0,el.maxLength):value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});status.textContent='已恢复文字与参数。请重新选择文件，并核对当前生成方式后提交。';});
 action('清除本机草稿',()=>{if(!confirm('仅清除此工具的本机参数草稿，是否继续？'))return;try{localStorage.removeItem(key);status.textContent='本机草稿已清除。';}catch{status.textContent='清除失败，请检查浏览器存储设置。';}});
}
if(main.firstElementChild)main.firstElementChild.after(panel);else main.append(panel);
})();
