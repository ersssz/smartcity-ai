#!/usr/bin/env python3
"""Build the prepared editorial walk from real exported foot geometry and prose.

Standard library only. No network, provider calls, path inference or source-data
downloads. The generated catalog is a prepared public-anchor experience, not
field, offline-audio or production routing acceptance.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
LOCALES = ("ru", "kk", "en")
HASH_PATTERN = re.compile(r"^[a-f0-9]{64}$")
ID_PATTERN = re.compile(r"^[0-9]+$")
ALIASES = {"bayterek": "baiterek", "nurjol": "nurzhol", "nur-zhol": "nurzhol", "roundsquare": "round-square"}
LANDMARKS = {
    "baiterek": {"ru": "Байтерек", "kk": "Бәйтерек", "en": "Baiterek"},
    "nurzhol": {"ru": "Бульвар Нуржол", "kk": "Нұржол бульвары", "en": "Nurzhol Boulevard"},
    "round-square": {"ru": "Круглая площадь", "kk": "Дөңгелек алаң", "en": "Round Square"},
    "khan-shatyr": {"ru": "Хан Шатыр", "kk": "Хан Шатыр", "en": "Khan Shatyr"},
}


class CatalogError(ValueError):
    """Input cannot support the promised catalog; do not create an output."""


def fail(message: str) -> None:
    raise CatalogError(message)


def obj(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    return value


def arr(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        fail(f"{label} must be an array")
    return value


def text(value: Any, label: str, maximum: int | None = None) -> str:
    if not isinstance(value, str) or not value.strip():
        fail(f"{label} must be a non-empty string")
    if maximum is not None and len(value) > maximum:
        fail(f"{label} exceeds {maximum} characters")
    return value


def identifier(value: Any, label: str) -> str:
    return text(value, label, 100)


def number(value: Any, label: str, *, positive: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        fail(f"{label} must be a finite number")
    result = float(value)
    if positive and result <= 0:
        fail(f"{label} must be positive")
    return result


def integer(value: Any, label: str, minimum: int = 1) -> int:
    result = number(value, label)
    if not result.is_integer() or result < minimum:
        fail(f"{label} must be an integer >= {minimum}")
    return int(result)


def localized(value: Any, label: str) -> dict[str, str]:
    value = obj(value, label)
    return {locale: text(value.get(locale), f"{label}.{locale}") for locale in LOCALES}


def coordinate(value: Any, label: str) -> list[float]:
    value = arr(value, label)
    if len(value) != 2:
        fail(f"{label} must be [longitude, latitude]; coordinate order is never inferred")
    lon, lat = (number(value[0], label + "[0]"), number(value[1], label + "[1]"))
    if not -180 <= lon <= 180 or not -90 <= lat <= 90:
        fail(f"{label} is outside longitude/latitude limits")
    return [lon, lat]


def osm_id(value: Any, label: str) -> str:
    if isinstance(value, int) and not isinstance(value, bool):
        value = str(value)
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value) or int(value) <= 0:
        fail(f"{label} must be a positive OSM numeric ID")
    return value


def sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or not HASH_PATTERN.fullmatch(value) or len(set(value)) == 1:
        fail(f"{label} must be a non-placeholder lower-case SHA256")
    return value


def timestamp(value: Any, label: str, *, allow_date: bool = False) -> str:
    value = text(value, label)
    if allow_date and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        try:
            date.fromisoformat(value)
        except ValueError:
            fail(f"{label} is not a valid calendar date")
        return value  # Preserve date precision. Never invent midnight observation time.
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        fail(f"{label} must be an ISO 8601 instant with a timezone")
    if "T" not in value or parsed.tzinfo is None:
        fail(f"{label} must be an ISO 8601 instant with a timezone")
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def https_url(value: Any, label: str) -> str:
    value = text(value, label)
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        fail(f"{label} must be an HTTPS URL without embedded credentials")
    return value


def key(value: Any) -> str:
    value = text(value, "candidateKey").strip().lower().replace("_", "-")
    if value.endswith("-outdoor"):
        value = value[:-8]
    return ALIASES.get(value, value)


def distance(a: list[float], b: list[float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6_371_008.8 * 2 * math.asin(math.sqrt(min(1.0, h)))


def indexed(records: Any, label: str, id_field: str = "id") -> dict[str, dict[str, Any]]:
    result = {}
    for record in arr(records, label):
        record = obj(record, label + "[]")
        record_id = identifier(record.get(id_field), label + "." + id_field)
        if record_id in result:
            fail(f"Duplicate {label} ID: {record_id}")
        result[record_id] = record
    return result


def references(values: Any, existing: dict[str, Any], label: str, *, required: bool = True) -> list[str]:
    result = []
    for value in arr(values, label):
        value = identifier(value, label + "[]")
        if value not in existing:
            fail(f"Unknown {label}: {value}")
        if value not in result:
            result.append(value)
    if required and not result:
        fail(f"{label} must not be empty")
    return result


def route_reference(leg: dict[str, Any], prefix: str) -> Any:
    for field in (prefix + "StopId", prefix + "StopKey", prefix + "Id", prefix):
        if field in leg:
            return leg[field]
    fail(f"Route leg requires explicit {prefix}StopId (or {prefix}StopKey)")


def build_catalog(content: dict[str, Any], route: dict[str, Any], *, budget: int = 80, meters_per_minute: float = 60, prepared_at: str | None = None) -> dict[str, Any]:
    """Pure transformation. Source hashes are declared provenance until byte-checked."""
    content = obj(content, "content")
    route = obj(route, "route")
    budget = integer(budget, "budget", 15)
    if budget > 240:
        fail("budget must be <= 240 minutes")
    speed = number(meters_per_minute, "meters-per-minute", positive=True)
    drafts = indexed(content.get("stops"), "draft stops", "stopCandidateKey")
    drafts = {key(k): value for k, value in drafts.items()}
    draft_facts = indexed(content.get("facts"), "facts")
    draft_sources = indexed(content.get("sources"), "sources")
    route_stops = arr(route.get("stops"), "route.stops")
    route_legs = arr(route.get("legs"), "route.legs")
    if not 3 <= len(route_stops) <= 6 or len(route_legs) != len(route_stops):
        fail("A closed walk requires 3-6 stops and exactly one leg per stop including return")
    selected_keys = [key(obj(s, "route.stops[]").get("candidateKey")) for s in route_stops]
    if len(selected_keys) != len(set(selected_keys)):
        fail("Duplicate route stop candidateKey")
    variants = [v for v in arr(content.get("variants"), "content.variants") if [key(k) for k in v.get("stopCandidateKeys", [])] == selected_keys]
    if len(variants) != 1:
        fail("Route stop order must match one complete editorial variant; never truncate chapters to fit")
    variant = variants[0]
    collection = content.get("baseCollectionDraft") if variant.get("collectionDraftId") == content.get("baseCollectionDraft", {}).get("id") else content.get("extensionCollectionDraft")
    collection = obj(collection, "matching collection draft")
    if collection.get("id") != variant.get("collectionDraftId"):
        fail("Editorial variant collection does not match")
    closings = indexed(content.get("closings"), "closings")
    if variant.get("closingId") not in closings:
        fail("Editorial variant closing is missing")
    route_source = obj(route.get("source", route.get("routeSource")), "route.source")
    snapshot_hash = sha256(route_source.get("snapshotSha256"), "route.source.snapshotSha256")
    graph_hash = sha256(route_source.get("graphSha256"), "route.source.graphSha256")
    route_url = https_url(route_source.get("url", route_source.get("snapshotUrl")), "route.source.url")
    if urlparse(route_url).hostname != "download.geofabrik.de":
        fail("Route snapshot URL must identify the declared Geofabrik distribution source")
    if route_source.get("license", "ODbL-1.0") != "ODbL-1.0":
        fail("Route source license must match the ODbL-1.0 public-data contract")
    export_time = prepared_at or route_source.get("preparedAt") or route.get("preparedAt")
    if not export_time:
        fail("Route preparedAt or explicit --prepared-at is required; cannot invent an export date")
    export_time = timestamp(export_time, "preparedAt")
    stops = []
    aliases = []
    used_fact_ids = set()
    for index, (raw_stop, candidate_key) in enumerate(zip(route_stops, selected_keys)):
        if candidate_key not in drafts or candidate_key not in LANDMARKS:
            fail(f"No prepared editorial content for {candidate_key}")
        draft = drafts[candidate_key]
        stop_id = identifier(raw_stop.get("id", "stop-" + candidate_key), "route stop id")
        poi_id = identifier(raw_stop.get("poiId"), "route stop poiId")
        stop_coord = coordinate(raw_stop.get("coordinate"), "route stop coordinate")
        node_id = osm_id(raw_stop.get("osmNodeId"), "route stop osmNodeId")
        quest = obj(draft.get("quest"), "draft quest")
        paragraphs = arr(draft.get("storyParagraphs"), "storyParagraphs")
        if not paragraphs:
            fail(f"Empty story at {candidate_key}")
        paragraph_fact_ids = []
        for paragraph in paragraphs:
            paragraph = obj(paragraph, "paragraph")
            refs = references(paragraph.get("factRefs"), draft_facts, "paragraph factRefs", required=paragraph.get("kind") == "sourced-fact")
            paragraph_fact_ids.extend(refs)
            localized(paragraph.get("text"), "paragraph text")
        quest_fact_ids = references(quest.get("factRefs"), draft_facts, "quest factRefs")
        stop_fact_ids = list(dict.fromkeys(paragraph_fact_ids + quest_fact_ids))
        used_fact_ids.update(stop_fact_ids)
        choices = [{"id": identifier(c.get("id"), "choice id"), "label": localized(c.get("label"), "choice label")} for c in arr(quest.get("choices"), "quest choices")]
        choice_ids = [c["id"] for c in choices]
        if not 2 <= len(choices) <= 4 or len(choice_ids) != len(set(choice_ids)) or quest.get("answerChoiceId") not in choice_ids:
            fail(f"Quest choices/answer invalid at {candidate_key}")
        used_sources = sorted({sid for fid in stop_fact_ids for sid in references(draft_facts[fid].get("sourceIds"), draft_sources, "fact sourceIds")})
        stops.append({
            "id": stop_id, "candidateKey": candidate_key, "poiId": poi_id,
            "title": LANDMARKS[candidate_key], "subtitle": localized(draft.get("subtitle"), "subtitle"),
            "coordinate": stop_coord, "osmNodeId": node_id, "visitMinutes": integer(draft.get("estimatedContentMinutes"), "estimatedContentMinutes"),
            "storyTitle": localized(draft.get("title"), "story title"),
            "story": {locale: "\n\n".join(p["text"][locale] for p in paragraphs) for locale in LOCALES},
            "observation": localized(quest.get("optionalObservation"), "observation"),
            "framing": "original_editorial_facts_and_clearly_marked_imagination",
            "factRefs": stop_fact_ids, "sourceIds": used_sources,
            "quest": {"id": identifier(quest.get("id"), "quest id"), "question": localized(quest.get("prompt"), "quest question"), "choices": choices,
                      "correctChoiceId": quest["answerChoiceId"], "hint": localized(quest.get("hint"), "quest hint"),
                      "explanation": localized(quest.get("explanation"), "quest explanation"), "factRefs": quest_fact_ids},
        })
        aliases.append({str(v) for v in (raw_stop.get("id"), raw_stop.get("poiId"), raw_stop.get("candidateKey"), raw_stop.get("stopId"), stop_id, candidate_key) if v is not None})
    if len({s["id"] for s in stops}) != len(stops):
        fail("Duplicate output stop IDs")
    start_raw = obj(route.get("startAnchor", route.get("start")), "route.startAnchor")
    start_coord = coordinate(start_raw.get("coordinate"), "startAnchor coordinate")
    start_node = osm_id(start_raw.get("osmNodeId"), "startAnchor osmNodeId")
    if start_coord != stops[0]["coordinate"] or start_node != stops[0]["osmNodeId"]:
        fail("Explicit start anchor must exactly equal the first stop, including OSM node proof")
    legs = []
    known_node_coords = {}
    for index, raw_leg in enumerate(route_legs):
        raw_leg = obj(raw_leg, "route leg")
        following = (index + 1) % len(stops)
        if str(route_reference(raw_leg, "from")) not in aliases[index] or str(route_reference(raw_leg, "to")) not in aliases[following]:
            fail("Leg order must match stops and close the cycle")
        coords = [coordinate(p, "leg coordinate") for p in arr(raw_leg.get("coordinates"), "leg coordinates")]
        nodes = [osm_id(n, "leg osmNodeId") for n in arr(raw_leg.get("osmNodeIds"), "leg osmNodeIds")]
        if len(coords) < 2 or len(coords) != len(nodes):
            fail("Every geometry point must have its corresponding OSM node ID")
        if coords[0] != stops[index]["coordinate"] or coords[-1] != stops[following]["coordinate"] or nodes[0] != stops[index]["osmNodeId"] or nodes[-1] != stops[following]["osmNodeId"]:
            fail("Leg endpoint differs from public stop anchor; no synthetic connector is permitted")
        way_ids = [osm_id(w, "sourceWayId") for w in arr(raw_leg.get("sourceWayIds"), "sourceWayIds")]
        if not way_ids:
            fail("Each leg requires sourceWayIds")
        for node, coord in zip(nodes, coords):
            if node in known_node_coords and known_node_coords[node] != coord:
                fail("One OSM node ID is associated with inconsistent coordinates")
            known_node_coords[node] = coord
        spans = [distance(a, b) for a, b in zip(coords, coords[1:])]
        if any(span <= 0 for span in spans) or any(a == b for a, b in zip(nodes, nodes[1:])):
            fail("Leg includes a zero-length or duplicate-node segment")
        measured = math.fsum(spans)
        declared = number(raw_leg.get("distanceMeters"), "leg distanceMeters", positive=True)
        if abs(measured - declared) > max(2.0, measured * 0.01):
            fail(f"Declared leg distance differs from geometry ({declared:.3f} vs {measured:.3f} metres)")
        legs.append({"id": identifier(raw_leg.get("id", f"leg-{index + 1}"), "leg id"), "fromStopId": stops[index]["id"], "toStopId": stops[following]["id"],
                     "coordinates": coords, "osmNodeIds": nodes, "sourceWayIds": list(dict.fromkeys(way_ids)),
                     "distanceMeters": round(measured, 6), "walkMinutes": round(measured / speed, 6)})
    if len({l["id"] for l in legs}) != len(legs):
        fail("Duplicate leg IDs")
    raw_walking = math.fsum(distance(a, b) for leg in legs for a, b in zip(leg["coordinates"], leg["coordinates"][1:])) / speed
    total_distance = round(math.fsum(l["distanceMeters"] for l in legs), 6)
    walking = round(math.fsum(l["walkMinutes"] for l in legs), 6)
    visiting = sum(s["visitMinutes"] for s in stops)
    reserve = max(5, math.ceil(budget * 0.1))
    total = round(walking + visiting + reserve, 6)
    if raw_walking + visiting + reserve > budget or total > budget:
        fail(f"Walk does not fit budget: {total:.3f} > {budget} minutes; refusing to truncate content or forge the return")
    fact_output = []
    for fact_id, draft_fact in draft_facts.items():
        if fact_id not in used_fact_ids:
            continue
        supporting = [p for k in selected_keys for p in drafts[k]["storyParagraphs"] if p.get("kind") == "sourced-fact" and fact_id in p.get("factRefs", [])]
        if not supporting:
            fail(f"No localized sourced paragraph supports {fact_id}")
        paragraph = supporting[0]
        # A paragraph can state two facts. Keep all their supporting sources so
        # its statement is never attributed to an insufficient single source.
        paragraph_sources = sorted({sid for fid in paragraph["factRefs"] for sid in references(draft_facts[fid].get("sourceIds"), draft_sources, "fact sourceIds")})
        fact_output.append({"id": fact_id, "statement": localized(paragraph["text"], "fact statement"), "sourceIds": paragraph_sources})
    all_source_ids = {sid for fact in fact_output for sid in fact["sourceIds"]}
    sources = []
    for source_id, source in draft_sources.items():
        if source_id in all_source_ids:
            sources.append({"id": source_id, "title": text(source.get("title"), "source title"), "url": https_url(source.get("url"), "source URL"),
                            "checkedAt": timestamp(source.get("checkedOn"), "source checkedOn", allow_date=True), "owner": text(source.get("publisher"), "source publisher"),
                            "rights": "Linked fact source; no source photographs, recordings or full text copied. Original editorial prose and translations; rights/evidence: evidence/first-walk/content-rights-and-review.md."})
    if len(stops) == 4:
        # The draft's global framing deliberately defaults to the shorter walk.
        # Keep the future extension's public copy consistent with four chapters.
        subtitle = {"ru": "Четыре формы. Четыре способа увидеть Астану.", "kk": "Төрт пішін. Астананы танудың төрт тәсілі.", "en": "Four forms. Four ways to notice Astana."}
        description = {"ru": "Авторская игра наблюдения: дерево, линия, круг и укрытие — наши ключи к прогулке. Это предложенное прочтение города, а не исторический шифр или замысел всех архитекторов.", "kk": "Авторлық байқау ойыны: ағаш, сызық, шеңбер және пана — серуендегі төрт кілтіміз. Бұл қаланы танып көру тәсілі; тарихи құпия таңба да, барлық сәулетшінің ортақ ойы да емес.", "en": "An original observation game: tree, line, circle and shelter are our four keys. This is an invitation to read the city, not a historical code or a claim about every architect's intentions."}
    else:
        subtitle = localized(content.get("subtitle"), "walk subtitle")
        description = localized(content.get("narrativeLabel"), "narrative framing")
    return {
        "schemaVersion": 1, "kind": "prepared_editorial_walk", "id": "astana-three-forms" if len(stops) == 3 else "astana-four-forms", "revision": integer(content.get("revision"), "content revision"),
        "title": localized(content.get("title"), "walk title"), "subtitle": subtitle,
        "description": description, "collectionTitle": localized(collection.get("title"), "collection title"),
        "collectionDescription": localized(collection.get("description"), "collection description"), "closing": localized(closings[variant["closingId"]]["text"], "closing"),
        "startAnchor": {"id": identifier(start_raw.get("id", "public-start"), "startAnchor id"), "label": localized(start_raw.get("label", stops[0]["title"]), "startAnchor label"), "coordinate": start_coord, "osmNodeId": start_node},
        "endRule": "return_to_start", "stops": stops, "legs": legs,
        "timing": {"budgetMinutes": budget, "walkMinutes": walking, "visitMinutes": visiting, "reserveMinutes": reserve, "totalMinutes": total, "distanceMeters": total_distance, "assumedMetersPerMinute": speed},
        "sources": sources, "facts": fact_output,
        "routeSource": {"url": route_url, "snapshotSha256": snapshot_hash, "graphSha256": graph_hash, "preparedAt": export_time,
                        "license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors; Open Database License (ODbL) 1.0. Public snapshot distributed by Geofabrik.", "fieldVerified": False},
        "availability": {"textAndRouteBundled": True, "baseMap": "online", "preparedAudio": "unavailable", "humanTranslationReview": "pending"},
    }


def no_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result = {}
    for k, v in pairs:
        if k in result:
            fail(f"Duplicate JSON key: {k}")
        result[k] = v
    return result


def read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        fail(f"NOT_READY: required input missing: {path}")
    try:
        return obj(json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=no_duplicate_keys, parse_constant=lambda value: fail(f"Invalid JSON numeric literal {value}")), str(path))
    except (UnicodeError, json.JSONDecodeError) as exc:
        fail(f"Invalid JSON input {path}: {exc}")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Do not leave a half-written public catalog after an interrupted write.
    temporary = path.with_name(path.name + ".pending")
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def refusal_checks(content: dict[str, Any]) -> dict[str, Any]:
    """Synthetic in-memory malformed inputs only; never publish their geometry."""
    points = [[71.0, 51.0], [71.001, 51.0], [71.001, 51.001]]
    keys = ["baiterek", "nurzhol", "round-square"]
    synthetic = {"source": {"url": "https://download.geofabrik.de/asia/kazakhstan-latest.osm.pbf", "snapshotSha256": hashlib.sha256(b"synthetic snapshot, not OSM evidence").hexdigest(), "graphSha256": hashlib.sha256(b"synthetic graph, not OSM evidence").hexdigest(), "preparedAt": "2026-10-20T00:00:00Z"},
                 "stops": [{"id": k, "candidateKey": k, "poiId": "synthetic-" + k, "coordinate": p, "osmNodeId": str(i + 1)} for i, (k, p) in enumerate(zip(keys, points))],
                 "startAnchor": {"id": "synthetic-start", "coordinate": points[0], "osmNodeId": "1"},
                 "legs": [{"id": "synthetic-leg-" + str(i), "fromStopId": keys[i], "toStopId": keys[(i + 1) % 3], "coordinates": [points[i], points[(i + 1) % 3]], "osmNodeIds": [str(i + 1), str((i + 1) % 3 + 1)], "sourceWayIds": [str(i + 100)], "distanceMeters": distance(points[i], points[(i + 1) % 3])} for i in range(3)]}
    # A positive in-memory shape check prevents all negative cases from passing
    # merely because an unrelated earlier transformation always throws. This
    # synthetic result is never returned as a real walk or written to output.
    baseline = build_catalog(content, synthetic)
    if baseline["timing"]["visitMinutes"] != 18 or baseline["sources"][0]["checkedAt"] != content["sources"][0]["checkedOn"] or baseline["stops"][0]["quest"]["correctChoiceId"] != content["stops"][0]["quest"]["answerChoiceId"]:
        raise AssertionError("Synthetic in-memory mapping violates content/date/quest contract")
    results = [{"name": "synthetic valid-shape mapping keeps date precision and quest answer", "passed": True, "productionCatalogWritten": False}]
    cases = []
    broken = copy.deepcopy(synthetic); del broken["source"]["graphSha256"]
    cases.append(("missing graph provenance refused", broken, {}, "graphSha256"))
    broken = copy.deepcopy(synthetic); broken["legs"][0]["osmNodeIds"].pop()
    cases.append(("unbacked geometry point refused", broken, {}, "Every geometry point"))
    broken = copy.deepcopy(synthetic); broken["legs"][2]["coordinates"][-1] = [71.00001, 51.0]
    cases.append(("invented return connector refused", broken, {}, "Leg endpoint differs"))
    broken = copy.deepcopy(synthetic); broken["legs"][0]["distanceMeters"] += 100
    cases.append(("false declared distance refused", broken, {}, "Declared leg distance differs"))
    broken = copy.deepcopy(synthetic); broken["legs"][1]["sourceWayIds"] = []
    cases.append(("missing source way proof refused", broken, {}, "sourceWayIds"))
    cases.append(("overbudget walk refused without dropping content", copy.deepcopy(synthetic), {"budget": 15}, "does not fit budget"))
    broken = copy.deepcopy(synthetic); broken["startAnchor"]["osmNodeId"] = "999"
    cases.append(("start must be first public anchor", broken, {}, "Explicit start anchor"))
    for name, fixture, kwargs, expected in cases:
        try:
            build_catalog(content, fixture, **kwargs)
        except CatalogError as exc:
            if expected not in str(exc):
                raise AssertionError(f"{name}: wrong rejection: {exc}") from exc
            results.append({"name": name, "passed": True, "rejection": str(exc)})
        else:
            raise AssertionError(f"{name}: malformed input was accepted")
    return {"kind": "synthetic-in-memory-refusal-checks", "passed": True, "checks": results, "productionCatalogWritten": False, "limitation": "Invented node IDs and hashes are test fixtures; these checks do not verify any real OSM edge, live route, field condition or device."}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", type=Path, default=ROOT / "content/first-walk/content-draft.json")
    parser.add_argument("--route", type=Path, default=ROOT / "data/first-walk/route-candidate.json")
    parser.add_argument("--output", type=Path, default=ROOT / "apps/mobile/src/walk/preparedWalk.json")
    parser.add_argument("--budget", type=int, default=80)
    parser.add_argument("--meters-per-minute", type=float, default=60)
    parser.add_argument("--prepared-at", help="Explicit real export/build instant if route.source.preparedAt is absent; output otherwise uses route provenance unchanged.")
    parser.add_argument("--snapshot-file", type=Path, help="Optional snapshot bytes to verify against supplied snapshotSha256.")
    parser.add_argument("--graph-file", type=Path, help="Optional graph/witness bytes to verify against supplied graphSha256; graph membership still requires independent verification.")
    parser.add_argument("--report", type=Path, help="Write machine-readable status/evidence, including NOT_READY without a catalog if inputs are missing.")
    parser.add_argument("--self-test", action="store_true", help="Run only synthetic in-memory malformed-input refusal checks. Never write a production catalog.")
    args = parser.parse_args(argv)
    report: dict[str, Any] = {"tool": "tools/first_walk/build_catalog.py", "status": "NOT_READY", "productionCatalogWritten": False}
    try:
        content = read_json(args.content)
        if args.self_test:
            report = refusal_checks(content)
            if args.report:
                write_json(args.report, report)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0
        route = read_json(args.route)
        catalog = build_catalog(content, route, budget=args.budget, meters_per_minute=args.meters_per_minute, prepared_at=args.prepared_at)
        byte_checks = {}
        for label, source_path, expected in (("snapshot", args.snapshot_file, catalog["routeSource"]["snapshotSha256"]), ("graph", args.graph_file, catalog["routeSource"]["graphSha256"])):
            if source_path is None:
                byte_checks[label] = {"status": "supplied-hash-not-byte-verified"}
            else:
                if not source_path.is_file():
                    fail(f"NOT_READY: {label} source bytes missing: {source_path}")
                actual = file_sha256(source_path)
                if actual != expected:
                    fail(f"{label} source byte hash differs from route provenance")
                byte_checks[label] = {"status": "sha256-byte-match", "sha256": actual}
        write_json(args.output, catalog)
        report.update({"status": "BUILT_PENDING_INDEPENDENT_GRAPH_AND_SCHEMA_REVIEW", "productionCatalogWritten": True, "output": str(args.output), "outputSha256": file_sha256(args.output),
                       "inputs": {"contentSha256": file_sha256(args.content), "routeSha256": file_sha256(args.route)}, "byteChecks": byte_checks,
                       "timing": catalog["timing"], "limitations": ["This tool does not prove graph-edge membership from IDs alone.", "Zod/public-contract parsing and independent source-edge checks belong to root.", "Not field verified; base map online; prepared audio unavailable; human translation review pending."]})
        if args.report:
            write_json(args.report, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (CatalogError, OSError, ValueError, KeyError, TypeError) as exc:
        report["status"] = "NOT_READY" if "NOT_READY" in str(exc) else "REFUSED"
        report["error"] = str(exc)
        if args.report:
            write_json(args.report, report)
        print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
