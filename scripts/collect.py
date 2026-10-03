"""公開情報を収集し、ローカルJSONまたはFirestoreへ保存する。"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.error
from urllib.parse import urlencode, urljoin, urlparse, quote
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 4 * 1024 * 1024
LIMIT = 30

def now():
    return datetime.now(timezone.utc).isoformat()

def safe_url(value):
    try:
        parsed = urlparse(value)
        return bool(parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.username and not parsed.password)
    except (ValueError, TypeError):
        return False

def fetch(url):
    if not safe_url(url):
        raise ValueError('Invalid source URL')
    request = Request(url, headers={'User-Agent': 'MatoPersonalHub/1.0 (public-feed-reader)', 'Accept': 'application/json,application/atom+xml,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5'})
    with urlopen(request, timeout=25) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('Response exceeds size limit')
    return data

class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1
        if tag in ('br','p','div','li'):
            self.parts.append(' ')
    def handle_endtag(self, tag):
        if tag in ('script','style'):
            self.hidden = max(0, self.hidden-1)
        if tag in ('p','div','li'):
            self.parts.append(' ')
    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)

def plain(value, limit=180):
    parser = PlainText()
    parser.feed(str(value or ''))
    text = re.sub(r'\s+', ' ', ''.join(parser.parts)).strip()
    return text[:limit] + ('…' if len(text) > limit else '')

def iso_date(value):
    if not value:
        return None
    try:
        date = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (TypeError, ValueError):
        try:
            date = parsedate_to_datetime(value)
        except (ValueError, TypeError, OverflowError):
            return None
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return date.astimezone(timezone.utc).isoformat()

def item(source, title, url, summary, published, timestamp):
    if not safe_url(url) or not title:
        return None
    return {'id': sha256(f'{source["id"]}:{url}'.encode()).hexdigest()[:32],
            'sourceId': source['id'], 'source': source['name'], 'category': source['category'],
            'title': plain(title, 240), 'summary': plain(summary), 'url': url,
            'publishedAt': iso_date(published), 'collectedAt': timestamp}

def parse_rss(data, source, timestamp):
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('XML declarations are not allowed')
    root = ET.fromstring(data)
    atom = '{http://www.w3.org/2005/Atom}'
    result = []
    if root.tag == atom+'feed':
        entries = root.findall(atom+'entry')
        for entry in entries:
            links = [link for link in entry.findall(atom+'link') if link.get('rel', 'alternate') == 'alternate']
            url = urljoin(source['url'], links[0].get('href', '')) if links else ''
            summary = entry.findtext(atom+'summary') or entry.findtext(atom+'content') or ''
            result.append(item(source, entry.findtext(atom+'title'), url, summary, entry.findtext(atom+'published') or entry.findtext(atom+'updated'), timestamp))
    elif root.tag in ('rss', '{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF'):
        ns = '{http://purl.org/rss/1.0/}' if root.tag.endswith('RDF') else ''
        for entry in root.findall('.//'+ns+'item'):
            link = entry.findtext(ns+'link') or ''
            result.append(item(source, entry.findtext(ns+'title'), urljoin(source['url'],link) if link else '', entry.findtext(ns+'description') or '', entry.findtext('pubDate') or entry.findtext('{http://purl.org/dc/elements/1.1/}date'), timestamp))
    else:
        raise ValueError('Unsupported feed document')
    return [entry for entry in result if entry]

def parse_bluesky(data, source, timestamp):
    if not isinstance(data.get('feed'), list):
        raise ValueError('Invalid Bluesky response')
    result = []
    for entry in data['feed']:
        if entry.get('reason'):
            continue
        post = entry.get('post', {})
        record = post.get('record', {})
        text = record.get('text', '')
        uri = post.get('uri', '')
        match = re.fullmatch(r'at://([^/]+)/app\.bsky\.feed\.post/([^/]+)', uri)
        if not text or not match:
            continue
        url = f'https://bsky.app/profile/{quote(match[1],safe=":")}/post/{quote(match[2],safe="")}'
        result.append(item(source, text[:90], url, text, record.get('createdAt'), timestamp))
    return [entry for entry in result if entry]

def weather_label(code):
    if code == 0: return '晴れ'
    if code in (1,2): return '晴れ時々曇り'
    if code == 3: return '曇り'
    if code in (45,48): return '霧'
    if code in (51,53,55,56,57): return '霧雨'
    if code in (61,63,65,66,67,80,81,82): return '雨'
    if code in (71,73,75,77,85,86): return '雪'
    if code in (95,96,99): return '雷雨'
    return '天気不明'

def parse_weather(data, source, timestamp):
    daily = data.get('daily', {})
    dates = daily.get('time')
    if not isinstance(dates, list) or not dates:
        raise ValueError('Invalid weather response')
    def value(key, index, unit):
        values = daily.get(key, [])
        raw = values[index] if index < len(values) else None
        return f'{raw}{unit}' if raw is not None else '不明'
    result = []
    for i, day in enumerate(dates[:3]):
        codes = daily.get('weather_code', [])
        label = weather_label(codes[i] if i < len(codes) else None)
        url = f'https://open-meteo.com/en/docs?latitude={source["latitude"]}&longitude={source["longitude"]}#forecast-{day}'
        summary = f'最高 {value("temperature_2m_max",i,"℃")} / 最低 {value("temperature_2m_min",i,"℃")} · 降水確率 {value("precipitation_probability_max",i,"%")}。予報データ：Open-Meteo（CC BY 4.0）'
        result.append(item(source, f'{source["location"]} · {day} · {label}', url, summary, timestamp, timestamp))
    return result

def collect_source(source, timestamp, fetcher=fetch):
    if source['type'] == 'rss':
        return parse_rss(fetcher(source['url']), source, timestamp)
    if source['type'] == 'bluesky':
        actor = source.get('actor', '').strip()
        if not actor:
            raise ValueError('Bluesky actor is missing')
        url = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?' + urlencode({'actor': actor, 'limit':30, 'filter':'posts_no_replies'})
        return parse_bluesky(json.loads(fetcher(url)), source, timestamp)
    if source['type'] == 'weather':
        latitude, longitude = float(source['latitude']), float(source['longitude'])
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError('Invalid coordinates')
        url = 'https://api.open-meteo.com/v1/forecast?' + urlencode({'latitude':latitude,'longitude':longitude,'daily':'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max','timezone':'Asia/Tokyo','forecast_days':3})
        return parse_weather(json.loads(fetcher(url)), source, timestamp)
    raise ValueError('Unknown source type')

def collect(sources, previous=None, fetcher=fetch):
    previous = {source['id']: source for source in (previous or [])}
    timestamp = now()
    results = []
    for source in sources:
        old = previous.get(source['id'], {})
        state = {key:source[key] for key in ('id','name','category','type')}
        state.update(attemptedAt=timestamp, lastSuccessAt=old.get('lastSuccessAt'), items=[], message='')
        if not source.get('enabled', False):
            state.update(status='disabled', message='情報源が未設定、または無効です。', lastSuccessAt=None)
        else:
            try:
                entries = collect_source(source, timestamp, fetcher)
                unique = {}
                for entry in entries:
                    if entry and entry['url'] not in unique:
                        unique[entry['url']] = entry
                state.update(status='ok',lastSuccessAt=timestamp,items=sorted(unique.values(), key=lambda e:e['publishedAt'] or '', reverse=True)[:LIMIT])
            except Exception as error:
                # Never copy exception text containing endpoint credentials into public-facing state.
                reason = f'HTTP {error.code}' if isinstance(error, urllib.error.HTTPError) else type(error).__name__
                state.update(status='error',message=f'取得できませんでした（{reason}）。前回の情報があれば保持しています。', items=old.get('items', [])[:LIMIT])
        results.append(state)
    return results

def load_config():
    sources = json.loads((ROOT/'config/sources.json').read_text(encoding='utf-8-sig'))['sources']
    categories = json.loads((ROOT/'config/portal.json').read_text(encoding='utf-8-sig'))['categories']
    ids = [s['id'] for s in sources]
    category_ids = [c['id'] for c in categories]
    if len(category_ids) != len(set(category_ids)) or 'dashboard' in category_ids:
        raise ValueError('Duplicate/reserved category IDs')
    if any(not re.fullmatch(r'[a-z][a-z0-9-]*',value) for value in ids+category_ids) or len(ids) != len(set(ids)):
        raise ValueError('Invalid or duplicate IDs')
    for source in sources:
        if source['category'] not in category_ids:
            raise ValueError('Source references unknown category')
    return sources

def main():
    parser = argparse.ArgumentParser()
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('--local',action='store_true')
    target.add_argument('--firestore',action='store_true')
    args = parser.parse_args()
    sources = load_config()
    if args.local:
        path = ROOT/'data/local-feed.json'
        previous = json.loads(path.read_text(encoding='utf-8')).get('sources',[]) if path.exists() else []
        results = collect(sources, previous)
        path.parent.mkdir(exist_ok=True)
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps({'version':1,'generatedAt':now(),'sources':results},ensure_ascii=False,indent=2),encoding='utf-8')
        temp.replace(path)
    else:
        import firebase_admin
        from firebase_admin import firestore
        firebase_admin.initialize_app()
        db = firestore.client()
        previous_docs = list(db.collection('feeds').stream())
        results = collect(sources, [doc.to_dict() for doc in previous_docs])
        # Each source is independent and below Firestore's 1 MiB document limit.
        for result in results:
            db.collection('feeds').document(result['id']).set(result)
        configured = {s['id'] for s in sources}
        for document in previous_docs:
            if document.id not in configured:
                document.reference.delete()
    for result in results:
        print(f'{result["id"]}: {result["status"]} ({len(result["items"])} items)')
    if any(result['status']=='error' for result in results):
        raise SystemExit(1)

if __name__ == '__main__':
    main()
