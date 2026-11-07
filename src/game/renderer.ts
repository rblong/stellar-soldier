import { RULES, clamp, type Simulation, type Enemy } from './simulation.ts';
import type { Assets } from './assets.ts';
import { directionFrame, walkFrame, marineCell, muzzleOffset, MARINE_DRAW, WALK_CYCLE } from './motion.ts';

export class Renderer {
  context: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  assets: Assets;
  fallback=false;
  deathAge=0;
  constructor(canvas:HTMLCanvasElement,assets:Assets) {
    this.canvas=canvas;this.assets=assets;
    this.context=canvas.getContext('2d',{alpha:false})!;
    canvas.width=RULES.viewWidth;canvas.height=RULES.viewHeight;
  }

  unitPreview(game:Simulation):string {
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const previous=this.context;
    try {
      this.context=canvas.getContext('2d')!;this.context.imageSmoothingEnabled=false;
      this.context.translate(64-game.player.x,70-game.player.y);
      this.soldier(game);
      return canvas.toDataURL('image/png');
    } finally {this.context=previous;}
  }

  draw(game:Simulation,presentationDelta=0):void {
    this.deathAge=game.dead?Math.min(.7,this.deathAge+presentationDelta):0;
    const c=this.context, camera=game.camera(), p=game.player;
    c.imageSmoothingEnabled=false;
    c.fillStyle='#252b24';c.fillRect(0,0,1280,720);
    c.save();c.translate(-camera.x,-camera.y);
    this.ground(camera.x,camera.y);
    // Map edges and training perimeter. All scenery is decorative, no hidden collision.
    c.strokeStyle='#8e8a57';c.lineWidth=3;c.strokeRect(10,10,RULES.width-20,RULES.height-20);
    c.strokeStyle='#383f31';c.lineWidth=12;
    c.strokeRect(880,520,640,560);
    c.strokeStyle='#707356';c.lineWidth=1;c.setLineDash([12,14]);c.strokeRect(900,540,600,520);c.setLineDash([]);
    c.save();c.translate(1200,800);c.rotate(-.12);
    c.font='bold 68px monospace';c.fillStyle='#55583c';c.textAlign='center';c.fillText('SECTOR 07',0,-160);
    c.font='16px monospace';c.fillStyle='#787853';c.fillText('ISOLATION / FIRING RANGE',0,-124);c.restore();
    for(const [x,y] of [[280,260],[2040,370],[460,1310],[1920,1260]]) this.debris(x,y);

    for(const effect of game.effects.filter(e=>e.kind==='death')) {
      c.save();c.globalAlpha=(1-effect.age/.45)*.8;c.translate(effect.x,effect.y);
      c.fillStyle='#8c9e43';
      for(let n=0;n<7;n++) {const a=n*2.4;c.fillRect(Math.cos(a)*(7+effect.age*36),Math.sin(a)*(7+effect.age*36),3,2);}
      c.restore();
    }
    for(const effect of game.effects.filter(e=>e.kind==='step')) {
      c.save();c.translate(effect.x,effect.y);c.globalAlpha=(1-effect.age/.25)*.3;c.fillStyle='#aba786';
      for(let i=0;i<3;i++){c.beginPath();c.ellipse(i*3-3,-effect.age*10+i,1+effect.age*9,1+effect.age*4,0,0,Math.PI*2);c.fill();}
      c.restore();
    }
    const entities=[...game.enemies.map(e=>({y:e.y,draw:()=>this.enemy(e)})),{y:p.y,draw:()=>this.soldier(game)}];
    entities.sort((a,b)=>a.y-b.y).forEach(e=>e.draw());
    for(const b of game.bullets) {
      c.strokeStyle='#f9d99a';c.lineWidth=2;c.beginPath();c.moveTo(b.x-b.dx*17,b.y-b.dy*17);c.lineTo(b.x,b.y);c.stroke();
      c.fillStyle='#fff8d4';c.fillRect(b.x-1,b.y-1,2,2);
    }
    for(const e of game.effects.filter(e=>e.kind!=='death'&&e.kind!=='step')) {
      c.save();
      const muzzle=muzzleOffset(p.angle,-1.8*Math.max(0,1-(game.time-p.lastShotAt)/.07));
      c.translate(e.kind==='shot'?p.x+muzzle.x:e.x,e.kind==='shot'?p.y+muzzle.y:e.y);
      if(e.kind==='shot') {
        c.rotate(p.angle);
        const image=this.assets.images.get('muzzle-flash');
        if(image) c.drawImage(image,Math.min(3,Math.floor(e.age*40))*32,0,32,32,-8,-16,32,32);
        else {c.fillStyle='#fff0bb';c.beginPath();c.moveTo(0,-4);c.lineTo(16,0);c.lineTo(0,4);c.fill();}
      } else if(e.kind==='hit') {
        const image=this.assets.images.get('impact-kinetic');
        if(image) c.drawImage(image,Math.min(7,Math.floor(e.age*32))*64,0,64,64,-24,-24,48,48);
        else {c.strokeStyle='#ffd28a';c.beginPath();c.moveTo(-6,-6);c.lineTo(6,6);c.moveTo(6,-6);c.lineTo(-6,6);c.stroke();}
      } else {
        c.strokeStyle=`rgba(255,110,70,${1-e.age/.25})`;c.lineWidth=2;
        c.beginPath();c.arc(0,0,26+e.age*40,0,Math.PI*2);c.stroke();
      }
      c.restore();
    }
    c.restore();
    const vignette=c.createRadialGradient(640,360,220,640,360,750);
    vignette.addColorStop(0,'#00000000');vignette.addColorStop(1,'#050b0b80');
    c.fillStyle=vignette;c.fillRect(0,0,1280,720);
    this.minimap(game);
    if(!game.dead) {
      c.save();c.translate(p.x-camera.x,p.y-camera.y);
      c.strokeStyle='#e1c17a60';c.lineWidth=1;
      c.beginPath();c.arc(0,0,25,0,Math.PI*2);c.stroke();
      c.strokeStyle='#e9d08f';c.lineWidth=2;c.beginPath();c.moveTo(-5,-49);c.lineTo(0,-45);c.lineTo(5,-49);c.stroke();
      c.restore();
    }
  }

  private ground(cameraX:number,cameraY:number):void {
    const c=this.context;
    for(let y=Math.floor(cameraY/80)*80;y<cameraY+800;y+=80) {
      for(let x=Math.floor(cameraX/80)*80;x<cameraX+1360;x+=80) {
        const seed=Math.abs(Math.sin(x*12.1+y*4.7));
        c.fillStyle=seed>.6?'#293025':seed>.3?'#2c3026':'#272d24';c.fillRect(x,y,80,80);
        c.strokeStyle='#20271f';c.lineWidth=1;c.beginPath();c.moveTo(x+10,y+seed*50);c.lineTo(x+28,y+seed*50+7);c.lineTo(x+48,y+seed*50+3);c.stroke();
        c.fillStyle='#454934';
        for(let i=0;i<6;i++) c.fillRect(x+(seed*723+i*23)%78,y+(seed*521+i*19)%78,2,1);
      }
    }
  }
  private debris(x:number,y:number):void {
    const c=this.context;
    c.fillStyle='#101b18';c.fillRect(x-16,y-9,69,41);
    c.fillStyle='#4b534a';c.fillRect(x-20,y-16,60,34);
    c.strokeStyle='#7d8060';c.lineWidth=2;c.strokeRect(x-20,y-16,60,34);
    c.fillStyle='#323e37';c.fillRect(x-10,y-10,12,22);c.fillRect(x+12,y-10,12,22);
    c.fillStyle='#a8a16b';c.fillRect(x+29,y-9,4,5);
  }

  private soldier(game:Simulation):void {
    const c=this.context,p=game.player;
    const shotAge=game.time-p.lastShotAt;
    const recoil=-1.8*Math.max(0,1-shotAge/.07);
    const motion=!this.fallback&&!this.assets.forceFallback?this.assets.images.get('sc-marine-motion'):null;
    c.save();c.translate(p.x,p.y);
    c.fillStyle='#00000070';c.beginPath();c.ellipse(2,9,16,7,0,0,Math.PI*2);c.fill();
    if(game.dead && motion) {
      const frame=Math.min(7,Math.floor(this.deathAge/.075));
      c.globalAlpha=1-Math.max(0,this.deathAge-.45)*1.5;
      c.drawImage(motion,frame*64,832,64,64,-64,-78,128,128);
    } else if(motion) {
      const direction=directionFrame(p.angle),legDirection=directionFrame(p.moving?p.moveAngle:p.angle);
      const legs=marineCell(legDirection,p.moving?4+walkFrame(p.stride,true):0);
      const upper=marineCell(direction,shotAge<.065?2:shotAge<.18?1:0);
      const {x,y,split,overlap}=MARINE_DRAW;
      // Stable two-layer body: gait follows velocity; shoulders and rifle follow aim.
      c.drawImage(motion,legs.x,legs.y+split,44,44-split,x,y+split*2,88,(44-split)*2);
      c.drawImage(motion,upper.x,upper.y,44,split+overlap,x+Math.cos(p.angle)*recoil,y+Math.sin(p.angle)*recoil,88,(split+overlap)*2);
    } else {
      this.proceduralSoldier(game,recoil);
    }
    c.restore();
    if(!game.dead && game.time-p.hurtAt<.09) {
      c.fillStyle=`rgba(255,220,173,${(1-(game.time-p.hurtAt)/.09)*.5})`;
      c.beginPath();c.ellipse(p.x,p.y-18,13,17,0,0,Math.PI*2);c.fill();
    }
    if(!game.dead && game.time<game.protectedUntil) {
      c.strokeStyle='#f5c087';c.lineWidth=1.5;c.beginPath();c.arc(p.x,p.y,23,0,Math.PI*2);c.stroke();
    }
  }

  private proceduralSoldier(game:Simulation,recoil:number):void {
    const c=this.context,p=game.player;
    if(game.dead){c.rotate(Math.min(1,this.deathAge/.35)*1.4);c.scale(1,1-Math.min(1,this.deathAge/.35)*.5);c.globalAlpha=.8;}
    const angle=p.moving?p.moveAngle:p.angle,phase=p.stride/WALK_CYCLE*Math.PI*2;
    const forward={x:Math.cos(angle),y:Math.sin(angle)},side={x:-forward.y,y:forward.x};
    c.lineCap='round';
    for(const leg of [-1,1]) {
      const stride=p.moving?Math.sin(phase+(leg===1?0:Math.PI))*9:0;
      const hip={x:side.x*leg*5,y:-5+side.y*leg*5};
      const foot={x:side.x*leg*6+forward.x*stride,y:11+side.y*leg*4+forward.y*stride};
      c.strokeStyle='#30424a';c.lineWidth=7;c.beginPath();c.moveTo(hip.x,hip.y);c.lineTo(foot.x,foot.y);c.stroke();
      c.fillStyle='#91a5a0';c.beginPath();c.ellipse(foot.x,foot.y,5,3,angle,0,Math.PI*2);c.fill();
      c.strokeStyle='#718684';c.lineWidth=3;c.beginPath();c.moveTo(hip.x,hip.y+1);c.lineTo((hip.x+foot.x)/2,(hip.y+foot.y)/2);c.stroke();
    }
    c.save();c.translate(Math.cos(p.angle)*recoil,-17+Math.sin(p.angle)*recoil);c.rotate(p.angle);
    c.fillStyle='#20353d';c.fillRect(-12,-12,21,24);
    c.fillStyle='#7497a0';c.fillRect(-10,-11,19,22);
    c.fillStyle='#b1c4be';c.fillRect(-10,-15,8,7);c.fillRect(-10,8,8,7);
    c.fillStyle='#223e48';c.beginPath();c.ellipse(0,0,7,8,0,0,Math.PI*2);c.fill();
    c.fillStyle='#6bd7d9';c.fillRect(4,-5,3,10);
    c.restore();
    const muzzle=muzzleOffset(p.angle,recoil);
    const hand={x:Math.cos(p.angle)*5-Math.sin(p.angle)*6,y:-17+Math.sin(p.angle)*5+Math.cos(p.angle)*6};
    c.strokeStyle='#23353a';c.lineWidth=7;c.beginPath();c.moveTo(hand.x,hand.y);c.lineTo(muzzle.x,muzzle.y);c.stroke();
    c.strokeStyle='#99a49b';c.lineWidth=3;c.beginPath();c.moveTo(hand.x,hand.y-1);c.lineTo(muzzle.x,muzzle.y-1);c.stroke();
  }

  private enemy(e:Enemy):void {
    const c=this.context;
    c.save();c.translate(e.x,e.y);
    c.fillStyle='#00000065';c.beginPath();c.ellipse(2,7,16,6,0,0,Math.PI*2);c.fill();
    const sheet=!this.fallback&&!this.assets.forceFallback?this.assets.images.get('sc-enemy-zergling-walk'):null;
    const single=!this.fallback&&!this.assets.forceFallback?this.assets.images.get('sc-enemy-zergling'):null;
    if(sheet) {
      const dir=((Math.round((e.angle+Math.PI/2)*8/Math.PI)%16)+16)%16;
      c.drawImage(sheet,(Math.floor(e.travel/4)%7)*96,dir*96,96,96,-31,-35,62,62);
    } else if(single) {c.save();c.rotate(e.angle+Math.PI/2);c.drawImage(single,-28,-30,56,56);c.restore();}
    else {
      c.save();c.rotate(e.angle);c.strokeStyle='#9e8d61';c.lineWidth=2;
      for(let i=-1;i<=1;i++) for(const side of [-1,1]) {const swing=Math.sin(e.travel/5+i)*3;c.beginPath();c.moveTo(i*6,side*4);c.lineTo(i*7-5,side*(13+swing));c.lineTo(i*7+3,side*(17+swing));c.stroke();}
      c.fillStyle=e.flash>0?'#f8f0c7':'#726b47';c.beginPath();c.ellipse(-2,0,13,8,0,0,Math.PI*2);c.fill();
      c.fillStyle='#b18e5c';c.beginPath();c.ellipse(8,0,7,6,0,0,Math.PI*2);c.fill();
      c.strokeStyle='#dfcda2';c.beginPath();c.moveTo(10,-5);c.lineTo(18,-9);c.moveTo(10,5);c.lineTo(18,9);c.stroke();
      c.fillStyle='#df8a51';c.fillRect(10,-3,2,2);c.fillRect(10,2,2,2);c.restore();
    }
    if(e.flash>0) {c.globalAlpha=e.flash/.065*.65;c.fillStyle='#fff4ce';c.beginPath();c.ellipse(0,0,12,8,e.angle,0,Math.PI*2);c.fill();c.globalAlpha=1;}
    if(e.hp<RULES.enemyHp) {c.fillStyle='#141e19';c.fillRect(-13,-24,26,3);c.fillStyle='#bcb76c';c.fillRect(-13,-24,26*e.hp/RULES.enemyHp,3);}
    c.restore();
  }

  private minimap(game:Simulation):void {
    const c=this.context,x=1108,y=560,w=144,h=96;
    c.fillStyle='#101b18d9';c.fillRect(x-10,y-24,w+20,h+34);
    c.strokeStyle='#74806a';c.lineWidth=1;c.strokeRect(x,y,w,h);
    c.font='10px monospace';c.fillStyle='#c4c5a4';c.fillText('SECTOR / 07',x,y-9);
    const camera=game.camera();
    c.strokeStyle='#8d9c7d';c.strokeRect(x+camera.x/RULES.width*w,y+camera.y/RULES.height*h,RULES.viewWidth/RULES.width*w,RULES.viewHeight/RULES.height*h);
    c.fillStyle='#d78663';
    for(const e of game.enemies) c.fillRect(x+clamp(e.x/RULES.width,0,1)*w-1,y+e.y/RULES.height*h-1,2,2);
    c.fillStyle='#f1ce80';c.beginPath();c.arc(x+game.player.x/RULES.width*w,y+game.player.y/RULES.height*h,3,0,Math.PI*2);c.fill();
  }
}
