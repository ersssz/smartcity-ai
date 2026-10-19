"""Synthetic topology tests; never GPS/field/provider acceptance."""
import unittest

from tools.data.walking import WalkingGraph


def node(i, x, y=51.13, **tags):
    return {"type": "node", "id": i, "lon": x, "lat": y, "tags": tags}


def way(i, nodes, **tags):
    return {"type": "way", "id": i, "nodes": nodes,
            "tags": {"highway": "footway", **tags}}


class WalkingTests(unittest.TestCase):
    def test_walk_uses_mapped_detour_and_return_to_identical_origin(self):
        graph = WalkingGraph({"elements": [node(1, 71.42), node(2, 71.421, 51.131),
            node(3, 71.422), way(1, [1, 2, 3])]})
        out = graph.route(1, 3)
        self.assertEqual(out["node_ids"], [1, 2, 3])
        self.assertGreater(out["distance_m"], 250)
        self.assertEqual(graph.route(3, 1)["node_ids"][-1], 1)

    def test_oneway_foot_overrides_car_direction(self):
        graph = WalkingGraph({"elements": [node(1, 71.42), node(2, 71.421),
            way(1, [1, 2], **{"oneway": "yes", "oneway:foot": "-1"})]})
        self.assertEqual(graph.route(1, 2)["kind"], "no_path_in_snapshot")
        self.assertEqual(graph.route_points([71.421, 51.13], [71.42, 51.13])["node_ids"], [2, 1])

    def test_refuses_submetre_gap_instead_of_inventing_connector(self):
        graph = WalkingGraph({"elements": [node(1, 71.42), node(2, 71.421), way(1, [1, 2])]})
        result = graph.route_points([71.420001, 51.13], [71.421, 51.13])
        self.assertEqual(result["kind"], "clarification")
        self.assertTrue(result["requested_endpoints_preserved"])

    def test_unknown_gate_and_private_path_do_not_form_a_through_route(self):
        for tags in ({"barrier": "gate"}, {"access": "private"}, {"foot": "no"}):
            with self.subTest(tags=tags):
                graph = WalkingGraph({"elements": [node(1, 71.42), node(2, 71.421, **tags),
                    node(3, 71.422), way(1, [1, 2, 3])]})
                self.assertNotEqual(graph.route(1, 3)["kind"], "technical_path")

    def test_two_dimensional_crossing_creates_no_junction(self):
        graph = WalkingGraph({"elements": [node(1, 71.42, 51.13), node(2, 71.422, 51.132),
            node(3, 71.42, 51.132), node(4, 71.422, 51.13),
            way(1, [1, 2], bridge="yes", layer="1"), way(2, [3, 4])]})
        self.assertEqual(graph.route(1, 4)["kind"], "no_path_in_snapshot")

    def test_access_override_is_foot_specific_and_car_oneway_is_ignored(self):
        graph = WalkingGraph({"elements": [node(1, 71.42), node(2, 71.421),
            way(1, [1, 2], access="private", foot="yes", oneway="yes")]})
        self.assertEqual(graph.route(2, 1)["node_ids"], [2, 1])

    def test_conditional_restriction_is_unknown_and_not_assumed_open(self):
        graph = WalkingGraph({"elements": [node(1, 71.42), node(2, 71.421),
            way(1, [1, 2], **{"foot:conditional": "no @ (Oct-Mar)"})]})
        self.assertEqual(graph.route(1, 2)["kind"], "unmatched_endpoint")

    def test_motorway_and_polygon_are_not_walking_lines(self):
        for tags in ({"highway": "motorway"}, {"area": "yes"}):
            with self.subTest(tags=tags):
                graph = WalkingGraph({"elements": [node(1, 71.42), node(2, 71.421), way(1, [1, 2], **tags)]})
                self.assertNotEqual(graph.route(1, 2)["kind"], "technical_path")

    def test_coincident_nodes_on_different_levels_require_clarification(self):
        graph = WalkingGraph({"elements": [node(1, 71.42), node(2, 71.421), node(3, 71.42),
            node(4, 71.422), way(1, [1, 2], layer="1"), way(2, [3, 4], layer="0")]})
        self.assertEqual(graph.route_points([71.42, 51.13], [71.421, 51.13])["kind"], "clarification")

    def test_same_node_is_zero_travel_not_invalid_one_point_linestring(self):
        graph = WalkingGraph({"elements": [node(1, 71.42), node(2, 71.421), way(1, [1, 2])]})
        self.assertEqual(graph.route(1, 1), {"kind": "already_at_endpoint", "distance_m": 0, "node_ids": [1]})

    def test_directional_foot_restriction_blocks_reverse_travel(self):
        graph = WalkingGraph({"elements": [node(1, 71.42), node(2, 71.421),
            way(1, [1, 2], **{"foot:backward": "no"})]})
        self.assertEqual(graph.route(1, 2)["kind"], "technical_path")
        self.assertEqual(graph.route(2, 1)["kind"], "no_path_in_snapshot")

    def test_continuous_wall_way_blocks_path_at_shared_node_without_gate(self):
        elements = [node(1, 71.42), node(2, 71.421), node(3, 71.422),
                    way(1, [1, 2, 3]),
                    {"type": "way", "id": 5, "nodes": [4, 2, 5], "tags": {"barrier": "wall"}}]
        self.assertNotEqual(WalkingGraph({"elements": elements}).route(1, 3)["kind"], "technical_path")


if __name__ == "__main__":
    unittest.main()
