"""Resources beyond the worksheets: audio/video links, lesson plans and stories.

  data/media.yaml           {element id: [links to public recordings or films]}
  data/lessons/<id>.yaml    one-hour lessons, one per education level
  data/stories/<id>.yaml    guided tours across elements sharing an idea or a place

All are validated against their JSON Schemas plus the rules below and published together
as web/public/data/resources.json.
"""

import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

from pci import DATA, ROOT, SCHEMA
from pci.places import load_yaml

MEDIA_PATH = DATA / "media.yaml"
LESSONS_DIR = DATA / "lessons"
STORIES_DIR = DATA / "stories"
RESOURCES_JSON = ROOT / "web" / "public" / "data" / "resources.json"
LEVELS = ("primary", "middle", "high", "university")


class ResourcesError(Exception):
    pass


def _validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(json.loads((SCHEMA / name).read_text(encoding="utf-8")))


def _schema_problems(label: str, data, validator: Draft202012Validator) -> list[str]:
    return [
        f"{label}: {'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
        for e in validator.iter_errors(data)
    ]


def load_dir(directory: Path) -> list[dict]:
    items = []
    for path in sorted(directory.glob("*.yaml")):
        item = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(item, dict) or item.get("id") != path.stem:
            raise ResourcesError(f"{path.name}: id must match the file name")
        items.append(item)
    return items


def check_media(media: dict, published: set[str]) -> list[str]:
    validator = _validator("media.schema.json")
    problems = []
    for ident, links in media.items():
        if ident not in published:
            problems.append(f"media {ident}: not a published inventory element")
        problems += _schema_problems(f"media {ident}", links, validator)
        urls = [link.get("url") for link in links or [] if isinstance(link, dict)]
        if len(set(urls)) != len(urls):
            problems.append(f"media {ident}: duplicate links")
    return problems


def check_lessons(lessons: list[dict], published: set[str]) -> list[str]:
    validator = _validator("lesson.schema.json")
    problems = []
    for lesson in lessons:
        label = f"lesson {lesson.get('id')}"
        problems += _schema_problems(label, lesson, validator)
        problems += [
            f"{label}: unknown element {e}"
            for e in lesson.get("elements", [])
            if e not in published
        ]
        minutes = sum(step.get("minutes", 0) for step in lesson.get("steps", []))
        if minutes != lesson.get("duration_min", 60):
            problems.append(f"{label}: steps add up to {minutes} min, not 60")
    return problems


def check_stories(stories: list[dict], published: set[str]) -> list[str]:
    validator = _validator("story.schema.json")
    problems = []
    for story in stories:
        label = f"story {story.get('id')}"
        problems += _schema_problems(label, story, validator)
        ids = [step.get("element") for step in story.get("steps", [])]
        problems += [f"{label}: unknown element {e}" for e in ids if e not in published]
        if len(set(ids)) != len(ids):
            problems.append(f"{label}: an element appears twice")
    return problems


def build_resources(published: set[str], output: Path = RESOURCES_JSON) -> dict[str, int]:
    media = load_yaml(MEDIA_PATH)
    lessons = load_dir(LESSONS_DIR) if LESSONS_DIR.exists() else []
    stories = load_dir(STORIES_DIR) if STORIES_DIR.exists() else []
    problems = (
        check_media(media, published)
        + check_lessons(lessons, published)
        + check_stories(stories, published)
    )
    if problems:
        raise ResourcesError("\n".join(problems))
    order = {level: i for i, level in enumerate(LEVELS)}
    payload = {
        "media": media,
        "lessons": sorted(lessons, key=lambda lesson: order[lesson["level"]]),
        "stories": stories,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    return {"media": len(media), "lessons": len(lessons), "stories": len(stories)}
