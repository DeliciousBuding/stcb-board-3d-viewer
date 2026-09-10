"""Extract vector PCB reference layers without tracing or inventing route topology.

Usage: python tools/extract_artwork.py --pdf PATH
Extraction-only dependency: PyMuPDF. The runtime viewer has no Python or PDF dependency.
The input PDF is read-only; output SVG is text, not a raster photograph.
"""
import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET


def assembly_pad(drawing: dict, frame: tuple[float, float]) -> dict | None:
    """Keep circular, oblong and square pad symbols; pad outline is not a drill table."""
    if drawing['type'] != 'f':
        return None
    commands = [item[0] for item in drawing['items']]
    rect = drawing['rect']
    w, d = rect.width * 92 / 260.88, rect.height * 72 / 201.6
    if commands == ['c'] * 4:
        shape = 'round'
    elif commands == ['c', 'c', 'l', 'c', 'c'] and max(w, d) < 2:
        shape = 'oval'
    elif commands == ['re'] and 0.9 < w < 2 and 0.9 < d < 2:
        shape = 'square'
    else:
        return None  # Large filled board marker is not a mounting/drill symbol.
    return {'x': round(((rect.x0 + rect.x1) / 2 - frame[0]) * 92 / 260.88, 4),
            'z': round(((rect.y0 + rect.y1) / 2 - frame[1]) * 72 / 201.6, 4),
            'artworkRadius': round(w / 2, 4), 'shape': shape,
            'padWidth': round(w, 4), 'padDepth': round(d, 4)}


def register_holes(front: list[dict], back: list[tuple[float, float]]) -> dict:
    """Check a one-to-one front/back registration, not just 219 nearest distances."""
    if len(front) != 219 or len(back) != 219:
        raise ValueError(f'Unexpected artwork registration: front={len(front)}, back={len(back)} pad symbols')
    aligned = [(92 - x, z) for x, z in back]
    matches, errors = [], []
    for hole in front:
        distances = [math.hypot(hole['x'] - x, hole['z'] - z) for x, z in aligned]
        match = min(range(len(distances)), key=distances.__getitem__)
        matches.append(match)
        errors.append(distances[match])
    if len(set(matches)) != 219 or max(errors) >= 0.06:
        raise ValueError('Unexpected artwork registration: mirrored centers must match uniquely within 0.06 mm')
    return {'backMirrorX': True, 'matchedCenters': len(errors), 'maxErrorMm': round(max(errors), 6),
            'method': 'bijective nearest pad symbols after PCB-frame normalization'}


def extract(pdf_path: Path, output: Path, source_label: str = "reference-board-schematic.pdf") -> None:
    import fitz
    payloads = {}
    with fitz.open(pdf_path) as doc:
        manifest = {'source': source_label, 'sha256': hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
                    'boardMm': [92, 72], 'layers': [], 'holes': []}
        frames = [(166.14, 325.44), (166.98, 320.16), (166.98, 320.16), (166.98, 320.16)]
        for index, name in enumerate(['front-silk', 'front-copper', 'back-silk', 'back-copper']):
            x0, y0 = frames[index]
            width, height = 260.88, 201.6
            paths = doc[index].get_drawings()
            svg = ET.Element('svg', xmlns='http://www.w3.org/2000/svg', viewBox=f'0 0 {width} {height}', width='2608.8', height='2016')
            svg.append(ET.Comment(f'PDF page {index + 1}; original viewing side; frame {x0},{y0},{width},{height} pt'))
            strokes = defaultdict(list)
            def number(v):
                return f'{v:.3f}'.rstrip('0').rstrip('.') or '0'
            def point(p):
                return f'{number(p.x-x0)} {number(p.y-y0)}'
            for drawing in paths:
                # Page-frame outline is the board edge, not printed white ink.
                if index % 2 == 0 and drawing['type'] == 's' and len(drawing['items']) == 1:
                    item = drawing['items'][0]
                    if item[0] == 'l' and (abs(item[1].x-item[2].x) > 240 or abs(item[1].y-item[2].y) > 190):
                        continue
                if index % 2 == 0 and drawing['type'] == 'f':
                    if index == 0 and (pad := assembly_pad(drawing, frames[index])) is not None:
                        manifest['holes'].append(pad)
                    continue  # Assembly artwork filled disks are pad/drill symbols, not white silk.
                commands = []
                last = None
                for item in drawing['items']:
                    kind = item[0]
                    if kind in ('l', 'c'):
                        if last != item[1]: commands.append('M'+point(item[1]))
                        commands.append(('L' if kind == 'l' else 'C') + ' '.join(point(p) for p in item[2:]))
                        last = item[-1]
                    elif kind == 're':
                        r = item[1]
                        corners = [r.tl,r.tr,r.br,r.bl] if item[2] == 1 else [r.tl,r.bl,r.br,r.tr]
                        commands.append('M'+point(corners[0])+'L'+' '.join(point(p) for p in corners[1:])+'Z'); last=None
                    elif kind == 'qu':
                        q=item[1]; commands.append('M'+point(q.ul)+'L'+' '.join(point(p) for p in [q.ur,q.lr,q.ll])+'Z'); last=None
                    else: raise ValueError(f'Unsupported PDF vector command: {kind}')
                if drawing.get('closePath'): commands.append('Z')
                data = ''.join(commands)
                if drawing['type'] == 's':
                    key=(number(drawing['width']), str(max(drawing['lineCap'])), str(int(drawing['lineJoin'])))
                    strokes[key].append(data)
                elif drawing['type'] == 'f':
                    ET.SubElement(svg,'path',d=data,fill='#000', **{'fill-rule':'evenodd' if drawing['even_odd'] else 'nonzero'})
                else: raise ValueError(f'Unsupported drawing type: {drawing["type"]}')
            for (thickness,cap,join), data in strokes.items():
                ET.SubElement(svg,'path',d=''.join(data),fill='none',stroke='#000', **{
                    'stroke-width':thickness,'stroke-linecap':{'0':'butt','1':'round','2':'square'}[cap],
                    'stroke-linejoin':{'0':'miter','1':'round','2':'bevel'}[join]})
            payload=ET.tostring(svg,encoding='utf-8',xml_declaration=True)
            payloads[f'{name}.svg'] = payload
            manifest['layers'].append({'name':name,'page':index+1,'framePt':[x0,y0,width,height],
                                       'backView':index>=2,'paths':len(paths),'sha256':hashlib.sha256(payload).hexdigest()})
        # Verify side orientation against independent front/back hole symbols.
        front = [h for h in manifest['holes'] if h['artworkRadius'] < 1.5]
        back = [(pad['x'], pad['z']) for drawing in doc[2].get_drawings()
                if (pad := assembly_pad(drawing, frames[2])) is not None and pad['artworkRadius'] < 1.5]
        manifest['registration'] = register_holes(front, back)
    payloads['manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    # Validate every layer before touching an existing generation; publish the manifest last.
    output.mkdir(parents=True, exist_ok=True)
    for name, payload in payloads.items():
        (output / name).write_bytes(payload)
    print(f'Exported 4 vector layers, {len(manifest["holes"])} artwork hole centers to {output}')

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf',type=Path,required=True)
    parser.add_argument('--out',type=Path,default=Path(__file__).resolve().parents[1]/'public'/'artwork')
    parser.add_argument('--source-label',default='reference-board-schematic.pdf',help='Public-safe source label written to manifest.json')
    args=parser.parse_args()
    extract(args.pdf,args.out,args.source_label)
