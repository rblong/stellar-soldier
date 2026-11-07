"""Copy the existing raw Marine atlas unmodified to the ignored local pack."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import struct

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,default=ROOT.parent/'starport-defense/artifacts/starcraft1/images/terran/Marine.png')
args=parser.parse_args()
source=args.source.resolve()
data=source.read_bytes()
if data[:8]!=b'\x89PNG\r\n\x1a\n' or struct.unpack('>II',data[16:24])!=(1152,896):
    raise SystemExit('Expected the existing 1152x896 Marine atlas; source not changed')
digest=hashlib.sha256(data).hexdigest()
folder=ROOT/'public/assets/sc-local'
target=folder/'images/sc-marine-motion.png'
metadata={'version':1,'path':'images/sc-marine-motion.png','width':1152,'height':896,
          'sourceSha256':digest,'directions':16,'walkFrames':9,'localOnly':True,
          'sourceRevision':'ab3a5bf749ec56d0929d970286a059c00685e4c9'}
encoded=json.dumps(metadata,indent=2)+'\n'
sidecar=folder/'marine-motion.json'
if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=digest:
    raise SystemExit('Conflicting local atlas; refusing to overwrite')
if sidecar.exists() and sidecar.read_text(encoding='utf-8')!=encoded:
    raise SystemExit('Conflicting motion metadata; refusing to overwrite')
target.parent.mkdir(parents=True,exist_ok=True)
if not target.exists():shutil.copy2(source,target)
sidecar.write_text(encoded,encoding='utf-8')
report={**metadata,'copiedWithoutModification':hashlib.sha256(target.read_bytes()).hexdigest()==digest,
        'sourceProject':'starport-defense','runtimeState':'See current motion verification, not source existence alone'}
(ROOT/'artifacts/marine-motion-source.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('Prepared original atlas without modification: 16 directions x 9 walk frames, local only')
