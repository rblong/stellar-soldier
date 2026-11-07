"""Stage an explicit local-only asset subset without changing source or overwriting conflicts."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,default=ROOT.parent/'starport-defense/public/assets/sc-local')
args=parser.parse_args()
source=args.source.resolve()
destination=ROOT/'public/assets/sc-local'
raw=json.loads((source/'manifest.json').read_text(encoding='utf-8-sig'))
if not raw.get('available'):
    raise SystemExit('Source pack is not available')
images=['sc-marine','sc-enemy-zergling','sc-enemy-hydralisk','sc-enemy-ultralisk']
sheets=['sc-marine-directions','sc-enemy-zergling-walk','sc-enemy-hydralisk-walk','sc-enemy-ultralisk-walk','sc-explosion']
audio=['Button','Marine.selected','Marine.attack','upgrade.Terran','Zergling.death','Hydralisk.death','Ultralisk.death','TerranBuilding.death','YouLose']
filtered={'available':True,'note':'Local-only original StarCraft assets; do not commit or redistribute.',
          'images':{k:raw['images'][k] for k in images},
          'spritesheets':{k:raw['spritesheets'][k] for k in sheets},'audio':audio,
          'motion':[m for m in raw.get('motion',[]) if m['unit'] in ['Marine','Zergling','Hydralisk','Ultralisk']]}
if not set(audio).issubset(raw['audio']):
    raise SystemExit('Required sound missing from source manifest')
paths=list(filtered['images'].values())+[s['path'] for s in filtered['spritesheets'].values()]+[f'audio/{a}.wav' for a in audio]
plan=[]
for relative in paths:
    src=(source/relative).resolve()
    dst=(destination/relative).resolve()
    if not src.is_relative_to(source) or not dst.is_relative_to(destination.resolve()):
        raise SystemExit('Resource path escaped pack root')
    if not src.is_file() or not src.stat().st_size:
        raise SystemExit(f'Missing or empty source: {relative}')
    digest=hashlib.sha256(src.read_bytes()).hexdigest()
    if dst.exists() and hashlib.sha256(dst.read_bytes()).hexdigest()!=digest:
        raise SystemExit(f'Conflict: refusing to overwrite {relative}')
    plan.append((src,dst,relative,digest))
content=json.dumps(filtered,ensure_ascii=False,indent=2)+'\n'
target_manifest=destination/'manifest.json'
if target_manifest.exists() and target_manifest.read_text(encoding='utf-8')!=content:
    raise SystemExit('Conflict: refusing to overwrite existing manifest')
for src,dst,_,_ in plan:
    dst.parent.mkdir(parents=True,exist_ok=True)
    if not dst.exists(): shutil.copy2(src,dst)
target_manifest.write_text(content,encoding='utf-8')
report={'sourceProject':'starport-defense','localOnly':True,'runtimeIntegration':'not implemented',
        'files':[{'path':relative,'sha256':digest,'matchesSource':hashlib.sha256(dst.read_bytes()).hexdigest()==digest}
                 for _,dst,relative,digest in plan]}
(ROOT/'artifacts/local-resource-inventory.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(f'Prepared {len(plan)} local-only files; source unchanged; no runtime integration')
