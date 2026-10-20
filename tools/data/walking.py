"""Conservative local OSM pedestrian research graph, NOT a deployment adapter.

Interface: WalkingGraph(overpass_document).route(start_node_id, end_node_id).
Only exact mapped nodes are accepted. No snapping or invented access connector.
Returned geometry is technical OSM evidence, never a field accessibility claim.
"""
import heapq
import math


def distance_m(a, b):
    """WGS84 spherical distance for graph edge weights (not a walking route)."""
    x1, y1, x2, y2 = map(math.radians, (*a, *b))
    h = math.sin((y2-y1)/2)**2 + math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


class WalkingGraph:
    HIGHWAYS = {"footway", "pedestrian", "path", "steps", "living_street",
                "residential", "service", "unclassified", "tertiary",
                "secondary", "primary", "tertiary_link", "secondary_link", "primary_link"}
    ALLOWED = {"yes", "designated", "permissive", "official"}
    PASSABLE_BARRIERS = {"no", "entrance"}

    def __init__(self, document):
        self.nodes = {e["id"]: e for e in document["elements"] if e["type"] == "node"}
        self.ways = {e["id"]: e for e in document["elements"] if e["type"] == "way"}
        self.edges = {}
        self.walk_nodes = set()
        self.linear_barrier_nodes = set()
        for way in self.ways.values():
            barrier = way.get("tags", {}).get("barrier")
            if barrier and barrier not in self.PASSABLE_BARRIERS:
                self.linear_barrier_nodes.update(way["nodes"])
        self.stats = {"source_ways": len(self.ways), "accepted_ways": 0,
                      "excluded_ways": 0, "blocked_segments": 0}
        # Conditional restrictions and relation restrictions are not guessed.
        self.restricted_ways = set()
        for e in document["elements"]:
            if e["type"] == "relation" and e.get("tags", {}).get("type") == "restriction":
                self.restricted_ways.update(m["ref"] for m in e.get("members", []) if m["type"] == "way")
        for way_id, way in self.ways.items():
            tags = way.get("tags", {})
            if way_id in self.restricted_ways or not self._walkable(tags):
                self.stats["excluded_ways"] += 1
                continue
            self.stats["accepted_ways"] += 1
            direction = tags.get("oneway:foot", "no")
            for a, b in zip(way["nodes"], way["nodes"][1:]):
                if a not in self.nodes or b not in self.nodes or not all(self._node_passable(n) for n in (a, b)):
                    self.stats["blocked_segments"] += 1
                    continue
                cost = distance_m(self.point(a), self.point(b))
                self.walk_nodes.update((a, b))
                forward_access = tags.get("foot:forward", tags.get("access:forward", "yes"))
                backward_access = tags.get("foot:backward", tags.get("access:backward", "yes"))
                if direction != "-1" and forward_access in self.ALLOWED:
                    self.edges.setdefault(a, []).append((b, cost, way_id))
                if direction not in {"yes", "1", "true"} and backward_access in self.ALLOWED:
                    self.edges.setdefault(b, []).append((a, cost, way_id))

    @classmethod
    def _walkable(cls, tags):
        if tags.get("area") == "yes" or tags.get("indoor") in {"yes", "room", "corridor"}:
            return False
        if any("conditional" in key for key in tags):
            return False
        if tags.get("highway") not in cls.HIGHWAYS:
            return False
        foot = tags.get("foot")
        if foot is not None and foot not in cls.ALLOWED:
            return False
        if foot is None and tags.get("access", "yes") not in cls.ALLOWED:
            return False
        if tags.get("sidewalk") == "no" and foot not in cls.ALLOWED:
            return False
        if tags.get("oneway:foot", "no") not in {"no", "0", "false", "yes", "1", "true", "-1"}:
            return False
        if tags.get("conveying", "no") != "no":
            return False
        return True

    def _node_passable(self, node_id):
        tags = self.nodes[node_id].get("tags", {})
        if any("conditional" in key for key in tags) or tags.get("locked") == "yes":
            return False
        if tags.get("foot", tags.get("access", "yes")) not in self.ALLOWED:
            return False
        barrier = tags.get("barrier")
        if node_id in self.linear_barrier_nodes and barrier not in self.PASSABLE_BARRIERS and tags.get("foot") not in self.ALLOWED:
            return False
        # A gate/bollard with explicit foot permission is data; an untagged gate is unknown.
        return not barrier or barrier in self.PASSABLE_BARRIERS or tags.get("foot") in self.ALLOWED

    def point(self, node_id):
        node = self.nodes[node_id]
        return [node["lon"], node["lat"]]

    def route(self, start, end):
        if start not in self.walk_nodes or end not in self.walk_nodes:
            return {"kind": "unmatched_endpoint", "reason": "exact_mapped_walk_node_required"}
        if start == end:
            return {"kind": "already_at_endpoint", "distance_m": 0, "node_ids": [start]}
        best, previous, queue = {start: 0.0}, {}, [(0.0, start)]
        while queue:
            cost, here = heapq.heappop(queue)
            if cost != best[here]:
                continue
            if here == end:
                nodes, ways = [end], []
                while nodes[-1] != start:
                    parent, way_id = previous[nodes[-1]]
                    nodes.append(parent)
                    ways.append(way_id)
                nodes.reverse()
                ways.reverse()
                return {"kind": "technical_path", "node_ids": nodes, "way_ids": ways,
                        "distance_m": round(cost, 2),
                        "geometry": {"type": "LineString", "coordinates": [self.point(n) for n in nodes]},
                        "endpoint_mode": "exact_public_osm_nodes", "snap_distance_m": 0,
                        "connector": "not_required_for_exact_node_probe",
                        "field_verified": False, "profile": "local_conservative_foot_v1"}
            for target, length, way_id in self.edges.get(here, []):
                candidate = cost + length
                if candidate < best.get(target, math.inf):
                    best[target] = candidate
                    previous[target] = here, way_id
                    heapq.heappush(queue, (candidate, target))
        return {"kind": "no_path_in_snapshot", "reason": "disconnected_or_restricted"}

    def route_points(self, start, end):
        """Research exact-point interface: refuse all off-node points, including tiny gaps."""
        matches = {}
        for n in self.walk_nodes:
            matches.setdefault(tuple(self.point(n)), []).append(n)
        candidates_a, candidates_b = matches.get(tuple(start), []), matches.get(tuple(end), [])
        a = candidates_a[0] if len(candidates_a) == 1 else None
        b = candidates_b[0] if len(candidates_b) == 1 else None
        if a is None or b is None:
            return {"kind": "clarification", "reason": "choose_start_or_end_no_verified_connector",
                    "requested_endpoints_preserved": True}
        return self.route(a, b)
