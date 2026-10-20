"""Barrier enrichment behaviour on synthetic records, no live field assertion."""
import unittest

from tools.data.augment_barriers import merge_barriers
from tools.data.walking import WalkingGraph


class BarrierTests(unittest.TestCase):
    def test_enrichment_blocks_continuous_wall_and_preserves_existing_poi_center(self):
        document = {"elements": [
            {"type": "node", "id": n, "lon": 71.42 + n * .001, "lat": 51.13}
            for n in (1, 2, 3)] + [
            {"type": "way", "id": 1, "nodes": [1, 2, 3], "tags": {"highway": "footway"}},
            {"type": "way", "id": 2, "nodes": [4, 2, 5], "center": {"lon": 71.422, "lat": 51.13},
             "tags": {"barrier": "wall", "historic": "citywalls"}}]}
        barrier = {"type": "way", "id": 2, "nodes": [4, 2, 5], "tags": {"barrier": "wall", "historic": "citywalls"}}
        augmented, count = merge_barriers(document, [barrier])
        self.assertEqual(count, 1)
        self.assertNotEqual(WalkingGraph(augmented).route(1, 3)["kind"], "technical_path")
        enriched = next(e for e in augmented["elements"] if e["type"] == "way" and e["id"] == 2)
        self.assertEqual(enriched["center"], {"lon": 71.422, "lat": 51.13})


if __name__ == "__main__":
    unittest.main()
