"""Create original procedural combat sprites and PCM sound drafts; no source art read."""
from pathlib import Path
import hashlib
import json
import math
import random
import struct
import wave
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/combat'
OUT.mkdir(parents=True, exist_ok=True)
COLORS = {'kinetic': '#ffd581', 'explosion': '#ff963d', 'electric': '#6de9ff',
          'fire': '#ff713e', 'cryo': '#b9efff', 'heavy': '#fff2b8'}
manifest = {'version': 1, 'origin': 'Original procedural assets for Stellar Soldier',
            'images': {}, 'spritesheets': {}, 'audio': {}}
previews = []


def save_image(key, image, frames=1, use=''):
    relative = f'images/{key}.png'
    path = OUT / relative
    path.parent.mkdir(exist_ok=True)
    image.save(path)
    entry = {'path': relative, 'width': image.width, 'height': image.height, 'use': use}
    if frames > 1:
        entry.update(frameWidth=image.width // frames, frameHeight=image.height,
                     frames=frames, suggestedFps=24 if frames == 8 else 40, loop=False)
        manifest['spritesheets'][key] = entry
    else:
        manifest['images'][key] = entry
    previews.append((key, image.copy()))


for kind, color in COLORS.items():
    sheet = Image.new('RGBA', (512, 64))
    for frame in range(8):
        tile = Image.new('RGBA', (64, 64))
        draw = ImageDraw.Draw(tile)
        t = frame / 7
        radius = 3 + int(t * (25 if kind == 'explosion' else 20))
        alpha = int(255 * (1 - t) ** .7)
        rgb = tuple(bytes.fromhex(color[1:]))
        ink = (*rgb, alpha)
        rng = random.Random(f'{kind}-{frame}')
        if kind in ('explosion', 'cryo'):
            draw.ellipse((32-radius, 32-radius, 32+radius, 32+radius), outline=ink, width=2)
        if kind == 'electric':
            for n in range(5):
                angle = n * math.tau / 5 + t
                points = [(32, 32)]
                for r in (radius * .35, radius * .7, radius):
                    a = angle + rng.uniform(-.35, .35)
                    points.append((32 + math.cos(a)*r, 32 + math.sin(a)*r))
                draw.line(points, fill=ink, width=2)
        else:
            for n in range(8 if kind == 'explosion' else 5):
                angle = n * math.tau / (8 if kind == 'explosion' else 5)
                if kind == 'fire':
                    x, y = 32 + math.cos(angle)*radius*.55, 35-radius-rng.randint(0, 6)
                    draw.polygon([(x-3, y+9), (x, y-3), (x+3, y+8)], fill=ink)
                else:
                    start = radius * .55
                    draw.line([(32+math.cos(angle)*start, 32+math.sin(angle)*start),
                               (32+math.cos(angle)*radius, 32+math.sin(angle)*radius)], fill=ink, width=3 if kind == 'heavy' else 2)
        core = max(0, 8-frame)
        if core:
            draw.ellipse((32-core, 32-core, 32+core, 32+core), fill=(255, 250, 220, alpha))
        sheet.alpha_composite(tile, (frame*64, 0))
    save_image(f'impact-{kind}', sheet, 8, 'One-shot impact; damage is simulated separately')

sheet = Image.new('RGBA', (128, 32))
for f in range(4):
    tile = Image.new('RGBA', (32, 32))
    d = ImageDraw.Draw(tile)
    length = [13, 10, 7, 3][f]
    d.polygon([(8, 16), (8+length, 11), (12+length, 16), (8+length, 21)], fill=(255, 195, 65, 255-f*55))
    d.line([(8, 16), (10+length, 16)], fill=(255, 255, 230, 255-f*55), width=2)
    sheet.alpha_composite(tile, (f*32, 0))
save_image('muzzle-flash', sheet, 4, 'Faces right; anchor at (8,16), rotate to barrel direction')

for name, kind, width in [('basic', 'kinetic', 2), ('pierce', 'kinetic', 2),
                           ('ricochet', 'kinetic', 2), ('fire', 'fire', 2),
                           ('cryo', 'cryo', 2), ('heavy', 'heavy', 4)]:
    im = Image.new('RGBA', (32, 16))
    d = ImageDraw.Draw(im)
    d.line([(3 if name == 'pierce' else 10, 8), (27, 8)], fill=COLORS[kind], width=width)
    d.line([(22, 8), (28, 8)], fill='white', width=1)
    save_image('bullet-'+name, im, use='Faces right; collision radius configured separately')

for name, color in [('burn', COLORS['fire']), ('slow', COLORS['cryo'])]:
    im = Image.new('RGBA', (64, 64))
    d = ImageDraw.Draw(im)
    if name == 'burn':
        for x in (19, 32, 45):
            d.polygon([(x-5, 44), (x-3, 28), (x+1, 18), (x+6, 35), (x+4, 44)], fill=color)
    else:
        d.arc((9, 35, 55, 53), 0, 150, fill=color, width=2)
        d.arc((9, 35, 55, 53), 180, 330, fill=color, width=2)
        for a in range(0, 360, 60):
            r = math.radians(a)
            d.line([(32, 25), (32+math.cos(r)*12, 25+math.sin(r)*12)], fill=color, width=2)
    save_image('status-'+name, im, use='Attach to affected enemy; remove on state expiry')

skills = ['pierce', 'ricochet', 'explosive', 'arc', 'incendiary', 'cryo', 'heavy', 'overdrive']
for skill in skills:
    im = Image.new('RGBA', (64, 64), (13, 22, 33, 255))
    d = ImageDraw.Draw(im)
    c = COLORS[{'explosive':'explosion', 'arc':'electric', 'incendiary':'fire', 'cryo':'cryo', 'heavy':'heavy'}.get(skill, 'kinetic')]
    d.rounded_rectangle((2, 2, 61, 61), radius=7, outline=c, width=2)
    if skill == 'pierce':
        for x in (21, 34, 47): d.line([(x, 15), (x, 49)], fill='#5f7181', width=3)
        d.line([(10, 32), (53, 32)], fill=c, width=4)
        d.polygon([(53, 32), (45, 26), (45, 38)], fill=c)
    elif skill == 'ricochet':
        d.line([(12, 45), (32, 20), (51, 40)], fill=c, width=4)
        d.ellipse((27, 15, 37, 25), outline='white', width=2)
    elif skill == 'explosive':
        d.ellipse((21, 21, 43, 43), fill=c)
        for a in range(0, 360, 45):
            r=math.radians(a)
            d.line([(32+math.cos(r)*15, 32+math.sin(r)*15), (32+math.cos(r)*23, 32+math.sin(r)*23)], fill=c, width=3)
    elif skill == 'arc':
        d.line([(18, 12), (37, 24), (26, 34), (47, 51)], fill=c, width=4)
        d.line([(28, 33), (14, 44)], fill=c, width=3)
    elif skill == 'incendiary':
        d.polygon([(17, 48), (19, 31), (29, 14), (32, 30), (42, 22), (48, 42), (39, 51)], fill=c)
        d.polygon([(26, 46), (31, 33), (37, 47)], fill='#ffe08e')
    elif skill == 'cryo':
        for a in range(0, 360, 60):
            r=math.radians(a)
            d.line([(32,32), (32+math.cos(r)*22,32+math.sin(r)*22)], fill=c,width=3)
        d.ellipse((26,26,38,38),outline='white',width=2)
    elif skill == 'heavy':
        d.polygon([(13,25),(42,25),(53,32),(42,39),(13,39)],fill=c)
        d.line([(20,16),(20,21)],fill=c,width=3)
        d.line([(20,43),(20,49)],fill=c,width=3)
    else:
        for y in (19,32,45):
            d.line([(14,y),(47,y)],fill=c,width=3)
            d.polygon([(50,y),(42,y-4),(42,y+4)],fill=c)
    save_image('skill-'+skill, im, use='Skill chip and equipped slot icon')

RATE = 22050
for name, seconds, freq in [('rifle',.09,180),('impact',.075,420),('explosion',.28,70),
                             ('electric',.16,1550),('fire',.14,330),('cryo',.16,2300),
                             ('heavy',.13,100),('pickup',.22,850)]:
    rng = random.Random(name)
    samples=[]
    for i in range(int(RATE*seconds)):
        t=i/RATE
        p=t/seconds
        envelope=min(1, t/.004)*(1-p)**2
        noise=rng.uniform(-1,1)
        pitch=freq*(1-.65*p) if name!='pickup' else freq*(1+p)
        tone=math.sin(math.tau*pitch*t)
        value=envelope*(.55*noise+.45*tone) if name in ('rifle','impact','explosion','fire','heavy') else envelope*(.15*noise+.85*tone)
        samples.append(int(value*.45*32767))
    relative=f'audio/{name}.wav'
    path=OUT/relative
    path.parent.mkdir(exist_ok=True)
    with wave.open(str(path),'wb') as wav:
        wav.setparams((1,2,RATE,0,'NONE','not compressed'))
        wav.writeframes(struct.pack('<'+'h'*len(samples),*samples))
    manifest['audio'][name]={'path':relative,'sampleRate':RATE,'channels':1,'bits':16,'duration':seconds,'status':'Draft; listening QA pending'}

(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
canvas=Image.new('RGB',(1000, len(previews)*86+70),'#0c1420')
d=ImageDraw.Draw(canvas)
d.text((20,15),'STELLAR SOLDIER | ORIGINAL PROCEDURAL COMBAT RESOURCES',fill='white')
for i,(key,im) in enumerate(previews):
    y=55+i*86
    d.text((18,y+20),key,fill='#cbd6df')
    canvas.paste(im,(230,y),im)
preview=ROOT/'artifacts/combat-resources-contact-sheet.png'
preview.parent.mkdir(exist_ok=True)
canvas.save(preview)
print(json.dumps({'images':len(previews),'audio':len(manifest['audio']),'preview':str(preview)},ensure_ascii=False))
