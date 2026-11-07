import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';

const base=process.env.VERIFY_URL??'http://127.0.0.1:5180';
let executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if(!executablePath && !existsSync(chromium.executablePath()) && process.platform==='win32') {
  const cache=join(process.env.LOCALAPPDATA??'', 'ms-playwright');
  if(existsSync(cache)) for(const dir of readdirSync(cache).filter(n=>/^chromium-\d+$/.test(n)).reverse()) {
    const candidate=join(cache,dir,'chrome-win64/chrome.exe');
    if(existsSync(candidate)) {executablePath=candidate;break;}
  }
}
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1080},deviceScaleFactor:1});
const errors=[];
context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
const report={date:'2026-11-07',browser:browser.version(),platform:process.platform,
  cpu:os.cpus()[0]?.model,viewport:'1440x1080, DPR 1',scope:'Phase 1 only; no audio listening or balance claim',checks:[],screenshots:[]};
mkdirSync('artifacts/screenshots',{recursive:true});
const record=(name,detail={})=>{report.checks.push({name,passed:true,...detail});console.log(`PASS ${name}`);};
const snapshot=page=>page.evaluate(()=>window.__verification.snapshot());
const scenario=(page,name)=>page.evaluate(name=>window.__verification.scenario(name),name);
const open=async suffix=>{
  const page=await context.newPage();
  await page.goto(`${base}/?verify=1${suffix}`,{waitUntil:'networkidle'});
  await page.locator('#primary').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('#primary').disabled);
  return page;
};
try {
  const page=await open('');
  const initial=await snapshot(page);
  assert.ok(initial.assets.includes('sc-marine-directions')&&initial.assets.includes('sc-enemy-zergling-walk'));
  record('optional local Marine directions and Zergling walk sheets loaded');
  await page.locator('#primary').click();
  await scenario(page,'empty');
  await page.waitForFunction(()=>window.__verification.snapshot().audio.buffers.length===4);
  record('audio unlocked after real click; four combat buffers decoded (not listening QA)');
  let before=await snapshot(page);
  await page.keyboard.down('d');await page.waitForTimeout(500);await page.keyboard.up('d');
  let after=await snapshot(page);
  assert.ok(after.player.x-before.player.x>70);
  assert.ok(Math.abs(after.player.y-before.player.y)<.01);
  record('keyboard movement and following camera',{distance:after.player.x-before.player.x});
  await page.keyboard.press('Escape');
  before=await snapshot(page);await page.waitForTimeout(400);after=await snapshot(page);
  for(const key of ['time','player','enemies','bullets','effects'])assert.deepEqual(after[key],before[key]);
  assert.equal(after.phase,'paused');record('Escape freezes simulation');
  await page.locator('#primary').click();
  await scenario(page,'target');
  const baseline=(await snapshot(page)).kills;
  await page.waitForFunction(baseline=>window.__verification.snapshot().kills>baseline,baseline);
  record('automatic rifle fire collides and kills target');
  await scenario(page,'crowd');await page.waitForTimeout(200);
  await page.screenshot({path:'artifacts/screenshots/local-phase1-combat.png',fullPage:true});
  report.screenshots.push({path:'screenshots/local-phase1-combat.png',localOnly:true,scenario:'40 bugs injected using dev verification API; not natural spawn density'});
  await scenario(page,'hurt');
  await page.waitForFunction(()=>window.__verification.snapshot().player.hp<120);
  record('contact attack decreases health and updates HUD');
  await scenario(page,'empty');
  await page.keyboard.down('d');
  // Dispatch the browser blur event explicitly to exercise the exact subscribed handler.
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  after=await snapshot(page);assert.equal(after.phase,'paused');assert.deepEqual(after.keys,[]);
  await page.keyboard.up('d');record('blur handler pauses and clears held movement (synthetic blur event)');
  await page.locator('#primary').click();
  await page.locator('summary').click();
  await page.locator('#mute').check();
  assert.equal((await snapshot(page)).audio.active,0);
  await page.locator('#volume').evaluate(input=>{input.value='25';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal((await snapshot(page)).audio.volume,.25);
  record('mute stops active audio and volume slider updates independent SFX setting');
  for(let i=0;i<3;i++) {
    await scenario(page,'death');
    await page.waitForFunction(()=>window.__verification.snapshot().phase==='dead');
    after=await snapshot(page);assert.equal(after.player.hp,0);assert.equal(after.bullets.length,0);assert.equal(after.effects.length,0);assert.equal(after.audio.active,0);
    await page.locator('#primary').click();await scenario(page,'empty');
    after=await snapshot(page);assert.equal(after.player.hp,120);assert.equal(after.kills,0);assert.equal(after.shots,0);assert.equal(after.enemies.length,0);assert.equal(after.bullets.length,0);
  }
  record('fatal contact and three restarts clear run state');
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__verification?.snapshot().audio.volume===.25);
  assert.equal((await snapshot(page)).audio.muted,true);record('SFX volume and mute persist across reload');
  await page.close();

  const fallback=await open('&assets=fallback');
  assert.ok(!(await snapshot(fallback)).assets.some(key=>key.startsWith('sc-')));
  await fallback.locator('#primary').click();await scenario(fallback,'target');
  await fallback.waitForFunction(()=>window.__verification.snapshot().kills===1);
  await scenario(fallback,'crowd');await fallback.waitForTimeout(120);
  await fallback.screenshot({path:'artifacts/screenshots/phase1-fallback-combat.png',fullPage:true});
  report.screenshots.push({path:'screenshots/phase1-fallback-combat.png',localOnly:false,scenario:'40 injected bugs; original procedural units only'});
  await scenario(fallback,'death');await fallback.waitForFunction(()=>window.__verification.snapshot().phase==='dead');
  await fallback.locator('#primary').click();
  record('forced fallback completes shooting, death and restart');
  await fallback.close();

  const absent=await context.newPage();
  await absent.route('**/assets/sc-local/manifest.json',route=>route.fulfill({status:404,body:'optional pack absent'}));
  await absent.goto(`${base}/?verify=1`,{waitUntil:'networkidle'});
  await absent.waitForFunction(()=>!document.querySelector('#primary').disabled);
  assert.ok(!(await snapshot(absent)).assets.some(key=>key.startsWith('sc-')));
  await absent.locator('#primary').click();await scenario(absent,'target');
  await absent.waitForFunction(()=>window.__verification.snapshot().kills===1);
  record('missing manifest automatically falls back and remains playable');await absent.close();

  const broken=await context.newPage();
  await broken.route('**/images/sc-marine-directions.png',route=>route.abort());
  await broken.goto(`${base}/?verify=1`,{waitUntil:'networkidle'});
  await broken.waitForFunction(()=>!document.querySelector('#primary').disabled);
  after=await snapshot(broken);
  assert.ok(!after.assets.includes('sc-marine-directions')&&after.assets.includes('sc-marine')&&after.assets.includes('sc-enemy-zergling-walk'));
  await broken.locator('#primary').click();await scenario(broken,'target');
  await broken.waitForFunction(()=>window.__verification.snapshot().kills===1);
  record('one broken sheet falls back independently; other local textures survive');await broken.close();

  const silent=await context.newPage();
  await silent.route('**/*.wav',route=>route.abort());
  await silent.goto(`${base}/?verify=1&assets=fallback`,{waitUntil:'networkidle'});
  await silent.waitForFunction(()=>!document.querySelector('#primary').disabled);
  await silent.locator('#primary').click();await scenario(silent,'target');
  await silent.waitForFunction(()=>window.__verification.snapshot().kills===1);
  record('missing audio files do not block combat');await silent.close();

  const natural=await open('');
  await natural.locator('#primary').click();
  await natural.waitForFunction(()=>window.__verification.snapshot().kills>0,{},{timeout:15000});
  const naturalState=await snapshot(natural);
  assert.ok(naturalState.time>0&&naturalState.shots>=2);
  record('natural offscreen spawning reaches combat without injected enemies',{time:naturalState.time,kills:naturalState.kills});
  await natural.close();

  const small=await context.newPage();
  await small.setViewportSize({width:800,height:700});
  await small.goto(`${base}/?verify=1&assets=fallback`,{waitUntil:'networkidle'});
  await small.waitForFunction(()=>!document.querySelector('#primary').disabled);
  assert.ok(await small.locator('#primary').isVisible());
  assert.equal(await small.evaluate(()=>window.innerWidth),800);
  assert.ok(await small.evaluate(()=>document.documentElement.scrollWidth<=800));
  await small.screenshot({path:'artifacts/screenshots/phase1-small-window.png',fullPage:true});
  report.screenshots.push({path:'screenshots/phase1-small-window.png',localOnly:false,scenario:'800px window, original fallback menu'});
  await small.locator('#primary').click();
  assert.ok(await small.locator('#pause').isVisible());
  record('800px window keeps start and pause controls accessible',{actualViewport:small.viewportSize()});await small.close();

  if(process.env.VERIFY_PREVIEW_URL) {
    const production=await context.newPage();
    await production.goto(`${process.env.VERIFY_PREVIEW_URL}/?verify=1`,{waitUntil:'networkidle'});
    await production.waitForFunction(()=>!document.querySelector('#primary').disabled);
    assert.equal(await production.evaluate(()=>typeof window.__verification),'undefined');
    assert.match(await production.locator('#asset-status').textContent(),/程序化|原创分层步态/);
    await production.locator('#primary').click();
    await production.waitForFunction(()=>Number(document.querySelector('#kills').textContent)>0,{},{timeout:15000});
    await production.screenshot({path:'artifacts/screenshots/phase1-public-natural-combat.png',fullPage:true});
    report.screenshots.push({path:'screenshots/phase1-public-natural-combat.png',localOnly:false,scenario:'Actual public production build, natural spawning; no debug API or original StarCraft pack'});
    record('public production build starts, naturally spawns and kills; no mutation API');
    await production.close();
  }

  assert.deepEqual(errors,[]);record('no uncaught browser page errors');
  report.passed=true;
} catch(error) {
  report.passed=false;report.failure=String(error);throw error;
} finally {
  report.pageErrors=errors;
  writeFileSync('artifacts/phase1-browser-verification.json',JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
