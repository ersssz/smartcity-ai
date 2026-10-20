"""Synthetic geometry invariants; these are not device or field acceptance."""
import unittest
from build_geometry import combine_rings, contains, in_polygon, label_point, validate_self


class GeometryInvariants(unittest.TestCase):
    def test_shuffled_and_reversed_source_ways_close_by_node_id(self):
        nodes = {i: {"lon": p[0], "lat": p[1]} for i, p in enumerate([(0, 0), (2, 0), (2, 2), (0, 2)], 1)}
        ways = {9: {"nodes": [2, 1]}, 4: {"nodes": [3, 2]}, 7: {"nodes": [4, 3]}, 6: {"nodes": [1, 4]}}
        rings = combine_rings([9, 4, 7, 6], ways, nodes)
        self.assertEqual(len(rings), 1)
        self.assertEqual(rings[0][0], rings[0][-1])
        self.assertEqual(len(rings[0]), 5)
        self.assertTrue(contains(rings[0], [1, 1]))

    def test_missing_boundary_way_refuses_to_invent_closing_segment(self):
        nodes = {i: {"lon": p[0], "lat": p[1]} for i, p in enumerate([(0, 0), (2, 0), (2, 2)], 1)}
        with self.assertRaisesRegex(ValueError, "degree-two"):
            combine_rings([1, 2], {1: {"nodes": [1, 2]}, 2: {"nodes": [2, 3]}}, nodes)

    def test_self_crossing_ring_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "self-intersection"):
            validate_self([[0, 0], [2, 2], [0, 2], [2, 0], [0, 0]])

    def test_hole_is_not_an_interior_hit(self):
        outer = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]
        hole = [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]
        self.assertTrue(in_polygon([outer, hole], [.5, .5]))
        self.assertFalse(in_polygon([outer, hole], [2, 2]))
        self.assertTrue(in_polygon([outer, hole], label_point([[outer, hole]])))

    def test_concave_district_label_remains_inside(self):
        concave = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [4, 3], [4, 4], [0, 4], [0, 0]]
        self.assertFalse(contains(concave, [2, 2]))
        self.assertTrue(in_polygon([concave], label_point([[concave]])))


if __name__ == "__main__":
    unittest.main()
