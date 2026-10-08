"""Command-line entry point: `pci <command>`."""

import argparse
import logging
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pci", description="PCI Map data pipeline")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("fetch-index", help="scrape the inventory page into data/index.json")
    sub.add_parser("fetch-fiches", help="download pilot fiche PDFs into data/raw/")
    sub.add_parser("extract-text", help="extract fiche text into data/text/")
    sub.add_parser("fetch-pcilab", help="PCI Lab points and localisations -> data/raw/pcilab.json")
    sub.add_parser("geocode", help="geocode curated places into data/geocode-cache.json")
    sub.add_parser("build", help="validate curated data and write the site's elements.json")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if args.command == "fetch-index":
        from pci.index import fetch_index

        records = fetch_index()
        themes = sorted({t for r in records for t in r["themes"]})
        print(f"{len(records)} elements across {len(themes)} themes -> data/index.json")
        return 0
    if args.command in ("fetch-fiches", "extract-text"):
        from pci import fiches

        ids = fiches.read_pilot()
        run = fiches.fetch_fiches if args.command == "fetch-fiches" else fiches.extract_text
        manifest = run(ids)
        statuses = [manifest.get(i, {}).get("status", "missing") for i in ids]
        failed = [i for i, s in zip(ids, statuses, strict=True) if s != "ok"]
        print(f"{len(ids) - len(failed)}/{len(ids)} fiches ok; not ok: {failed}")
        return 0
    if args.command == "fetch-pcilab":
        import json

        from pci.pcilab import PCILAB_JSON, fetch_pcilab

        records = fetch_pcilab()
        PCILAB_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=1) + "\n")
        located = sum(1 for r in records if r["localisation"])
        print(f"{len(records)} PCI Lab fiches, {located} with a localisation -> {PCILAB_JSON}")
        return 0
    if args.command == "geocode":
        from pci.build import all_places
        from pci.geocode import geocode_all

        cache = geocode_all(all_places())
        print(f"{len(cache)} places in data/geocode-cache.json")
        return 0
    from pci.build import BuildError, build, build_inventory
    from pci.mediation import MediationError, build_mediation

    try:
        elements = build()
        count = build_inventory()
        sheets = build_mediation({e["id"] for e in elements})
    except (BuildError, MediationError) as exc:
        print(f"build failed:\n{exc}", file=sys.stderr)
        return 1
    print(f"{len(elements)} curated elements -> web/public/data/elements.json")
    print(f"{count} inventory entries -> web/public/data/inventory.json")
    print(f"{sheets} mediation sheets -> web/public/data/mediation.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
