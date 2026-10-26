#!/usr/bin/env python3
"""Archive an uploaded screenshot and create a pending visual-extraction record."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    parser.add_argument('--id', required=True, help='Unique source ID, e.g. 2026-11-01-abi-tom-01')
    args = parser.parse_args()
    try:
        if not re.fullmatch(r'[a-zA-Z0-9_-]+', args.id):
            raise ValueError('ID may only contain letters, numbers, hyphens and underscores.')
        suffix = args.image.suffix.lower()
        if suffix not in ('.png', '.jpg', '.jpeg', '.webp'):
            raise ValueError('Expected PNG, JPEG or WebP.')
        digest = hashlib.sha256(args.image.read_bytes()).hexdigest()
        manifest_path = ROOT / 'data/sources.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        if any(item['sha256'] == digest for item in manifest['sources']):
            raise ValueError('This exact screenshot is already archived.')
        destination = ROOT / 'data/screenshots' / (args.id + suffix)
        extraction_path = ROOT / 'data/extractions' / (args.id + '.json')
        if destination.exists() or extraction_path.exists():
            raise ValueError('Source ID already exists; choose a unique ID.')
        source = {'path': destination.relative_to(ROOT).as_posix(), 'sha256': digest, 'originalFilename': args.image.name}
        extraction = {'schemaVersion': 1, 'id': args.id, 'status': 'pending', 'source': source,
                      'playedAt': None, 'players': [], 'reviewNotes': ['Awaiting visual transcription and review.']}
        shutil.copyfile(args.image, destination)
        extraction_path.write_text(json.dumps(extraction, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        manifest['sources'].append({'extraction': extraction_path.relative_to(ROOT).as_posix(), **source})
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(extraction_path.relative_to(ROOT))
        return 0
    except (OSError, ValueError) as error:
        print(f'Cannot archive screenshot: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
