import { FOOTSTEP_DISTANCE, muzzleOffset } from './motion.ts';

export const RULES = {
  width: 2400, height: 1600, viewWidth: 1280, viewHeight: 720,
  hp: 120, speed: 220, damage: 12, shotsPerSecond: 5, range: 460,
  bulletSpeed: 1000, enemyHp: 24, enemySpeed: 110, enemyDamage: 8,
  enemyLimit: 60, spawnRate: 1.5,
} as const;

export type Point = { x: number; y: number };
export type Enemy = Point & { id: number; hp: number; angle: number; travel: number; attackAt: number; flash: number };
export type Bullet = Point & { id: number; dx: number; dy: number; left: number };
export type Effect = Point & { kind: 'shot' | 'hit' | 'death' | 'hurt' | 'step'; age: number; angle: number };
export type GameEvent = { kind: Effect['kind']; x: number; y: number };
export type Input = Point;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Earliest entry into a circle along the segment; used for fast projectile hits. */
export function segmentHit(a: Point, b: Point, center: Point, radius: number): number | null {
  const dx = b.x-a.x, dy = b.y-a.y, ox = a.x-center.x, oy = a.y-center.y;
  const c = ox*ox+oy*oy-radius*radius;
  if (c <= 0) return 0;
  const length2 = dx*dx+dy*dy;
  if (!length2) return null;
  const linear = 2*(ox*dx+oy*dy);
  const disc = linear*linear-4*length2*c;
  if (disc < 0) return null;
  const t = (-linear-Math.sqrt(disc))/(2*length2);
  return t >= 0 && t <= 1 ? t : null;
}

export class Simulation {
  player = { x: RULES.width/2 as number, y: RULES.height/2 as number, hp: RULES.hp as number,
    angle: 0, moveAngle:0, travel:0, stride:0, stepDistance:0, foot:0, moving:false,
    lastShotAt:-Infinity, hurtAt:-Infinity };
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  effects: Effect[] = [];
  events: GameEvent[] = [];
  time = 0;
  kills = 0;
  shots = 0;
  paused = true;
  dead = false;
  autoSpawn = true;
  testMode = false;
  invulnerable = false;
  shotAt = 0;
  protectedUntil = 0;
  spawnAt = 0.5;
  nextId = 1;
  private random: () => number;

  constructor(random = Math.random) { this.random = random; }

  addTestEnemies(count:number):number {
    if(this.paused||this.dead||!Number.isInteger(count)||count<1||count>300)return 0;
    this.testMode=true;this.autoSpawn=false;
    const amount=Math.min(count,300-this.enemies.length);
    for(let i=0;i<amount;i++) {
      const angle=(i+this.enemies.length*.618)*2.399963;
      const radius=250+(i%5)*58;
      this.addEnemy(this.player.x+Math.cos(angle)*radius,this.player.y+Math.sin(angle)*radius);
    }
    return amount;
  }
  clearTestEnemies():void {
    this.enemies=[];this.bullets=[];
    this.effects=this.effects.filter(e=>e.kind==='step');
  }
  restoreNaturalSpawning():void {
    this.clearTestEnemies();this.testMode=false;this.invulnerable=false;this.autoSpawn=true;this.spawnAt=this.time+.5;
  }

  camera(): Point {
    return {
      x: clamp(this.player.x-RULES.viewWidth/2, 0, RULES.width-RULES.viewWidth),
      y: clamp(this.player.y-RULES.viewHeight/2, 0, RULES.height-RULES.viewHeight),
    };
  }

  addEnemy(x: number, y: number): Enemy {
    const e = { x: clamp(x, 14, RULES.width-14), y: clamp(y, 14, RULES.height-14), id: this.nextId++, hp: RULES.enemyHp, angle: 0, travel: 0, attackAt: 0, flash: 0 };
    this.enemies.push(e);
    return e;
  }

  spawn(): void {
    const camera = this.camera();
    // Four offscreen strips, clipped to the finite world. Never spawn in-view.
    const candidates: Point[] = [];
    for (let i=0; i<16; i++) {
      const side = Math.floor(this.random()*4);
      const p = side < 2
        ? { x: camera.x+(side===0 ? -50 : RULES.viewWidth+50), y: camera.y+this.random()*RULES.viewHeight }
        : { x: camera.x+this.random()*RULES.viewWidth, y: camera.y+(side===2 ? -50 : RULES.viewHeight+50) };
      if (p.x>=14 && p.x<=RULES.width-14 && p.y>=14 && p.y<=RULES.height-14) candidates.push(p);
    }
    // Deterministic fallback makes spawning reliable even for pathological RNG.
    const options = candidates.length ? candidates : [
      {x:camera.x-50,y:this.player.y}, {x:camera.x+RULES.viewWidth+50,y:this.player.y},
      {x:this.player.x,y:camera.y-50}, {x:this.player.x,y:camera.y+RULES.viewHeight+50},
    ].filter(p=>p.x>=14&&p.x<=RULES.width-14&&p.y>=14&&p.y<=RULES.height-14);
    if (options[0]) this.addEnemy(options[0].x, options[0].y);
  }

  private emit(kind: Effect['kind'], x: number, y: number, angle = 0): void {
    this.events.push({kind,x,y});
    this.effects.push({kind,x,y,age:0,angle});
    if (this.effects.length>96) this.effects.shift();
  }

  private separateEnemies(dt:number):void {
    const cellSize=32;
    for(let pass=0;pass<2;pass++) {
      const grid=new Map<string,Enemy[]>();
      for(const e of this.enemies){const key=`${Math.floor(e.x/cellSize)},${Math.floor(e.y/cellSize)}`;const list=grid.get(key)??[];list.push(e);grid.set(key,list);}
      const moves:{e:Enemy;x:number;y:number}[]=[];
      for(const e of this.enemies){
        let pushX=0,pushY=0;const cx=Math.floor(e.x/cellSize),cy=Math.floor(e.y/cellSize);
        for(let iy=-1;iy<=1;iy++)for(let ix=-1;ix<=1;ix++)for(const other of grid.get(`${cx+ix},${cy+iy}`)??[]){
          if(other.id===e.id)continue;
          let dx=e.x-other.x,dy=e.y-other.y,d=Math.hypot(dx,dy);
          if(d>=20)continue;
          if(d<.001){const a=Math.min(e.id,other.id)*2.399963+Math.max(e.id,other.id);dx=Math.cos(a)*(e.id<other.id?1:-1);dy=Math.sin(a)*(e.id<other.id?1:-1);d=1;}
          pushX+=dx/d*(20-d)*.5;pushY+=dy/d*(20-d)*.5;
        }
        const length=Math.hypot(pushX,pushY),scale=length?Math.min(1,90*dt/length):0;
        moves.push({e,x:pushX*scale,y:pushY*scale});
      }
      for(const {e,x,y} of moves){e.x=clamp(e.x+x,14,RULES.width-14);e.y=clamp(e.y+y,14,RULES.height-14);e.travel+=Math.hypot(x,y);}
    }
  }

  step(dt: number, input: Input = {x:0,y:0}): void {
    this.events = [];
    if (this.paused || this.dead || dt<=0) return;
    dt = Math.min(dt, 1/30);
    this.time += dt;
    const p = this.player;
    const length = Math.hypot(input.x,input.y);
    const before = {x:p.x,y:p.y};
    if (length) {
      p.x = clamp(p.x+input.x/length*RULES.speed*dt,18,RULES.width-18);
      p.y = clamp(p.y+input.y/length*RULES.speed*dt,18,RULES.height-18);
      p.moveAngle = Math.atan2(input.y,input.x);
    }
    const distance = Math.hypot(p.x-before.x,p.y-before.y);
    p.travel += distance;
    p.moving = distance>0;
    p.stride=distance>0?p.stride+distance:0;
    p.stepDistance=distance>0?p.stepDistance+distance:0;
    if(p.stepDistance>=FOOTSTEP_DISTANCE) {
      p.stepDistance%=FOOTSTEP_DISTANCE;p.foot=1-p.foot;
      const side=p.foot?1:-1;
      this.emit('step',p.x-Math.sin(p.moveAngle)*side*6,p.y+10+Math.cos(p.moveAngle)*side*3,p.moveAngle);
    }
    this.effects = this.effects.filter(e=>(e.age+=dt)<(e.kind==='death' ? .45 : e.kind==='shot' ? .09 : .25));

    for (const e of this.enemies) {
      const dx=p.x-e.x,dy=p.y-e.y,dist=Math.hypot(dx,dy);
      e.angle=Math.atan2(dy,dx);
      const movement=Math.min(Math.max(0,dist-27),RULES.enemySpeed*dt);
      if (dist) { e.x+=dx/dist*movement; e.y+=dy/dist*movement; }
      e.travel+=movement;
      e.flash=Math.max(0,e.flash-dt);
      if (Math.hypot(p.x-e.x,p.y-e.y)<=30 && this.time>=e.attackAt) {
        e.attackAt=this.time+1;
        if (this.time>=this.protectedUntil && !this.invulnerable) {
          p.hp=Math.max(0,p.hp-RULES.enemyDamage);
          p.hurtAt=this.time;
          this.protectedUntil=this.time+.5;
          this.emit('hurt',p.x,p.y);
          if (p.hp===0) {
            this.dead=true;
            p.moving=false;p.stride=0;p.stepDistance=0;
            this.bullets=[];
            this.effects=[];
            return; // Death wins over shooting and all remaining events this tick.
          }
        }
      }
    }

    this.separateEnemies(dt);
    const target=this.enemies.reduce<Enemy|null>((best,e)=> {
        const d=Math.hypot(e.x-p.x,e.y-p.y);
        return d<=RULES.range && (!best || d<Math.hypot(best.x-p.x,best.y-p.y)) ? e : best;
    },null);
    if(target)p.angle=Math.atan2(target.y-p.y,target.x-p.x);
    else if(p.moving)p.angle=p.moveAngle;
    if (this.time>=this.shotAt && target) {
        const muzzle=muzzleOffset(p.angle,-1.8);
        const origin={x:p.x+muzzle.x,y:p.y+muzzle.y};
        const angle=Math.atan2(target.y-origin.y,target.x-origin.x);
        const dx=Math.cos(angle),dy=Math.sin(angle);
        this.bullets.push({id:this.nextId++,x:origin.x,y:origin.y,dx,dy,left:RULES.range-Math.hypot(muzzle.x,muzzle.y)});
        this.shots++;
        p.lastShotAt=this.time;
        this.shotAt=this.time+1/RULES.shotsPerSecond;
        this.emit('shot',origin.x,origin.y,p.angle);
    }

    const surviving: Bullet[]=[];
    for (const bullet of this.bullets) {
      const distance=Math.min(bullet.left,RULES.bulletSpeed*dt);
      const end={x:bullet.x+bullet.dx*distance,y:bullet.y+bullet.dy*distance};
      let target:Enemy|null=null, first=Infinity;
      for (const e of this.enemies) {
        if (e.hp<=0) continue;
        const t=segmentHit(bullet,end,e,17);
        if (t!==null && t<first) {target=e;first=t;}
      }
      if (target) {
        target.hp-=RULES.damage;
        target.flash=.065;
        this.emit('hit',bullet.x+(end.x-bullet.x)*first,bullet.y+(end.y-bullet.y)*first,Math.atan2(bullet.dy,bullet.dx));
        if (target.hp<=0) {this.kills++;this.emit('death',target.x,target.y,target.angle);}
      } else {
        bullet.x=end.x;bullet.y=end.y;bullet.left-=distance;
        if (bullet.left>0) surviving.push(bullet);
      }
    }
    this.bullets=surviving;
    this.enemies=this.enemies.filter(e=>e.hp>0);
    if (this.autoSpawn && this.time>=this.spawnAt) {
      this.spawnAt=this.time+1/RULES.spawnRate;
      if (this.enemies.length<RULES.enemyLimit) this.spawn();
    }
  }
}
