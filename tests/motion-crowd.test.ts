import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation.ts';
import { walkFrame, WALK_CYCLE, FOOTSTEP_DISTANCE, muzzleOffset, marineCell } from '../src/game/motion.ts';

function running(){const g=new Simulation();g.paused=false;g.autoSpawn=false;return g;}
function advance(g:Simulation,n:number,input={x:0,y:0}){for(let i=0;i<n;i++)g.step(1/60,input);}

test('gait progresses by real distance; diagonal speed matches; stopping and boundaries plant feet',()=>{
  const g=running(),diagonal=running();
  advance(g,10,{x:1,y:0});advance(diagonal,10,{x:1,y:1});
  assert.ok(Math.abs(g.player.stride-diagonal.player.stride)<.001);
  assert.ok(walkFrame(g.player.stride,true)>0);
  g.step(1/60);assert.equal(g.player.moving,false);assert.equal(g.player.stride,0);
  g.player.x=2382;g.step(1/60,{x:1,y:0});assert.equal(g.player.moving,false);
  assert.equal(walkFrame(999,false),0);assert.equal(walkFrame(WALK_CYCLE,true),0);
});
test('moving and firing retain independent movement direction and gait',()=>{
  const g=running();g.addEnemy(1450,800).hp=100000;
  advance(g,20,{x:0,y:-1});
  assert.equal(g.player.moveAngle,-Math.PI/2);assert.ok(g.player.angle>-.5);
  assert.ok(g.player.stride>0);assert.ok(g.shots>=2);
  const body=g.player.angle;g.paused=true;advance(g,10,{x:1,y:1});assert.equal(g.player.angle,body);
});
test('footsteps come from traveled distance and stop on pause or no movement',()=>{
  const g=running();let steps=0;
  for(let i=0;i<60;i++){g.step(1/60,{x:1,y:0});steps+=g.events.filter(e=>e.kind==='step').length;}
  assert.equal(steps,Math.floor(220/FOOTSTEP_DISTANCE));
  g.step(1/60);assert.ok(!g.events.some(e=>e.kind==='step'));
  g.paused=true;g.step(1/60,{x:1,y:0});assert.deepEqual(g.events,[]);
});
test('all 16 atlas directions and 9 walk cells are in bounds; muzzle table is finite',()=>{
  for(let direction=0;direction<16;direction++)for(let step=0;step<9;step++){
    const cell=marineCell(direction,4+step);assert.ok(cell.x>=0&&cell.y>=0&&cell.x+44<=1152&&cell.y+44<=896);
    const muzzle=muzzleOffset(direction*Math.PI/8-Math.PI/2);assert.ok(Number.isFinite(muzzle.x)&&Number.isFinite(muzzle.y));
  }
});
test('count controls reject invalid input, cap at 300, and freeze additions on pause/death',()=>{
  const g=running();for(const n of [0,-1,1.5,NaN,301])assert.equal(g.addTestEnemies(n),0);
  assert.equal(g.addTestEnemies(50),50);assert.equal(g.autoSpawn,false);assert.equal(g.testMode,true);
  assert.equal(g.addTestEnemies(300),250);assert.equal(g.enemies.length,300);assert.equal(g.addTestEnemies(10),0);
  g.paused=true;assert.equal(g.addTestEnemies(1),0);g.paused=false;g.dead=true;assert.equal(g.addTestEnemies(1),0);
});
test('clear does not credit kills; protection and restoring natural settings are explicit',()=>{
  const g=running();g.addTestEnemies(30);g.invulnerable=true;
  g.enemies=[];g.addEnemy(1227,800);g.step(1/60);assert.equal(g.player.hp,120);
  g.clearTestEnemies();assert.equal(g.kills,0);assert.equal(g.enemies.length,0);
  g.restoreNaturalSpawning();assert.equal(g.testMode,false);assert.equal(g.invulnerable,false);assert.equal(g.autoSpawn,true);
  advance(g,40);assert.ok(g.enemies.length>0);
});
test('dense overlapping bugs separate without pushing the player or crediting kills',()=>{
  const g=running();g.shotAt=Infinity;g.invulnerable=true;
  for(let i=0;i<20;i++)g.addEnemy(1300,800);
  advance(g,60);
  assert.ok(new Set(g.enemies.map(e=>`${e.x.toFixed(1)},${e.y.toFixed(1)}`)).size>10);
  assert.equal(g.player.x,1200);assert.equal(g.player.y,800);assert.equal(g.kills,0);
});
