"""Reproducible research POI ingestion; this is not the shared mobile contract.

Public seam: normalize(raw_bytes, metadata, *, now) -> research dataset.
OSM tags are attributed observations, not field-verified access/open status.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path


LICENSE = "ODbL-1.0"
LICENSE_URL = "https://www.openstreetmap.org/copyright"


def instant(value):
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("UTC/offset timestamp required")
    return result.astimezone(timezone.utc)


def _field(value=None, *, source=None, reason=None, state=None):
    return {"state": state or ("known" if value is not None else "unknown"),
            "value": value, "source_refs": [source] if source else [], "reason": reason}


def resolve_field(observations, *, at):
    """Resolve dated structured observations without hiding disagreement.

    Seasonal evidence MUST declare its dated valid_from/valid_until interval.
    Expired evidence stays stale, future/other-season evidence is inapplicable.
    Official current evidence is the proposed editorial preference in a conflict;
    it never makes conflicting indoor availability automatically feasible.
    """
    current = instant(at)
    eligible, expired = [], []
    for observation in observations:
        if observation.get("value") is None:
            continue
        observed = instant(observation["observed_at"])
        if observed > current:
            continue
        valid_from = instant(observation["valid_from"]) if observation.get("valid_from") else observed
        if current < valid_from:
            continue
        if not observation.get("valid_until") or current >= instant(observation["valid_until"]):
            expired.append(observation)
        else:
            eligible.append(observation)
    if not eligible:
        result = _field(state="stale" if expired else "unknown", reason="No current applicable structured evidence")
        result["source_refs"] = sorted({x["source_ref"] for x in expired})
        result["observations"] = observations
        return result
    unique = {json.dumps(x["value"], sort_keys=True, ensure_ascii=False) for x in eligible}
    preferred = max(eligible, key=lambda x: (x.get("source_kind") == "official", instant(x["observed_at"])))
    conflict = len(unique) > 1
    result = _field(None if conflict else preferred["value"], state="conflicting" if conflict else "known",
                    reason="Disagreement retained for editorial resolution" if conflict else "Current dated evidence")
    result["source_refs"] = sorted({x["source_ref"] for x in eligible})
    result["observations"] = observations
    result["preferred_source_ref"] = preferred["source_ref"]
    result["preferred_value"] = preferred["value"]
    return result


def normalize(raw_bytes, metadata, *, now):
    """Validate source hash, deduplicate IDs, preserve uncertainty; no network IO."""
    checksum = hashlib.sha256(raw_bytes).hexdigest()
    if checksum != metadata["sha256"]:
        raise ValueError("Raw source SHA-256 mismatch")
    fetched = instant(metadata["fetched_at"])
    current = instant(now)
    if fetched > current:
        raise ValueError("Source fetched_at is in the future")
    document = json.loads(raw_bytes)
    if document.get("remark"):
        raise ValueError("Overpass reported incomplete/error response")
    elements = {}
    duplicates = 0
    for element in document["elements"]:
        key = (element["type"], element["id"])
        if key in elements:
            duplicates += 1
            # Recursive Overpass output repeats skeletons; prefer complete records.
            old = elements[key]
            old_version, new_version = old.get("version", 0), element.get("version", 0)
            if new_version < old_version or (new_version == old_version and
                                             len(element.get("tags", {})) <= len(old.get("tags", {}))):
                continue
        elements[key] = element
    cards, quarantine = [], []
    for (kind, osm_id), element in sorted(elements.items()):
        tags = element.get("tags", {})
        name = tags.get("name") or tags.get("name:ru") or tags.get("name:kk") or tags.get("name:en")
        category = next((f"{key}:{tags[key]}" for key in ("tourism", "historic", "amenity", "leisure") if key in tags), None)
        if not name or not category:
            continue
        coords = element if kind == "node" else element.get("center", {})
        lat, lon = coords.get("lat"), coords.get("lon")
        if lat is None or lon is None:
            quarantine.append({"id": f"osm:{kind}/{osm_id}", "coordinates": _field(reason="No source point/center; graph-only record not usable as located POI")})
            continue
        if lat is not None and lon is not None:
            if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError("Invalid source coordinate")
            bounds = metadata.get("bbox_south_west_north_east")
            if bounds and not (bounds[0] <= lat <= bounds[2] and bounds[1] <= lon <= bounds[3]):
                continue
        ref = f"https://www.openstreetmap.org/{kind}/{osm_id}"
        observed = _field(source=ref, reason="No parsed, dated, independently confirmed interval; raw tag retained")
        observed["raw"] = tags.get("opening_hours")
        age = (current - fetched).total_seconds()
        snapshot_state = "stale" if age > 7 * 86400 else "known"
        fields = {
            "name": _field(name, source=ref, state=snapshot_state),
            "coordinates": _field([lon, lat] if lon is not None and lat is not None else None,
                                  source=ref, state=snapshot_state if lon is not None and lat is not None else "unknown",
                                  reason="OSM point" if kind == "node" else "OSM bounding-box center; not an entrance"),
            "category": _field(category, source=ref, state=snapshot_state),
            "opening_hours": observed,
            "outdoor_anchor": _field(reason="No verified outdoor approach/entrance evidence; center is not an anchor"),
            "accessibility": _field(reason="OSM wheelchair tag alone is not a verified accessible walking approach"),
        }
        cards.append({"id": f"osm:{kind}/{osm_id}", "osm_type": kind, "osm_id": osm_id,
                      "source_url": ref, "source_fetched_at": metadata["fetched_at"],
                      "source_sha256": checksum, "source_element_timestamp": element.get("timestamp"),
                      "license": LICENSE, "license_url": LICENSE_URL, "fields": fields,
                      "names": {k[5:]: v for k, v in tags.items() if k.startswith("name:") and k[5:] in ("ru", "kk", "en")},
                      "raw_tags": tags, "field_verified": False})
    possible = []
    for i, a in enumerate(cards):
        for b in cards[i+1:]:
            if a["fields"]["name"]["value"].casefold().strip() != b["fields"]["name"]["value"].casefold().strip():
                continue
            ca, cb = a["fields"]["coordinates"]["value"], b["fields"]["coordinates"]["value"]
            if ca and cb and abs(ca[0]-cb[0]) < .0003 and abs(ca[1]-cb[1]) < .0002:
                possible.append({"ids": [a["id"], b["id"]], "decision": "retain_pending_review",
                                 "reason": "Nearby equal names may describe distinct parts; no automatic semantic merge"})
    return {"research_format_version": 1, "evaluated_at": now, "source": dict(metadata), "license": LICENSE,
            "attribution": "© OpenStreetMap contributors", "attribution_url": LICENSE_URL,
            "coverage": {"zone": "Bayterek research bounding box, Astana", "cards": len(cards),
                         "input_elements": len(document["elements"]), "unique_elements": len(elements),
                         "repeated_osm_ids_removed": duplicates, "possible_semantic_duplicates": possible,
                         "quarantined_records": quarantine,
                         "coordinate_cards": sum(c["fields"]["coordinates"]["value"] is not None for c in cards),
                         "raw_hours_cards": sum(c["fields"]["opening_hours"]["raw"] is not None for c in cards),
                         "named_by_locale": {locale: sum(locale in c["names"] for c in cards) for locale in ("ru", "kk", "en")},
                         "unique_source_records": len(cards), "structured_current_hours_cards": 0,
                         "field_state_counts": {
                             key: {state: sum(c["fields"][key]["state"] == state for c in cards)
                                   for state in ("known", "unknown", "stale", "conflicting")}
                             for key in ("name", "coordinates", "category", "opening_hours", "outdoor_anchor", "accessibility")},
                         "verified_outdoor_anchors": 0, "city_completeness": "unknown"},
            "cards": cards}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--as-of", required=True, help="Explicit UTC timestamp for deterministic freshness")
    parser.add_argument("--limit", type=int, help="Optional frozen sample: heritage, visitor attractions, parks, then other POIs; stable OSM ID order")
    args = parser.parse_args()
    result = normalize(args.raw.read_bytes(), json.loads(args.metadata.read_text(encoding="utf-8-sig")), now=args.as_of)
    if args.limit is not None:
        if args.limit <= 0:
            parser.error("--limit must be positive")
        def priority(card):
            category = card["fields"]["category"]["value"]
            visitor = {"tourism:museum", "tourism:gallery", "tourism:artwork", "tourism:attraction", "tourism:aquarium", "tourism:theme_park"}
            return (0 if category.startswith("historic:") else 1 if category in visitor else 2 if category == "leisure:park" else 3,
                    card["osm_type"], card["osm_id"])
        result["cards"] = sorted(result["cards"], key=priority)[:args.limit]
        result["selection"] = {"kind": "frozen_research_sample", "requested": args.limit,
                               "selected_cards": len(result["cards"]),
                               "rule": "historic, visitor attractions, park, other; stable OSM type and ID order",
                               "coverage_describes": "complete imported bbox catalog before sampling"}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["coverage"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
