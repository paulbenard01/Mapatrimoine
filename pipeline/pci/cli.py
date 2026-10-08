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
    sub.add_parser("build", help="validate curated data and write the site's elements.json")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    if args.command == "fetch-index":
        from pci.index import fetch_index

        records = fetch_index()
        themes = sorted({t for r in records for t in r["themes"]})
        print(f"{len(records)} elements across {len(themes)} themes -> data/index.json")
        return 0
    print(f"pci {args.command}: not implemented yet", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
