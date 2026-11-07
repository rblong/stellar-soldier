import { RULES, clamp, type Simulation, type Enemy } from './simulation.ts';
import type { Assets } from './assets.ts';

export class Renderer {
  context: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  assets: Assets;
  fallback=false;
  constructor(canvas:HTMLCanvasElement,assets:Assets) {
    this.canvas=canvas;this.assets=assets;
    this.context=canvas.getContext('2d',{alpha:false})!;
    canvas.width=RULES.viewWidth;canvas.height=RULES.viewHeight;
  }

  draw(game:Simulation):void {
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
    const entities=[...game.enemies.map(e=>({y:e.y,draw:()=>this.enemy(e)})),{y:p.y,draw:()=>this.soldier(game)}];
    entities.sort((a,b)=>a.y-b.y).forEach(e=>e.draw());
    for(const b of game.bullets) {
      c.strokeStyle='#f9d99a';c.lineWidth=2;c.beginPath();c.moveTo(b.x-b.dx*17,b.y-b.dy*17);c.lineTo(b.x,b.y);c.stroke();
      c.fillStyle='#fff8d4';c.fillRect(b.x-1,b.y-1,2,2);
    }
    for(const e of game.effects.filter(e=>e.kind!=='death')) {
      c.save();c.translate(e.x,e.y);
      if(e.kind==='shot') {
        c.rotate(e.angle);
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
    const firing=game.effects.some(e=>e.kind==='shot'&&e.age<.07);
    // Visual offsets are derived, never accumulated on the logical position.
    const recoil=firing?-1.8:0, bob=p.moving?Math.sin(p.travel/7)*.8:0;
    c.save();c.translate(p.x,p.y);
    c.fillStyle='#00000070';c.beginPath();c.ellipse(2,9,16,7,0,0,Math.PI*2);c.fill();
    const directional=!this.fallback&&!this.assets.forceFallback?this.assets.images.get('sc-marine-directions'):null;
    const single=!this.fallback&&!this.assets.forceFallback?this.assets.images.get('sc-marine'):null;
    const frame=((Math.round((p.angle+Math.PI/2)*8/Math.PI)%16)+16)%16;
    if(directional) c.drawImage(directional,0,frame*96,96,96,-34+Math.cos(p.angle)*recoil,-38+bob+Math.sin(p.angle)*recoil,68,68);
    else if(single) {c.save();c.rotate(p.angle+Math.PI/2);c.drawImage(single,-32,-34,64,64);c.restore();}
    else {
      c.rotate(p.angle);
      c.fillStyle='#192a31';c.fillRect(-12,-10,23,20);
      c.fillStyle='#7196a1';c.fillRect(-10,-12,18,24);
      c.fillStyle='#a8c0c0';c.fillRect(-8,-8,17,16);
      c.fillStyle='#243b46';c.fillRect(-4,-6,11,12);
      c.fillStyle='#68e0e1';c.fillRect(5,-4,3,8);
      c.fillStyle='#546c73';c.fillRect(5+recoil,3,18,5);
      c.fillStyle='#111d24';c.fillRect(17+recoil,3,8,4);
      c.fillStyle='#d4c697';c.fillRect(-10,-13,7,5);c.fillRect(-10,8,7,5);
    }
    c.restore();
    if(game.time<game.protectedUntil) {
      c.strokeStyle='#f5c087';c.lineWidth=1.5;c.beginPath();c.arc(p.x,p.y,23,0,Math.PI*2);c.stroke();
    }
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
