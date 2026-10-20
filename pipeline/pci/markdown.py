"""A small, safe Markdown renderer for the research files in content/.

Supports what the files use: `##`/`###` headings, paragraphs, bullet and numbered lists,
simple pipe tables, **bold**, *italic*, [links](https://...), source markers [S3] and the
"[À VÉRIFIER]" flag. Everything else is escaped: no raw HTML ever reaches the site.
"""

import html
import re

SOURCE = re.compile(r"\[(S\d+)\]")
VERIFY = "[À VÉRIFIER]"
LINK = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
BOLD = re.compile(r"\*\*(.+?)\*\*")
ITALIC = re.compile(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])")
HEADING = re.compile(r"^(#{2,3})\s+(.+?)\s*$")
BULLET = re.compile(r"^\s*[-*]\s+(.*)$")
NUMBERED = re.compile(r"^\s*\d+[.)]\s+(.*)$")
TABLE_RULE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$")


def slug(text: str) -> str:
    import unicodedata

    folded = unicodedata.normalize("NFKD", text)
    folded = "".join(c for c in folded if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-")


def inline(text: str) -> str:
    """Escape, then turn the supported inline syntax into HTML."""
    links: list[str] = []

    def keep_link(m: re.Match) -> str:
        links.append(
            f'<a href="{html.escape(m.group(2), quote=True)}" rel="noopener" target="_blank">'
            f"{html.escape(m.group(1))}</a>"
        )
        return f"\x00{len(links) - 1}\x00"

    out = LINK.sub(keep_link, text)
    out = html.escape(out, quote=False)
    out = out.replace(html.escape(VERIFY, quote=False), '<mark class="verify">à vérifier</mark>')
    out = BOLD.sub(r"<strong>\1</strong>", out)
    out = ITALIC.sub(r"<em>\1</em>", out)
    out = SOURCE.sub(
        lambda m: (
            f'<sup class="src"><a href="#src-{m.group(1)}" data-src="{m.group(1)}">'
            f"{m.group(1)[1:]}</a></sup>"
        ),
        out,
    )
    return re.sub(r"\x00(\d+)\x00", lambda m: links[int(m.group(1))], out)


def _cells(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def render(text: str) -> str:
    """Block-level rendering; headings get ids from their text."""
    out: list[str] = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if m := HEADING.match(line):
            level = len(m.group(1))
            out.append(f'<h{level} id="{slug(m.group(2))}">{inline(m.group(2))}</h{level}>')
            i += 1
            continue
        if line.lstrip().startswith("|") and i + 1 < len(lines) and TABLE_RULE.match(lines[i + 1]):
            head = "".join(f"<th>{inline(c)}</th>" for c in _cells(line))
            i += 2
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                rows.append("".join(f"<td>{inline(c)}</td>" for c in _cells(lines[i])))
                i += 1
            body = "".join(f"<tr>{r}</tr>" for r in rows)
            out.append(f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>")
            continue
        for pattern, tag in ((BULLET, "ul"), (NUMBERED, "ol")):
            if pattern.match(line):
                items = []
                while i < len(lines) and (m := pattern.match(lines[i])):
                    item = m.group(1)
                    i += 1
                    # Continuation lines (indented, not a new item) join the item.
                    while (
                        i < len(lines)
                        and lines[i].startswith(("  ", "\t"))
                        and not pattern.match(lines[i])
                    ):
                        item += " " + lines[i].strip()
                        i += 1
                    items.append(f"<li>{inline(item)}</li>")
                out.append(f"<{tag}>{''.join(items)}</{tag}>")
                break
        else:
            para = [line.strip()]
            i += 1
            while (
                i < len(lines)
                and lines[i].strip()
                and not HEADING.match(lines[i])
                and not BULLET.match(lines[i])
                and not NUMBERED.match(lines[i])
                and not lines[i].lstrip().startswith("|")
            ):
                para.append(lines[i].strip())
                i += 1
            out.append(f"<p>{inline(' '.join(para))}</p>")
    return "\n".join(out)
