"""Offline, hash-pinned CityEvidence preparation. Standard library only; no IO outside source reads/output file."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import argparse
import hashlib
import json

PACKAGE = Path(__file__).resolve().parents[1]
ROOT = PACKAGE.parents[1]


def localized(ru, kk, en):
    return {"ru": ru, "kk": kk, "en": en}


def unknown(reason, source_ids=None):
    return {"state": "unknown", "reason": reason, "sourceIds": source_ids or []}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify prepared output without writing it")
    args = parser.parse_args()
    lock_bytes = (PACKAGE / "fixtures/curation.json").read_bytes()
    lock = json.loads(lock_bytes)
    inputs = {}
    for path, expected in lock["sourcePins"].items():
        raw = (ROOT / path).read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected:
            raise ValueError("Pinned source changed: " + path)
        inputs[path] = json.loads(raw)
    osm = inputs["data/curated/poi-bayterek.json"]
    walk = inputs["apps/mobile/src/walk/preparedWalk.json"]
    witness = inputs["evidence/first-walk/routing-source.json"]
    if len(osm["cards"]) != 20 or len(walk["stops"]) != 3:
        raise ValueError("Unexpected bounded catalog scope")
    zone = lock["zoneId"]
    sources, facts, pois, anchors = [], [], [], []
    for card in osm["cards"]:
        source_id = "osm-source:" + card["id"].removeprefix("osm:").replace("/", ":")
        fetched = card["source_fetched_at"]
        expiry = (datetime.fromisoformat(fetched.replace("Z", "+00:00")) + timedelta(days=7)).astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        sources.append({"id": source_id, "title": "OpenStreetMap record " + card["id"], "url": card["source_url"], "checkedAt": fetched, "rights": "OpenStreetMap contributors; ODbL-1.0; " + card["license_url"]})
        original = card["fields"]["name"]["value"]
        names = {locale: card["names"].get(locale) or original for locale in ("ru", "kk", "en")}
        fact_id = "osm-name:" + card["id"].removeprefix("osm:").replace("/", ":")
        facts.append({"id": fact_id, "statement": localized("Название в OpenStreetMap: «" + original + "».", "OpenStreetMap-тағы атауы: «" + original + "».", "Name recorded in OpenStreetMap: “" + original + "”."), "sourceIds": [source_id], "checkedAt": fetched, "validUntil": expiry})
        raw_category = card["fields"]["category"]["value"]
        if raw_category.startswith("historic:"):
            category = "landmark"
        elif raw_category in ("tourism:artwork", "tourism:gallery"):
            category = "culture"
        elif raw_category == "leisure:park":
            category = "park"
        elif raw_category == "tourism:museum":
            category = "museum"
        elif raw_category in ("amenity:cafe", "amenity:coffee_shop"):
            category = "cafe"
        else:
            category = "other"
        center = card["fields"]["coordinates"]
        known = center["state"] == "known" and center["value"] is not None
        pois.append({"id": card["id"], "names": names,
            "aliases": {locale: list(dict.fromkeys([original, *card["names"].values()])) for locale in ("ru", "kk", "en")},
            "zoneIds": [zone], "categories": [category],
            "center": {"state": "known", "value": center["value"], "sourceIds": [source_id], "observedAt": fetched, "validUntil": expiry} if known else {"state": center["state"], "reason": center.get("reason") or "No usable source center", "sourceIds": [source_id]},
            "anchorIds": [], "access": unknown("No confirmed public approach/access evidence", [source_id]),
            "opening": unknown("Raw OSM hours are not a current parsed schedule", [source_id]),
            "services": {"coffee": unknown("No confirmed coffee service", [source_id])}, "factRefs": [fact_id], "sourceIds": [source_id]})
    sources.extend({k: s[k] for k in ("id", "title", "url", "checkedAt", "rights")} for s in walk["sources"])
    graph_source_id = "osm-first-walk-source"
    fetched_at = witness["provenance"]["fetchedAt"]
    sources.append({"id": graph_source_id, "title": "OpenStreetMap retained public-footway source witness", "url": walk["routeSource"]["url"], "checkedAt": fetched_at, "rights": "OpenStreetMap contributors; ODbL-1.0; witness SHA-256 " + lock["sourcePins"]["evidence/first-walk/routing-source.json"]})
    source_by_id = {s["id"]: s for s in sources}
    for fact in walk["facts"]:
        facts.append({**fact, "checkedAt": max(source_by_id[s]["checkedAt"] for s in fact["sourceIds"])})
    stop_by_id = {s["id"]: s for s in walk["stops"]}
    poi_by_id = {p["id"]: p for p in pois}
    witness_nodes = {str(e["id"]): [e["lon"], e["lat"]] for e in witness["elements"] if e["type"] == "node"}
    for mapping in lock["mappings"]:
        stop = stop_by_id[mapping["preparedStopId"]]
        if stop["candidateKey"] != mapping["candidateKey"] or mapping["fieldVerified"] is not False:
            raise ValueError("Curation must match the exact prepared candidate without field claims")
        if witness_nodes.get(str(stop["osmNodeId"])) != stop["coordinate"]:
            raise ValueError("Curated anchor is absent from the exact retained source")
        if any(s not in stop["sourceIds"] for s in mapping["identitySourceIds"]):
            raise ValueError("Curation identity source differs from prepared editorial provenance")
        anchors.append({"id": stop["id"], "coordinate": stop["coordinate"], "graphNodeId": stop["osmNodeId"], "sourceIds": [graph_source_id, *mapping["identitySourceIds"]], "checkedAt": fetched_at, "fieldVerified": False})
        place = poi_by_id.get(mapping["placeId"])
        if place is None:
            place = {"id": mapping["placeId"], "names": stop["title"], "aliases": {locale: [] for locale in ("ru", "kk", "en")}, "zoneIds": [zone], "categories": mapping["categories"], "center": unknown("No sourced object center; observation anchor is separate"), "anchorIds": [], "access": unknown("Prepared outdoor observation anchor is not current access or an indoor entrance"), "opening": unknown("No current parsed schedule"), "services": {"coffee": unknown("No confirmed coffee service")}, "factRefs": [], "sourceIds": mapping["identitySourceIds"][:]}
            pois.append(place)
            poi_by_id[place["id"]] = place
        for locale in ("ru", "kk", "en"):
            place["aliases"][locale] = list(dict.fromkeys([*place["aliases"][locale], *stop["title"].values()]))
        place["anchorIds"].append(stop["id"])
        place["factRefs"] = list(dict.fromkeys([*place["factRefs"], *stop["factRefs"]]))
        place["sourceIds"] = list(dict.fromkeys([*place["sourceIds"], graph_source_id, *mapping["identitySourceIds"]]))
    limitations = [
        localized("20 выбранных OSM-карточек из 247 записей одной зоны и 2 дополнительные редакционные идентичности; каталог города неполон.", "Бір аймақтағы 247 жазбадан таңдалған 20 OSM карточкасы және 2 қосымша редакциялық орын; қала каталогы толық емес.", "20 selected OSM cards from 247 records in one zone plus 2 additional curated identities; this is not a complete city catalog."),
        localized("Три наружные точки наблюдения подготовлены по сохранённому графу; входы, текущая проходимость и поле не подтверждены.", "Үш сыртқы бақылау нүктесі сақталған графтан дайындалған; кіреберістер, қазіргі өту мүмкіндігі және далалық тексеріс расталмаған.", "Three outdoor observation anchors use a retained graph; entrances, current passage and field access are unverified."),
        localized("Нет подтверждённых актуальных часов, indoor-доступа, кофе, безбарьерного маршрута, погоды или праздничных исключений.", "Өзекті жұмыс уақыты, ішке кіру, кофе, кедергісіз маршрут, ауа райы және мерекелік ерекшеліктер расталмаған.", "Current hours, indoor access, coffee, step-free routing, weather and holiday exceptions are unconfirmed."),
        localized("При отсутствии перевода показано исходное собственное имя. Редакторские переводы KK/EN ожидают человеческой проверки.", "Аударма болмаса, бастапқы жалқы атау көрсетіледі. KK/EN редакциялық аудармалары адам тексерісін күтуде.", "Missing translations display the original proper name. Editorial KK/EN translations await human review."),
    ]
    payload = {"evaluatedAt": osm["evaluated_at"], "coverage": {"zoneIds": [zone], "scope": "sample", "complete": False, "limitations": limitations}, "pois": pois, "anchors": anchors, "facts": facts, "sources": sources, "context": {"evaluatedAt": osm["evaluated_at"], "season": "autumn", "weather": unknown("No weather snapshot collected"), "calendar": unknown("No dated holiday/venue exceptions collected")}}
    revision_input = json.dumps({"curation": lock, "payload": payload}, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    revision = "city-evidence-" + hashlib.sha256(revision_input).hexdigest()[:16]
    catalog = {"revision": revision, **payload}
    text = "// Generated offline by tools/build_catalog.py; see fixtures/curation.json. Do not edit.\nexport default " + json.dumps(catalog, ensure_ascii=False, indent=2) + ";\n"
    output = PACKAGE / "src/catalog.generated.ts"
    if args.check:
        if output.read_bytes() != text.encode("utf-8"):
            raise ValueError("Prepared output is not the deterministic replay of pinned inputs")
    else:
        output.write_text(text, encoding="utf-8", newline="\n")
    print(json.dumps({"revision": revision, "pois": len(pois), "anchors": len(anchors), "facts": len(facts), "sources": len(sources), "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    main()
