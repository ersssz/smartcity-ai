"""Build the bundled city guide from reviewed content and real OSM witnesses; no network."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IDS = {'almaty', 'baikonyr', 'esil', 'nura', 'saryarka', 'sarayshyq'}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    folder = ROOT / 'data/city-intro'
    content_path = ROOT / 'content/city-intro/districts.json'
    content = read(content_path)
    metadata = read(folder / 'metadata.json')
    boundaries = read(folder / 'districts.geojson')
    river = read(folder / 'river.geojson')
    for name in ('districts.geojson', 'river.geojson'):
        require(digest(folder / name) == metadata['artifacts'][name]['sha256'], f'{name}: artifact hash mismatch')
    require(len(metadata['sources']) == 7 and {s['id'] for s in metadata['sources']} == IDS | {'esil-river-relation'}, 'Unexpected source witness identity')
    for source in metadata['sources']:
        # Source names are fixed by the producer receipt, never arbitrary filesystem input.
        path = folder / 'source' / f"{source['id']}.json"
        require(path.is_file() and digest(path) == source['sha256'], f"{source['id']}: source hash mismatch")
    require(len(content['districts']) == 6 and {d['id'] for d in content['districts']} == IDS, 'Content must cover six unique districts')
    require(len(metadata['districts']) == 6 and {d['id'] for d in metadata['districts']} == IDS, 'Missing district metadata')
    require(len(boundaries['features']) == 6 and {f['properties']['id'] for f in boundaries['features']} == IDS, 'Missing district geometry')
    source_ids = {s['id'] for s in content['sources']}
    require(len(source_ids) == len(content['sources']), 'Duplicate source identities')
    for district in content['districts']:
        for field in ('name', 'tagline', 'description', 'experience'):
            require(set(district[field]) == {'ru', 'kk', 'en'} and all(district[field].values()), f"{district['id']}: missing localized {field}")
        require(district['sourceIds'] and set(district['sourceIds']) <= source_ids, 'Unknown content source')
    require(set(content['river']['sourceIds']) <= source_ids, 'Unknown river source')
    for collection in (boundaries, river):
        require(collection['type'] == 'FeatureCollection' and collection['features'], 'Empty geography')
        for feature in collection['features']:
            require(feature['type'] == 'Feature', 'Invalid geography feature')
            def coordinates(value):
                if isinstance(value, list) and len(value) == 2 and all(isinstance(x, (int, float)) for x in value):
                    require(all(math.isfinite(x) for x in value) and 70 < value[0] < 73 and 50 < value[1] < 53, 'Invalid Astana coordinate')
                else:
                    require(isinstance(value, list) and value, 'Empty coordinates')
                    for child in value:
                        coordinates(child)
            coordinates(feature['geometry']['coordinates'])
    points = [point for feature in river['features'] for line in (feature['geometry']['coordinates'] if feature['geometry']['type'] == 'MultiLineString' else [feature['geometry']['coordinates']]) for point in line]
    require(points, 'No river label anchor')
    # Select an actual river vertex near the two text anchors; never invent a river segment.
    river_label = min(points, key=lambda p: (p[0] - 71.409) ** 2 + (p[1] - 51.155) ** 2)
    output = {
        'schemaVersion': 1,
        'content': content,
        'boundaries': boundaries,
        'river': river,
        'metadata': {
            **{key: metadata[key] for key in ('bounds', 'bankLabelPoints')},
            'districts': [{**district, 'labelCenter': metadata['overview']['labelPoints'][district['id']]} for district in metadata['districts']],
            'riverBounds': metadata['river']['bounds'],
            'overviewBounds': metadata['overview']['bounds'],
        },
        'riverLabelPoint': river_label,
        'provenance': {
            'contentSha256': digest(content_path),
            'metadataSha256': digest(folder / 'metadata.json'),
            'districtGeometrySha256': digest(folder / 'districts.geojson'),
            'riverGeometrySha256': digest(folder / 'river.geojson'),
            'license': metadata['license'],
        },
    }
    destination = ROOT / 'apps/mobile/src/city/guide.json'
    destination.write_bytes((json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8'))
    print(json.dumps({'output': str(destination.relative_to(ROOT)), 'bytes': destination.stat().st_size, 'sha256': digest(destination), 'districts': 6, 'riverVertices': len(points)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
