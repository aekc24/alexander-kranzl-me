"""Generate static MP3 narrations from built article pages; no TTS runs in visitors' browsers."""

import asyncio
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.audio-tools'))

VOICE = 'de-DE-FlorianMultilingualNeural'
RATE = '-5%'
OUTPUT = ROOT / 'public' / 'audio'
MANIFEST = OUTPUT / 'manifest.json'
TAGS = {'h2', 'h3', 'h4', 'p', 'li', 'blockquote'}
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
EXCLUDED = {'expressive-code', 'code-block', 'toc', 'callout-title'}


def normalize(value):
    return ' '.join(value.split())


class Node:
    def __init__(self, tag='', attrs=(), parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children = []

    @property
    def classes(self):
        return set(self.attrs.get('class', '').split())

    @property
    def text(self):
        return ''.join(child.text if isinstance(child, Node) else child for child in self.children)

    def walk(self):
        for child in self.children:
            if isinstance(child, Node):
                yield child
                yield from child.walk()


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.current = self.root
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        node = self.current
        while node.parent is not None:
            if node.tag == tag:
                self.current = node.parent
                return
            node = node.parent

    def handle_data(self, data):
        self.current.children.append(data)


def excluded(node, content):
    while node is not None and node is not content:
        if node.tag in {'pre', 'table', 'script', 'style'} or node.classes & EXCLUDED:
            return True
        node = node.parent
    return False


def extract(page):
    nodes = list(page.root.walk())
    player = next((n for n in nodes if n.attrs.get('id') == 'audio-player-root'), None)
    if player is None:
        return None
    content_class = player.attrs.get('data-selector', '.post-content').lstrip('.')
    content = next(n for n in nodes if content_class in n.classes)
    header = [n for n in nodes if n.classes & {'post-title', 'project-title', 'post-description', 'project-description'}]
    body = [n for n in content.walk() if n.tag in TAGS and not excluded(n, content)
            and not any(child.tag in TAGS for child in n.walk())]
    return [normalize(n.text) for n in header + body if normalize(n.text)]


def source_routes():
    result = {}
    for collection in ('blog', 'projects'):
        base = ROOT / 'src' / 'content' / collection
        if not base.exists():
            continue
        for file in sorted(base.rglob('*')):
            if file.suffix not in {'.md', '.mdx'} or file.name.startswith('_'):
                continue
            relative = file.relative_to(base).with_suffix('')
            name = relative.name
            if '.' in name:
                stem, language = name.rsplit('.', 1)
                slug = relative.parent if stem == 'index' else relative.with_name(stem)
                slug = slug / language
            else:
                slug = relative.parent if name == 'index' else relative
            result[f'/{collection}/{slug.as_posix()}'] = file
    return result


async def generate(route, parts, source, previous, semaphore):
    import edge_tts
    from mutagen.mp3 import MP3

    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    fingerprint = hashlib.sha256(json.dumps([VOICE, RATE, parts], ensure_ascii=False).encode()).hexdigest()[:20]
    target = OUTPUT / route.lstrip('/') / f'{fingerprint}.mp3'
    if previous and previous.get('fingerprint') == fingerprint and target.exists():
        print(f'Cached: {route}', flush=True)
        return route, {**previous, 'sourceHash': source_hash}

    async with semaphore:
        text = '\n\n'.join(parts)
        starts, cursor = [], 0
        for part in parts:
            starts.append(cursor)
            cursor += len(part) + 2
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix('.mp3.tmp')
        for attempt in range(3):
            try:
                boundaries, cursor = [], 0
                print(f'Generating: {route} ({len(parts)} sections)', flush=True)
                with temporary.open('wb') as output:
                    speech = edge_tts.Communicate(text, VOICE, rate=RATE, boundary='WordBoundary')
                    async for event in speech.stream():
                        if event['type'] == 'audio':
                            output.write(event['data'])
                        elif event['type'] == 'WordBoundary':
                            word = html.unescape(event['text'])
                            position = text.find(word, cursor)
                            if position >= 0:
                                boundaries.append((position, event['offset'] / 10_000_000))
                                cursor = position + len(word)
                duration = MP3(temporary).info.length
                if not boundaries or duration <= 0:
                    raise ValueError(f'No usable speech received for {route}')
                sections, boundary_index = [], 0
                for part, start in zip(parts, starts):
                    while boundary_index < len(boundaries) - 1 and boundaries[boundary_index][0] < start:
                        boundary_index += 1
                    position, timestamp = boundaries[boundary_index]
                    if position >= start + len(part):
                        raise ValueError(f'Missing timing for section in {route}: {part[:60]}')
                    sections.append({'text': part, 'start': round(timestamp, 3)})
                sections[0]['start'] = 0
                temporary.replace(target)
                return route, {
                    'src': '/' + target.relative_to(ROOT / 'public').as_posix(),
                    'voice': VOICE, 'rate': RATE, 'fingerprint': fingerprint,
                    'source': source.relative_to(ROOT).as_posix(), 'sourceHash': source_hash,
                    'duration': round(duration, 3), 'sections': sections,
                }
            except Exception:
                temporary.unlink(missing_ok=True)
                if attempt == 2:
                    raise
                await asyncio.sleep(2 * (attempt + 1))


async def main():
    if not (ROOT / 'dist' / 'index.html').exists():
        raise SystemExit('Build the site first: npm run audio:generate')
    previous = json.loads(MANIFEST.read_text('utf-8')) if MANIFEST.exists() else {}
    routes, semaphore = source_routes(), asyncio.Semaphore(2)
    jobs = []
    for page in sorted((ROOT / 'dist').rglob('index.html')):
        parts = extract(Page(page.read_text('utf-8')))
        if not parts:
            continue
        route = '/' + page.parent.relative_to(ROOT / 'dist').as_posix()
        source = routes[route]
        jobs.append((route, parts, source))
    if not jobs:
        raise SystemExit('No audio-enabled pages found in dist.')
    # Save successful files as we go so an interrupted run can resume.
    results = dict(previous)
    tasks = [generate(route, parts, source, previous.get(route), semaphore) for route, parts, source in jobs]
    for task in asyncio.as_completed(tasks):
        route, narration = await task
        results[route] = narration
        MANIFEST.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    results = {route: results[route] for route, _, _ in jobs}
    MANIFEST.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(f'Completed {len(results)} narrations with {VOICE}.', flush=True)


if __name__ == '__main__':
    asyncio.run(main())
