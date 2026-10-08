"""Command-line entry point: `pci <command>`."""

import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pci", description="PCI Map data pipeline")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("fetch-index", help="scrape the inventory page into data/index.json")
    sub.add_parser("fetch-fiches", help="download pilot fiche PDFs into data/raw/")
    sub.add_parser("extract-text", help="extract fiche text into data/text/")
    sub.add_parser("build", help="validate curated data and write the site's elements.json")
    args = parser.parse_args(argv)
    print(f"pci {args.command}: not implemented yet", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
