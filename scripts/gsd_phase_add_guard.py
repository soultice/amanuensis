#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROADMAP = ROOT / '.planning' / 'ROADMAP.md'
PHASES_DIR = ROOT / '.planning' / 'phases'


def normalize(text: str) -> str:
    text = text.strip().lower()
    text = text.replace('“', '"').replace('”', '"').replace("‘", "'").replace("’", "'")
    text = re.sub(r'[`"\']', '', text)
    text = re.sub(r'[^a-z0-9]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def slugify(text: str) -> str:
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', text.lower())).strip('-')


def split_candidates(raw: str) -> list[str]:
    raw = raw.strip()
    if not raw:
        return []
    parts = [part.strip() for part in re.split(r'\s+\+\s+', raw) if part.strip()]
    return parts or [raw]


def roadmap_matches() -> list[dict]:
    matches: list[dict] = []
    if not ROADMAP.exists():
        return matches
    lines = ROADMAP.read_text().splitlines()
    current = None
    for line in lines:
        heading = re.match(r'^###\s+Phase\s+([^:]+):\s+(.+)$', line)
        if heading:
            current = {
                'phase': heading.group(1).strip(),
                'name': heading.group(2).strip(),
                'goal': '',
            }
            matches.append(current)
            continue
        if current is not None:
            goal = re.match(r'^\*\*Goal:\*\*\s+(.+)$', line)
            if goal and not current['goal']:
                current['goal'] = goal.group(1).strip()
    return matches


def directory_matches() -> list[dict]:
    rows: list[dict] = []
    if not PHASES_DIR.exists():
        return rows
    for path in sorted(PHASES_DIR.iterdir()):
        if not path.is_dir() or '-' not in path.name:
            continue
        phase, slug = path.name.split('-', 1)
        rows.append({'phase': phase, 'name': slug.replace('-', ' '), 'slug': slug, 'directory': path.name})
    return rows


def main() -> int:
    description = ' '.join(sys.argv[1:]).strip()
    candidates = split_candidates(description)
    if not candidates:
        print(json.dumps({
            'allow': False,
            'reason': 'missing_description',
            'message': 'Phase description required before /gsd-add-phase can run.'
        }))
        return 0

    roadmap = roadmap_matches()
    dirs = directory_matches()
    hits = []

    for candidate in candidates:
        norm = normalize(candidate)
        slug = slugify(candidate)
        for item in roadmap:
            if norm and norm in {
                normalize(item['name']),
                normalize(item['goal']),
            }:
                hits.append({
                    'candidate': candidate,
                    'phase': item['phase'],
                    'name': item['name'],
                    'source': 'roadmap',
                })
        for item in dirs:
            if slug and slug == item['slug']:
                hits.append({
                    'candidate': candidate,
                    'phase': item['phase'],
                    'name': item['name'],
                    'source': 'phase-directory',
                    'directory': item['directory'],
                })

    unique_hits = []
    seen = set()
    for hit in hits:
        key = (hit['candidate'], hit['phase'], hit['source'])
        if key in seen:
            continue
        seen.add(key)
        unique_hits.append(hit)

    if unique_hits:
        print(json.dumps({
            'allow': False,
            'reason': 'duplicate_phase_description',
            'message': 'Refusing to add a phase whose description already exists in the roadmap or phase directories.',
            'requested': description,
            'matches': unique_hits,
        }))
        return 0

    print(json.dumps({
        'allow': True,
        'requested': description,
        'candidates': candidates,
    }))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
