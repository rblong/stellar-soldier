import { chromium } from 'playwright';
import { existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import os from 'node:os';

const base=process.env.VERIFY_URL??'http://127.0.0.1:5180';
let executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if(!executablePath&&!existsSync(chromium.executablePath())&&process.platform==='win32') {
  const cache=join(process.env.LOCALAPPDATA??'','ms-playwright');
  if(existsSync(cache))for(const dir of readdirSync(cache).filter(n=>/^chromium-\d+$/.test(n)).reverse()){
    const path=join(cache,dir,'chrome-win64/chrome.exe');if(existsSync(path)){executablePath=path;break;}
  }
}
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1160},deviceScaleFactor:1});
const errors=[];context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
mkdirSync('artifacts/screenshots',{recursive:true});
const report={date:'2026-11-07',browser:browser.version(),cpu:os.cpus()[0]?.model,viewport:'1440x1160 DPR1',checks:[],limitations:['Headless functional/visual sampling; not speaker listening or human feel review','Basic rifle only; not full five-skill performance acceptance']};
const record=(name,data={})=>{report.checks.push({name,passed:true,...data});console.log(`PASS ${name}`);};
const snapshot=page=>page.evaluate(()=>window.__verification.snapshot());
const scenario=(page,name)=>page.evaluate(name=>window.__verification.scenario(name),name);
async function ready(suffix='',routeSetup) {
  const page=await context.newPage();if(routeSetup)await routeSetup(page);
  await page.goto(`${base}/?verify=1${suffix}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!document.querySelector('#primary').disabled);
  await page.locator('#primary').click();await scenario(page,'empty');return page;
}
async function sampleGait(page,key='s') {
  const samples=[];
  await page.locator('#game').focus();await page.keyboard.down(key);
  for(let i=0;i<12;i++) {
    await page.waitForTimeout(40);
    const sample=await page.evaluate(async()=>{
      const state=window.__verification.snapshot(),data=window.__verification.unitPreview();
      const image=new Image();image.src=data;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
      const c=canvas.getContext('2d');c.drawImage(image,0,0);
      return {state:{walkFrame:state.pose.walkFrame,legDirection:state.pose.legDirection,bodyDirection:state.pose.bodyDirection},data,feet:[...c.getImageData(28,64,72,32).data]};
    });
    sample.feetHash=createHash('sha256').update(Buffer.from(sample.feet)).digest('hex');delete sample.feet;samples.push(sample);
  }
  await page.keyboard.up(key);
  assert.ok(new Set(samples.map(s=>s.feetHash)).size>=3,'Feet pixels must actually change, not only a metadata counter');
  assert.ok(new Set(samples.map(s=>s.state.walkFrame)).size>=4);
  return samples;
}
try {
  const page=await ready();
  assert.ok((await snapshot(page)).assets.includes('sc-marine-motion'));
  const samples=await sampleGait(page);
  record('local 9-frame gait changes actual isolated foot pixels',{uniqueFeet:new Set(samples.map(s=>s.feetHash)).size,frames:[...new Set(samples.map(s=>s.state.walkFrame))]});
  // Create a local-only contact sheet from the actual rendered unit, never shipped.
  const sheet=await page.evaluate(async data=>{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=290;
    const c=canvas.getContext('2d');c.fillStyle='#17201c';c.fillRect(0,0,768,290);c.imageSmoothingEnabled=false;
    for(let i=0;i<data.length;i++){
      const image=new Image();image.src=data[i].data;await image.decode();const x=i%6*128,y=Math.floor(i/6)*145;
      c.drawImage(image,x,y);c.fillStyle='#c9c9ae';c.font='11px monospace';c.fillText(`walk ${data[i].state.walkFrame}`,x+30,y+137);
    }
    return canvas.toDataURL('image/png');
  },samples);
  writeFileSync('artifacts/screenshots/local-motion-contact.png',Buffer.from(sheet.split(',')[1],'base64'));
  await page.waitForTimeout(80);let state=await snapshot(page);
  assert.equal(state.player.moving,false);assert.equal(state.pose.walkFrame,0);record('release plants feet instead of sliding or continuing gait');
  for(const [x,y]of [['w',null],['a',null],['d',null],['w','a'],['w','d'],['s','a'],['s','d']]) {
    await page.keyboard.down(x);if(y)await page.keyboard.down(y);await page.waitForTimeout(180);
    state=await snapshot(page);assert.equal(state.player.moving,true);
    await page.keyboard.up(x);if(y)await page.keyboard.up(y);
  }
  record('eight-direction keyboard gait and turning execute');
  await scenario(page,'motion-target');
  const movingShots=await sampleGait(page,'w');
  assert.ok(movingShots.some(s=>s.state.bodyDirection!==s.state.legDirection));
  state=await snapshot(page);assert.ok(state.shots>0);record('strafe fire keeps leg movement independent of aiming shoulders');
  await page.keyboard.down('d');await page.waitForTimeout(130);await page.keyboard.press('Escape');
  const frozen=await snapshot(page), frozenImage=await page.evaluate(()=>window.__verification.unitPreview());
  await page.waitForTimeout(220);
  assert.deepEqual((await snapshot(page)).pose,frozen.pose);
  assert.equal(await page.evaluate(()=>window.__verification.unitPreview()),frozenImage);
  await page.keyboard.up('d');record('pause freezes actual rendered gait and shooting pose');
  assert.ok(await page.locator('#crowd-add').isDisabled());
  await page.locator('#primary').click();await scenario(page,'empty');
  await page.locator('#test-protection').check();
  await page.locator('#crowd-count').fill('30');await page.locator('#crowd-add').click();
  state=await snapshot(page);assert.ok(state.enemies.length>=29&&state.enemies.length<=30);assert.equal(state.autoSpawn,false);assert.equal(state.testMode,true);
  await page.locator('#crowd-fifty').click();state=await snapshot(page);assert.ok(state.enemies.length>=77&&state.enemies.length<=80);
  await page.locator('#crowd-count').fill('300');await page.locator('#crowd-add').click();
  state=await snapshot(page);assert.ok(state.enemies.length>=298&&state.enemies.length<=300);
  record('visible controls add chosen quantity and +50; 300 cap enforced',{count:state.enemies.length});
  const start=performance.now(),counts=[],fps=[];
  for(let i=0;i<20;i++) {
    await page.waitForTimeout(500);state=await snapshot(page);counts.push(state.enemies.length);if(state.fps>0)fps.push(state.fps);
    assert.equal(state.player.hp,120);assert.equal(state.phase,'playing');
  }
  report.pressure={durationSeconds:(performance.now()-start)/1000,initialCount:300,minCount:Math.min(...counts),maxCount:Math.max(...counts),fpsMean:fps.reduce((a,b)=>a+b,0)/fps.length,fpsMin:Math.min(...fps),testProtection:true,source:'Natural damage/kills enabled; population may decrease; rAF samples from visible UI',skills:0};
  assert.ok(report.pressure.fpsMean>0);record('10-second dense basic-rifle scene remains interactive with explicit protection',report.pressure);
  await page.screenshot({path:'artifacts/screenshots/local-motion-crowd.png',fullPage:true});
  await page.keyboard.press('Escape');
  const kills=(await snapshot(page)).kills;await page.locator('#crowd-clear').click();state=await snapshot(page);assert.equal(state.enemies.length,0);assert.equal(state.kills,kills);
  await page.locator('#crowd-restore').click();state=await snapshot(page);assert.equal(state.testMode,false);assert.equal(state.invulnerable,false);assert.equal(state.autoSpawn,true);
  record('clear gives no kills; restore disables protection and restores natural spawning');
  await page.locator('#primary').click();
  await scenario(page,'empty');
  for(const invalid of ['0','1.5','301']) {
    await page.locator('#crowd-count').fill(invalid);await page.locator('#crowd-add').click();
    assert.equal((await snapshot(page)).enemies.length,0);
    assert.match(await page.locator('#crowd-message').textContent(),/1–300/);
  }
  record('number input refuses zero, fractions and values above the cap');
  for(let i=0;i<3;i++) {
    await scenario(page,'death');await page.waitForFunction(()=>window.__verification.snapshot().phase==='dead');
    await page.waitForFunction(()=>window.__verification.snapshot().pose.deathAge>=.55);
    await page.locator('#primary').click();await scenario(page,'empty');state=await snapshot(page);
    assert.equal(state.player.stride,0);assert.equal(state.player.moving,false);assert.equal(state.pose.deathAge,0);assert.equal(state.invulnerable,false);
  }
  record('bounded death presentation and three restarts reset gait, death and protection');await page.close();

  const fallback=await ready('&assets=fallback');const fallbackGait=await sampleGait(fallback);
  assert.ok(new Set(fallbackGait.map(s=>s.feetHash)).size>=3);
  await fallback.locator('#crowd-ten').click();await fallback.waitForTimeout(100);
  assert.equal((await snapshot(fallback)).enemies.length,10);
  await fallback.screenshot({path:'artifacts/screenshots/motion-fallback-controls.png',fullPage:true});
  record('original fallback has real alternating leg pixels and visible crowd tools');await fallback.close();

  const missing=await ready('',p=>p.route('**/images/sc-marine-motion.png',route=>route.abort()));
  state=await snapshot(missing);assert.ok(!state.assets.includes('sc-marine-motion')&&state.assets.includes('sc-enemy-zergling-walk'));
  await sampleGait(missing);record('missing full gait atlas falls back to moving legs while retaining local Zerg');await missing.close();

  assert.deepEqual(errors,[]);record('no uncaught page errors');report.passed=true;
}catch(error){report.passed=false;report.failure=String(error);throw error;}
finally{report.pageErrors=errors;writeFileSync('artifacts/marine-motion-verification.json',JSON.stringify(report,null,2)+'\n');await browser.close();}
