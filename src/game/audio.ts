import type { GameEvent } from './simulation.ts';

export class CombatAudio {
  context: AudioContext|null=null;
  gain: GainNode|null=null;
  buffers=new Map<string,AudioBuffer>();
  active=new Set<AudioScheduledSourceNode>();
  last=new Map<string,number>();
  muted=false;
  volume=.45;
  private loading=false;
  status='点击开始以启用音效';

  constructor() {
    try {
      const saved=JSON.parse(localStorage.getItem('stellar-soldier-settings')??'{}');
      if(typeof saved.muted==='boolean') this.muted=saved.muted;
      if(typeof saved.volume==='number' && Number.isFinite(saved.volume)) this.volume=Math.max(0,Math.min(1,saved.volume));
    } catch { /* Storage may be blocked. */ }
  }

  async unlock(localAudio:Set<string>):Promise<void> {
    try {
      this.context??=new AudioContext();
      if (!this.gain) {this.gain=this.context.createGain();this.gain.connect(this.context.destination);}
      this.apply();
      await this.context.resume();
      this.status='音效已启用';
      if (this.loading) return;
      this.loading=true;
      const entries=[['shot','rifle'],['hit','impact'],['death','impact'],['hurt','heavy']];
      await Promise.all(entries.map(async ([key,name])=> {
        const local=key==='shot'?'Marine.attack':key==='death'?'Zergling.death':null;
        const paths=[`${import.meta.env.BASE_URL}assets/combat/audio/${name}.wav`];
        if(local && localAudio.has(local)) paths.unshift(`${import.meta.env.BASE_URL}assets/sc-local/audio/${local}.wav`);
        for (const path of paths) {
          try {
            const response=await fetch(path,{signal:AbortSignal.timeout(2000)});
            if (!response.ok) continue;
            const buffer=await this.context!.decodeAudioData(await response.arrayBuffer());
            this.buffers.set(key,buffer);
            return;
          } catch { /* Try the original synthesized draft next. */ }
        }
      }));
    } catch {this.status='音频不可用，视觉反馈仍生效';}
  }

  save():void {
    this.apply();
    try {localStorage.setItem('stellar-soldier-settings',JSON.stringify({muted:this.muted,volume:this.volume}));} catch { /* Memory settings still work. */ }
  }
  private apply():void {
    if(this.gain) this.gain.gain.value=this.muted?0:this.volume*.65;
    if(this.muted || this.volume===0) this.stop();
  }
  stop():void {
    for(const source of this.active) {try{source.stop();}catch{ /* Already stopped. */ }}
    this.active.clear();
  }
  play(event:GameEvent):void {
    const context=this.context, gain=this.gain;
    if(!context || !gain || context.state!=='running' || this.muted || this.volume===0) return;
    const now=context.currentTime;
    const interval=event.kind==='death'?.12:event.kind==='shot'?.08:.06;
    if(now-(this.last.get(event.kind)??-Infinity)<interval || this.active.size>=12) return;
    this.last.set(event.kind,now);
    const buffer=this.buffers.get(event.kind);
    if(buffer) {
      const source=context.createBufferSource();
      source.buffer=buffer;source.connect(gain);this.active.add(source);
      source.onended=()=>this.active.delete(source);
      source.start(0,0,Math.min(buffer.duration,event.kind==='death'?.25:.13));
    } else {
      // Missing or undecodable files get a bounded, procedurally generated click.
      const oscillator=context.createOscillator(), envelope=context.createGain();
      oscillator.frequency.value=event.kind==='shot'?180:420;
      envelope.gain.setValueAtTime(.08,now);
      envelope.gain.exponentialRampToValueAtTime(.001,now+.05);
      oscillator.connect(envelope);envelope.connect(gain);
      this.active.add(oscillator);
      oscillator.onended=()=>this.active.delete(oscillator);
      oscillator.start();oscillator.stop(now+.05);
    }
  }
}
