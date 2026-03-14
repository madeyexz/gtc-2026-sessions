#!/usr/bin/env python3
"""Generate Obsidian-style markdown files for each GTC 2026 session.
Each .md file has YAML frontmatter and [[wiki-links]] to related sessions."""

import json
import os
import re
from collections import defaultdict
from pathlib import Path

BASE = Path("/Users/ianhsiao/Desktop/gtc-2026-sessions/app/public")
DATA_FILE = BASE / "data.json"
REL_DIR = BASE / "relationships"
OUT_DIR = BASE / "sessions"

def strip_html(text):
    return re.sub(r'<[^>]+>', '', text or '').strip()

def sanitize_filename(code):
    return code.replace('/', '-').replace(' ', '_')

def main():
    # Load sessions
    with open(DATA_FILE) as f:
        data = json.load(f)
    sessions = {s['sessionCode']: s for s in data['sessions']}

    # Load all relationships
    relationships = []
    if REL_DIR.exists():
        for rf in sorted(REL_DIR.glob("*.json")):
            with open(rf) as f:
                rel = json.load(f)
                relationships.append(rel)

    # Build adjacency: sessionCode -> list of (related_code, rel_type, rel_label, via)
    adjacency = defaultdict(list)
    for rel in relationships:
        rel_type = rel['type']
        rel_label = rel['label']
        for edge in rel['edges']:
            src, tgt = edge['source'], edge['target']
            via = edge.get('via', '')
            adjacency[src].append((tgt, rel_type, rel_label, via))
            adjacency[tgt].append((src, rel_type, rel_label, via))

    # Generate markdown files
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for code, s in sessions.items():
        filename = sanitize_filename(code) + ".md"
        filepath = OUT_DIR / filename

        # Extract fields
        title = s.get('title', 'Untitled')
        stype = s.get('type', '')
        abstract = strip_html(s.get('abstract', ''))
        topic_raw = s.get('topic', '')
        if isinstance(topic_raw, list):
            topic = ', '.join(topic_raw)
        else:
            topic = topic_raw or ''

        main_topic = topic.split(' - ')[0].strip() if topic else ''
        tech_level = s.get('technicalLevel', '')
        language = s.get('language', '')
        nv_tech = s.get('nvidiaTechnology', '')
        if isinstance(nv_tech, list):
            nv_tech = ', '.join(nv_tech)
        key_themes = s.get('keyThemes', '')
        if isinstance(key_themes, list):
            key_themes = ', '.join(key_themes)
        featured = s.get('featuredCategory', '')

        speakers = s.get('speakers', [])
        schedule = s.get('schedule', [])

        # Build frontmatter
        def esc(v): return v.replace('"', "'")
        lines = ["---"]
        lines.append(f'sessionCode: "{code}"')
        lines.append(f'title: "{esc(title)}"')
        lines.append(f'type: "{stype}"')
        lines.append(f'topic: "{esc(topic)}"')
        lines.append(f'mainTopic: "{main_topic}"')
        lines.append(f'technicalLevel: "{tech_level}"')
        lines.append(f'language: "{language}"')
        if nv_tech:
            lines.append(f'nvidiaTechnology: "{esc(nv_tech)}"')
        if key_themes:
            lines.append(f'keyThemes: "{esc(key_themes)}"')
        if featured:
            lines.append(f'featured: "{featured}"')
        if speakers:
            lines.append("speakers:")
            for sp in speakers:
                lines.append(f"  - name: \"{sp.get('name', '')}\"")
                if sp.get('role'):
                    lines.append(f"    role: \"{sp['role']}\"")
        if schedule:
            lines.append("schedule:")
            for sch in schedule:
                lines.append(f"  - date: \"{sch.get('date', '')}\"")
                lines.append(f"    day: \"{sch.get('dayName', '')}\"")
                lines.append(f"    time: \"{sch.get('startTime', '')} - {sch.get('endTime', '')}\"")
                lines.append(f"    room: \"{sch.get('room', '')}\"")
        conn_count = len(adjacency.get(code, []))
        lines.append(f"connections: {conn_count}")
        lines.append("---")
        lines.append("")

        # Title
        lines.append(f"# {title}")
        lines.append("")

        # Badges
        badges = []
        if stype: badges.append(f"`{stype}`")
        if tech_level: badges.append(f"`{tech_level}`")
        if featured: badges.append(f"`{featured}`")
        if main_topic: badges.append(f"`{main_topic}`")
        if badges:
            lines.append(" ".join(badges))
            lines.append("")

        # Schedule
        if schedule:
            lines.append("## Schedule")
            for sch in schedule:
                day = sch.get('dayName', '')
                date = sch.get('date', '')
                start = sch.get('startTime', '')
                end = sch.get('endTime', '')
                room = sch.get('room', '')
                lines.append(f"- **{day}, {date}** {start} - {end} @ {room}")
            lines.append("")

        # Speakers
        if speakers:
            lines.append("## Speakers")
            for sp in speakers:
                name = sp.get('name', '')
                role = sp.get('role', '')
                bio = strip_html(sp.get('bio', ''))
                role_str = f" ({role})" if role else ""
                lines.append(f"### {name}{role_str}")
                if bio:
                    lines.append(f"> {bio[:300]}{'...' if len(bio) > 300 else ''}")
                lines.append("")

        # Abstract
        if abstract:
            lines.append("## Abstract")
            lines.append(abstract)
            lines.append("")

        # NVIDIA Technology
        if nv_tech:
            lines.append("## NVIDIA Technology")
            lines.append(nv_tech)
            lines.append("")

        # Linked Sessions (Obsidian-style)
        links = adjacency.get(code, [])
        if links:
            # Group by relationship type
            grouped = defaultdict(list)
            for related_code, rel_type, rel_label, via in links:
                grouped[rel_label].append((related_code, via))

            lines.append("## Linked Sessions")
            lines.append("")
            for rel_label, items in sorted(grouped.items()):
                lines.append(f"### {rel_label}")
                seen = set()
                for related_code, via in items:
                    if related_code in seen:
                        continue
                    seen.add(related_code)
                    related = sessions.get(related_code, {})
                    related_title = related.get('title', related_code)
                    via_str = f" — {via}" if via else ""
                    lines.append(f"- [[{sanitize_filename(related_code)}|{related_title}]]{via_str}")
                lines.append("")

        with open(filepath, 'w') as f:
            f.write('\n'.join(lines))

    print(f"Generated {len(sessions)} markdown files in {OUT_DIR}")
    print(f"Relationship types loaded: {len(relationships)}")
    total_edges = sum(len(r['edges']) for r in relationships)
    print(f"Total edges across all types: {total_edges}")
    print(f"Sessions with links: {len(adjacency)}")
    avg_links = sum(len(v) for v in adjacency.values()) / max(len(adjacency), 1)
    print(f"Average links per connected session: {avg_links:.1f}")

if __name__ == "__main__":
    main()
