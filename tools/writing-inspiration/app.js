(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('idea-form'), topic = $('topic'), path = $('genre'), tone = $('tone');
  const outline = $('outline'), status = $('status');
  const paths = {
    observation: {name:'感知与观察',variants:[
      ['一个具体的声音、画面或动作','为什么这个细节让你停下来','换一个地点或时间再次观察','把零散感受连成一条线索','让读者重新看见最初的细节'],
      ['一次与预期不同的感受','你原本怎样理解它','寻找另一位观察者的视角','并置两种经验，找出关系','保留差异，而非急于给出结论'],
      ['一个常被忽略的日常场景','它隐藏了什么问题','记录三个可核实的细节','从细节中建立新的观察顺序','回到此刻，说出理解如何变化']
    ]},
    question: {name:'问题与推演',variants:[
      ['与你有关的一处矛盾','把矛盾写成一个明确的问题','尝试两种不同解释','用事实和反例检验判断','给出目前能成立的回答与边界'],
      ['一个被反复说起的观点','它默认了什么前提','寻找一个支持与一个反对的例子','指出例子之间真正的分歧','留下值得继续讨论的问题'],
      ['一次没有答案的经历','你最想弄清楚什么','拆开问题里的不同层次','建立一条由浅入深的推演','说明还缺少哪些证据']
    ]},
    practice: {name:'实验与构建',variants:[
      ['创作从哪个感受开始','你想解决怎样的表达问题','记录一次尝试与一次失败','说明最后选择了什么形式以及原因','作品如何邀请他人进入'],
      ['作品中最先出现的材料','材料带来了什么限制','比较两个被舍弃的方案','展示选择如何改变作品结构','写下仍未完成的可能'],
      ['一次偶然发现','它改变了哪个原有设想','进行一项小型实验','把结果组织成可被感知的形式','描述下一次实验的方向']
    ]},
    narrative: {name:'作品与叙事',variants:[
      ['一个人物、空间或物件','它承载着什么未说出口的问题','安排一次关系或视角的变化','让变化通过行动与细节显现','把结尾交给读者的感受'],
      ['故事结束后的一个画面','此前发生了怎样的选择','倒回关键时刻重新观察','找出使选择成立的关系','让开头的画面获得新意义'],
      ['一个反复出现的意象','它第一次出现时意味着什么','在不同场景中改变它的作用','将场景连成清晰的节奏','让最后一次出现形成回应']
    ]}
  };
  const toneHints = {
    clear:'减少抽象判断，用事实、动作和可核实的细节推进。',
    poetic:'让声音、光线或空间成为贯穿全文的感知线索。',
    questioning:'每一节提出一个更准确的问题，不急于给出完整答案。'
  };
  const stageNames = ['感知','提问','实验','构建','呈现'];
  let variant = -1, lastGenerated = '';
  function generate(advance) {
    const subject = topic.value.trim();
    if (!subject) { topic.focus(); status.textContent = '先写下一个主题。'; return; }
    if (lastGenerated && outline.value !== lastGenerated && !confirm('当前草图已修改。生成新结构会覆盖它，是否继续？')) return;
    const selected = paths[path.value];
    variant = advance ? (variant + 1) % selected.variants.length : 0;
    const prompts = selected.variants[variant];
    lastGenerated = [
      `主题｜${subject}`,
      `JUNAF 路径｜${selected.name}`,
      '',
      ...prompts.flatMap((prompt,index) => [
        `${String(index + 1).padStart(2,'0')} / ${stageNames[index]}`,
        `${prompt}。这一部分你亲眼看到、亲身经历或能够核实的内容是什么？`,
        ''
      ]),
      '继续追问',
      '· 哪个细节只能由你来写？',
      '· 哪一种关系值得被重新看见？',
      '· 还有哪些事实需要核对？',
      '',
      `文字提示｜${toneHints[tone.value]}`
    ].join('\n');
    outline.value = lastGenerated;
    status.textContent = '结构已生成；请把自己的观察和判断写进去。';
  }
  form.addEventListener('submit', event => {event.preventDefault();generate(false)});
  $('next').addEventListener('click', () => generate(true));
  $('copy').addEventListener('click', async () => {
    if (!outline.value.trim()) return void (status.textContent='先生成或写下结构。');
    try { await navigator.clipboard.writeText(outline.value); status.textContent='已复制结构。'; }
    catch { outline.focus(); outline.select(); status.textContent='无法自动复制，已选中文本，请手动复制。'; }
  });
  $('download').addEventListener('click', () => {
    if (!outline.value.trim()) return void (status.textContent='先生成或写下结构。');
    const blob = new Blob(['\ufeff',outline.value],{type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href=url; link.download='JUNAF-思考结构.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url),30000);
    status.textContent='TXT 已下载。';
  });
})();
