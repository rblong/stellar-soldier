import './style.css';
import { Simulation, RULES } from './game/simulation.ts';
import { Assets } from './game/assets.ts';
import { CombatAudio } from './game/audio.ts';
import { Renderer } from './game/renderer.ts';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <header class="masthead"><div class="brand"><span class="brand-mark">✦</span><div>星际孤兵<small>STELLAR SOLDIER</small></div></div><div class="build-tag"><span></span> 射击试验场 <b>PHASE 01</b></div></header>
  <main>
    <section class="telemetry" aria-label="战斗状态">
      <div class="vitals"><span class="label">生命体征 <b id="hp-text">120 / 120</b></span><div class="health-track"><div id="health"></div></div></div>
      <div class="readout"><span class="label">存活时间</span><strong id="time">00:00</strong></div>
      <div class="readout"><span class="label">击杀虫族</span><strong id="kills">000</strong></div>
      <div class="readout"><span class="label">威胁数量</span><strong id="enemies">00</strong></div>
      <button id="pause" class="quiet" disabled>暂停 <kbd>ESC</kbd></button>
    </section>
    <div class="screen">
      <canvas id="game" aria-label="机枪兵射击虫族的俯视战场"></canvas>
      <div class="field-label"><i></i> LIVE FEED <span>异星隔离区 / 07</span></div>
      <div class="weapon"><span class="label">M-07 / 机枪</span><strong>自动索敌 <b>∞</b></strong><small>实弹 · 无附加技能</small></div>
      <div id="overlay" class="overlay"><div class="dialog"><span id="eyebrow" class="eyebrow">孤兵作战 / 射击样片</span><h1 id="heading">活着，继续开火。</h1><p id="description">保持移动，让机枪替你说话。<br>跳虫正从视野外逼近。</p><div id="summary"></div><button id="primary" class="primary" disabled>正在准备战场…</button><span id="overlay-note" class="dialog-note">WASD 移动 · 自动射击 · ESC 暂停</span></div></div>
    </div>
    <section class="control-strip"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>移动</span><span class="divider"></span><span>射程内自动开火</span></div><span id="asset-status">资源准备中</span></section>
    <details class="settings"><summary>声音与画面设置 <span>SETTINGS</span></summary><div class="settings-grid"><label><input id="mute" type="checkbox"> 总静音</label><label>音效音量 <input id="volume" type="range" min="0" max="100" step="5" value="45"><output id="volume-label">45%</output></label><label><input id="fallback" type="checkbox"> 使用程序化单位</label><div class="settings-note">音乐：暂未接入 · 技能、等级、装备将在后续阶段开放</div></div><p id="audio-status">点击开始以启用音效</p></details>
  </main><footer><span>一个机枪兵。一片虫群。</span><span>独立生存原型 · v0.1</span></footer>`;

function element<T extends HTMLElement>(id:string):T {return document.getElementById(id) as T;}
const assets=new Assets(), audio=new CombatAudio();
const canvas=element<HTMLCanvasElement>('game'), renderer=new Renderer(canvas,assets);
canvas.tabIndex=0;
let game=new Simulation(), phase:'ready'|'playing'|'paused'|'dead'='ready';
const keys=new Set<string>();
const overlay=element('overlay'), primary=element<HTMLButtonElement>('primary'),pause=element<HTMLButtonElement>('pause');
const mute=element<HTMLInputElement>('mute'),volume=element<HTMLInputElement>('volume'),fallback=element<HTMLInputElement>('fallback');
mute.checked=audio.muted;volume.value=String(Math.round(audio.volume*100));
element('volume-label').textContent=`${volume.value}%`;
fallback.checked=assets.forceFallback;
fallback.disabled=assets.forceFallback;

function refresh():void {
  element('hp-text').textContent=`${game.player.hp} / ${RULES.hp}`;
  element('health').style.width=`${game.player.hp/RULES.hp*100}%`;
  element('health').classList.toggle('danger',game.player.hp<=32);
  const seconds=Math.floor(game.time);
  element('time').textContent=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
  element('kills').textContent=game.kills.toString().padStart(3,'0');
  element('enemies').textContent=game.enemies.length.toString().padStart(2,'0');
  element('audio-status').textContent=audio.muted?'总静音已开启':audio.status;
}

function setPaused(reason='战场已暂停'):void {
  if(phase!=='playing') return;
  phase='paused';game.paused=true;keys.clear();audio.stop();
  overlay.hidden=false;pause.textContent='继续 ESC';
  element('eyebrow').textContent='战术暂停 / SIMULATION HELD';
  element('heading').textContent=reason;
  element('description').textContent='子弹、虫群与战斗计时已冻结。';
  element('summary').textContent='';primary.textContent='继续战斗';
}

function resume():void {
  if(document.hidden) return;
  phase='playing';game.paused=false;keys.clear();overlay.hidden=true;pause.disabled=false;pause.textContent='暂停 ESC';
  canvas.focus({preventScroll:true});
  void audio.unlock(assets.localAudio);
}

primary.addEventListener('click',()=> {
  if(phase==='ready' || phase==='dead') {game=new Simulation();}
  resume();refresh();
});
pause.addEventListener('click',()=>phase==='playing'?setPaused():phase==='paused'?resume():undefined);
mute.addEventListener('change',()=>{audio.muted=mute.checked;audio.save();refresh();});
volume.addEventListener('input',()=>{audio.volume=Number(volume.value)/100;audio.save();element('volume-label').textContent=`${volume.value}%`;});
fallback.addEventListener('change',()=>{renderer.fallback=fallback.checked;assetLabel();});
function assetLabel():void {
  const marine=assets.images.has('sc-marine-directions')||assets.images.has('sc-marine');
  const zerg=assets.images.has('sc-enemy-zergling-walk')||assets.images.has('sc-enemy-zergling');
  element('asset-status').textContent=(renderer.fallback||assets.forceFallback)?'程序化单位 · 原创反馈':marine&&zerg?'本地机枪兵 / 虫族 · 原创反馈':marine||zerg?'混合资源 · 缺项已回退':'程序化单位 · 原创反馈';
}
window.addEventListener('keydown',event=> {
  if(event.key==='Escape' && !event.repeat) {phase==='playing'?setPaused():phase==='paused'?resume():undefined;return;}
  if(event.target instanceof HTMLElement && event.target.closest('input, button, summary')) return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(event.key)) event.preventDefault();
  if(phase==='playing') keys.add(event.key.toLowerCase());
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
window.addEventListener('blur',()=>{keys.clear();setPaused('已失焦，战斗暂停');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();setPaused('已离开页面，战斗暂停');}});

let previous=performance.now(), accumulator=0;
function frame(now:number):void {
  const delta=Math.min(.1,(now-previous)/1000);previous=now;
  if(phase==='playing') {
    accumulator+=delta;
    let steps=0;
    while(accumulator>=1/60 && steps++<6) {
      game.step(1/60,{
        x:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),
        y:Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup')),
      });
      for(const event of game.events) audio.play(event);
      accumulator-=1/60;
      if(game.dead) {
        phase='dead';keys.clear();audio.stop();overlay.hidden=false;pause.disabled=true;
        element('eyebrow').textContent='信号中断 / SOLDIER DOWN';
        element('heading').textContent='战斗结束。';
        element('description').textContent='你守住了这片战场，直到最后一刻。';
        element('summary').textContent=`存活 ${Math.floor(game.time)} 秒 / 击杀 ${game.kills} 只虫族 / 射击 ${game.shots} 发`;
        primary.textContent='重新出击';
        break;
      }
    }
  } else accumulator=0;
  renderer.draw(game);refresh();requestAnimationFrame(frame);
}
void assets.load().then(()=>{assetLabel();primary.disabled=false;primary.textContent='进入试验场';});
requestAnimationFrame(frame);

// Explicit dev-only verification surface. Production bundles expose no mutation API.
if(import.meta.env.DEV && new URLSearchParams(location.search).has('verify')) {
  const api={
    snapshot:()=>structuredClone({phase,player:game.player,time:game.time,kills:game.kills,shots:game.shots,enemies:game.enemies,bullets:game.bullets,effects:game.effects,camera:game.camera(),keys:[...keys],assets:[...assets.images.keys()],audio:{status:audio.status,buffers:[...audio.buffers.keys()],active:audio.active.size,muted:audio.muted,volume:audio.volume}}),
    scenario:(name:string)=> {
      game.autoSpawn=false;game.enemies=[];game.bullets=[];game.effects=[];
      game.player.x=1200;game.player.y=800;game.protectedUntil=0;game.shotAt=game.time;
      if(name==='target') game.addEnemy(1450,800);
      if(name==='hurt') {game.player.hp=120;game.addEnemy(1228,800);}
      if(name==='death') {game.player.hp=8;game.addEnemy(1228,800);}
      if(name==='crowd') for(let i=0;i<40;i++){const a=i*Math.PI*2/40;game.addEnemy(1200+Math.cos(a)*350,800+Math.sin(a)*280);}
      refresh();
    },
    pause:()=>setPaused(),
  };
  (window as unknown as {__verification:typeof api}).__verification=api;
}
