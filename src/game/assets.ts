type Sheet = { path: string; frameWidth: number; frameHeight: number; endFrame: number };
type LocalManifest = { available?: boolean; images?: Record<string,string>; spritesheets?: Record<string,Sheet>; audio?: string[] };

export class Assets {
  images = new Map<string,HTMLImageElement>();
  sheets = new Map<string,Sheet>();
  localAudio = new Set<string>();
  local = false;
  forceFallback = new URLSearchParams(location.search).get('assets')==='fallback';

  async image(key: string, path: string, expected?: {width:number;height:number}): Promise<boolean> {
    return new Promise(resolve=> {
      const image = new Image();
      const timeout = window.setTimeout(()=>finish(false),2500);
      let done=false;
      const finish=(ok:boolean)=> {
        if (done) return;
        done=true;
        clearTimeout(timeout);
        if (ok) this.images.set(key,image);
        resolve(ok);
      };
      image.onload=()=>finish(!expected || (image.naturalWidth===expected.width && image.naturalHeight===expected.height));
      image.onerror=()=>finish(false);
      image.src=path;
    });
  }

  async load(): Promise<void> {
    const base=import.meta.env.BASE_URL;
    const original=[['muzzle-flash','muzzle-flash'],['impact-kinetic','impact-kinetic']];
    await Promise.all(original.map(([key,file])=>this.image(key,`${base}assets/combat/images/${file}.png`)));
    if (this.forceFallback) return;
    try {
      const response=await fetch(`${base}assets/sc-local/manifest.json`,{signal:AbortSignal.timeout(2500)});
      if (!response.ok) return;
      const manifest=await response.json() as LocalManifest;
      if (!manifest.available) return;
      const jobs:Promise<unknown>[]=[];
      jobs.push(this.loadMarineMotion(base));
      // Fail per item; one bad sheet must not discard the other valid textures.
      for (const key of ['sc-marine','sc-enemy-zergling']) {
        const path=manifest.images?.[key];
        if (path && validPath(path)) jobs.push(this.image(key,`${base}assets/sc-local/${path}`,{width:96,height:96}));
      }
      for (const key of ['sc-marine-directions','sc-enemy-zergling-walk']) {
        const sheet=manifest.spritesheets?.[key];
        if (sheet && validPath(sheet.path) && sheet.frameWidth===96 && sheet.frameHeight===96 && sheet.endFrame>0) {
          const expected={width:key==='sc-marine-directions'?96:672,height:1536};
          jobs.push(this.image(key,`${base}assets/sc-local/${sheet.path}`,expected).then(ok=>{if(ok) this.sheets.set(key,sheet);}));
        }
      }
      await Promise.all(jobs);
      this.local=this.images.has('sc-marine-motion');
      for (const audio of manifest.audio??[]) if (/^[A-Za-z.]+$/.test(audio)) this.localAudio.add(audio);
    } catch { /* Optional local assets are never required for the game. */ }
  }

  private async loadMarineMotion(base:string):Promise<void> {
    try {
      const response=await fetch(`${base}assets/sc-local/marine-motion.json`,{signal:AbortSignal.timeout(2500)});
      if(!response.ok)return;
      const metadata=await response.json();
      if(metadata.version!==1 || metadata.width!==1152 || metadata.height!==896 || metadata.walkFrames!==9 || metadata.directions!==16 || !validPath(metadata.path))return;
      await this.image('sc-marine-motion',`${base}assets/sc-local/${metadata.path}`,{width:1152,height:896});
    } catch { /* No full gait atlas: render the animated procedural soldier. */ }
  }
}

function validPath(path:string):boolean {
  return /^(images|audio)\/[\w.-]+$/.test(path) && !path.includes('..');
}
