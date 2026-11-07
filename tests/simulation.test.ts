import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, RULES, segmentHit } from '../src/game/simulation.ts';

function running():Simulation {
  const game=new Simulation(()=>.5);game.paused=false;game.autoSpawn=false;return game;
}
function advance(game:Simulation,seconds:number,input={x:0,y:0}):void {
  for(let i=0;i<Math.round(seconds*60);i++) game.step(1/60,input);
}

test('diagonal movement is normalized and map bounds clamp correctly',()=>{
  const axial=running(),diagonal=running();
  advance(axial,1,{x:1,y:0});advance(diagonal,1,{x:1,y:1});
  assert.ok(Math.abs(axial.player.x-1200-RULES.speed)<.001);
  assert.ok(Math.abs(Math.hypot(diagonal.player.x-1200,diagonal.player.y-800)-RULES.speed)<.001);
  advance(axial,20,{x:1,y:1});
  assert.equal(axial.player.x,RULES.width-18);assert.equal(axial.player.y,RULES.height-18);
});

test('fast segment collision catches tiny targets and uses the earliest surface hit',()=>{
  const a={x:0,y:0},b={x:100,y:0};
  assert.equal(segmentHit(a,b,{x:50,y:0},5),.45);
  assert.equal(segmentHit(a,b,{x:50,y:20},5),null);
  assert.equal(segmentHit(a,b,{x:0,y:0},5),0);
});

test('auto fire kills with two hits, never targets outside range or shoots without targets',()=>{
  const game=running();advance(game,1);assert.equal(game.shots,0);
  game.addEnemy(1800,800);game.step(1/60);assert.equal(game.shots,0);
  game.enemies=[];game.addEnemy(1450,800);advance(game,1);
  assert.equal(game.kills,1);assert.equal(game.enemies.length,0);assert.equal(game.shots,2);
});

test('one basic bullet only hits the nearest enemy on its trajectory',()=>{
  const game=running();game.shotAt=Infinity;
  const near=game.addEnemy(1240,800),far=game.addEnemy(1250,800);
  game.bullets=[{id:100,x:1200,y:800,dx:1,dy:0,left:460}];
  game.step(1/30);
  assert.equal(near.hp,12);assert.equal(far.hp,24);assert.equal(game.bullets.length,0);
});

test('contact protection prevents overlapping bugs dealing instant stacked damage',()=>{
  const game=running();game.shotAt=Infinity;
  for(let i=0;i<10;i++)game.addEnemy(1227,800);
  game.step(1/60);assert.equal(game.player.hp,112);
  advance(game,.4);assert.equal(game.player.hp,112);
  advance(game,1);assert.ok(game.player.hp>=96);
});

test('pause freezes player, enemy, bullets, effects and combat clock',()=>{
  const game=running();game.addEnemy(1450,800);game.step(1/60);game.paused=true;
  const snapshot=JSON.stringify({player:game.player,enemies:game.enemies,bullets:game.bullets,effects:game.effects,time:game.time});
  advance(game,2,{x:1,y:1});
  assert.equal(JSON.stringify({player:game.player,enemies:game.enemies,bullets:game.bullets,effects:game.effects,time:game.time}),snapshot);
});

test('fatal contact wins over firing, clears in-flight feedback and freezes after death',()=>{
  const game=running();game.player.hp=8;game.addEnemy(1227,800);
  game.bullets=[{id:99,x:1200,y:800,dx:1,dy:0,left:460}];
  game.step(1/60);
  assert.equal(game.dead,true);assert.equal(game.player.hp,0);assert.equal(game.shots,0);
  assert.equal(game.bullets.length,0);assert.equal(game.effects.length,0);
  const time=game.time;advance(game,1);assert.equal(game.time,time);
});

test('spawn locations stay outside the camera and inside finite world even at edges',()=>{
  const game=running();
  for(const [x,y] of [[1200,800],[18,18],[2382,1582],[18,1582],[2382,18]]) {
    game.player.x=x;game.player.y=y;
    for(let i=0;i<10;i++) {
      game.spawn();const e=game.enemies.at(-1)!;const camera=game.camera();
      assert.ok(e.x>=14&&e.y>=14&&e.x<=RULES.width-14&&e.y<=RULES.height-14);
      assert.ok(e.x<camera.x||e.x>camera.x+1280||e.y<camera.y||e.y>camera.y+720);
    }
  }
});

test('spawning respects population cap without queued burst and bullets expire at range',()=>{
  const game=running();game.autoSpawn=true;game.shotAt=Infinity;
  for(let i=0;i<60;i++)game.addEnemy(14,14);
  advance(game,1);assert.equal(game.enemies.length,60);
  game.enemies=[];game.bullets=[{id:999,x:1200,y:800,dx:1,dy:0,left:20}];
  advance(game,.1);assert.equal(game.bullets.length,0);
});

test('continuous firing never changes logical position or accumulates recoil offset',()=>{
  const game=running();
  for(let i=0;i<1000;i++) {
    if(!game.enemies.length)game.addEnemy(1450,800);
    game.step(1/60);
  }
  assert.equal(game.player.x,1200);assert.equal(game.player.y,800);assert.ok(game.shots>30);
});

test('new run starts clean independently of previous death and state',()=>{
  const old=running();old.player.hp=8;old.addEnemy(1227,800);old.step(1/60);
  const fresh=new Simulation();
  assert.equal(fresh.dead,false);assert.equal(fresh.paused,true);assert.equal(fresh.time,0);
  assert.equal(fresh.kills,0);assert.equal(fresh.shots,0);assert.equal(fresh.player.hp,120);
  assert.deepEqual([fresh.enemies.length,fresh.bullets.length,fresh.effects.length],[0,0,0]);
});
