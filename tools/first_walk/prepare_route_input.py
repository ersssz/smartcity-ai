"""Adapt the hash-pinned friend export without changing its public geometry.

The retained route-candidate is unchanged. Added identifiers refer to public
foot anchors in this prepared package, not accepted canonical backend POIs.
The upstream PBF, retained augmented snapshot and witness have different hashes.
"""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {
    'data/first-walk/route-candidate.json': '3f700ecf9e4edac484c4dd213ce42c8713cd0970d1dc4d7b612dee0722d9f5d3',
    'evidence/first-walk/routing-source.json': '7c71e91aa760e046c7a706ebd68fca4954d71fd457fa7d8c1d7a744fb9e5799b',
    'evidence/first-walk/routing-source-context.json': '465ded9ff687e66dc1433664341a54228060b5afa648651cf2490b8a026b8442',
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepared-at', required=True, help='Actual integration instant, ISO 8601 with timezone')
    args = parser.parse_args()
    if datetime.fromisoformat(args.prepared_at.replace('Z', '+00:00')).tzinfo is None:
        raise ValueError('Timezone required')
    for name, expected in EXPECTED.items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != expected:
            raise ValueError('Pinned handoff artifact changed: ' + name)
    route = json.loads((ROOT / 'data/first-walk/route-candidate.json').read_text(encoding='utf-8'))
    route['source'].update(url='https://download.geofabrik.de/asia/kazakhstan-latest.osm.pbf',
                           graphSha256=EXPECTED['evidence/first-walk/routing-source.json'], preparedAt=args.prepared_at)
    for stop in route['stops']:
        stop['poiId'] = 'prepared-anchor:osm-node:' + str(stop['osmNodeId'])
    route['startAnchor']['label'] = {
        'ru': route['startAnchor']['label'],
        'kk': 'Бәйтерек: батыс жақтағы жаяу жүргінші алаңы',
        'en': 'Baiterek: pedestrian plaza on the west side',
    }
    output = ROOT / 'data/first-walk/catalog-route.json'
    output.write_text(json.dumps(route, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Prepared catalog input; original candidate and all geometry preserved.')

if __name__ == '__main__':
    main()
