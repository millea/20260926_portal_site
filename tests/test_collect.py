import unittest
from scripts.collect import collect, parse_rss, parse_bluesky, parse_weather, safe_url, iso_date, load_config

SOURCE = {'id':'test','name':'Test','category':'ai','type':'rss','enabled':True,'url':'https://example.com/feed'}
STAMP = '2026-10-03T00:00:00+00:00'
RSS = b'''<rss><channel><item><title>Hello</title><link>https://example.com/a</link><description>&lt;script&gt;bad()&lt;/script&gt;&lt;p&gt;Safe summary&lt;/p&gt;</description><pubDate>Fri, 02 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>'''

class CollectorTest(unittest.TestCase):
    def test_rss_and_html(self):
        entries = parse_rss(RSS,SOURCE,STAMP)
        self.assertEqual(entries[0]['summary'],'Safe summary')
        self.assertEqual(entries[0]['publishedAt'],'2026-10-02T10:00:00+00:00')

    def test_atom_and_relative_url(self):
        data = b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom</title><link href="/entry"/><updated>2026-10-02T10:00:00Z</updated></entry></feed>'
        self.assertEqual(parse_rss(data,SOURCE,STAMP)[0]['url'],'https://example.com/entry')

    def test_bad_document_is_not_empty_success(self):
        with self.assertRaises(ValueError): parse_rss(b'<html>blocked</html>',SOURCE,STAMP)
        with self.assertRaises(ValueError): parse_rss(b'<!DOCTYPE rss><rss/>',SOURCE,STAMP)

    def test_unsafe_links_are_removed(self):
        data=b'<rss><channel><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>'
        self.assertEqual(parse_rss(data,SOURCE,STAMP),[])
        for value in ['javascript:x','file:///etc/passwd','https://user:secret@example.com','//example.com',None]:
            self.assertFalse(safe_url(value))

    def test_duplicates_and_failure_retention(self):
        duplicate=RSS.replace(b'</channel>',RSS.split(b'<channel>')[1].split(b'</channel>')[0]+b'</channel>')
        first=collect([SOURCE],fetcher=lambda url:duplicate)
        self.assertEqual(len(first[0]['items']),1)
        def fail(url): raise TimeoutError('private URL token must not leak')
        second=collect([SOURCE],first,fetcher=fail)
        self.assertEqual(second[0]['status'],'error')
        self.assertEqual(second[0]['items'],first[0]['items'])
        self.assertEqual(second[0]['lastSuccessAt'],first[0]['lastSuccessAt'])
        self.assertNotIn('token',second[0]['message'])

    def test_disabled_and_deleted_sources(self):
        first=collect([SOURCE],fetcher=lambda url:RSS)
        self.assertEqual(collect([{**SOURCE,'enabled':False}],first)[0]['items'],[])
        self.assertEqual(collect([],first),[])

    def test_one_failure_does_not_block_other_source(self):
        sources=[{**SOURCE,'id':'bad','url':'https://example.com/bad'},SOURCE]
        def fetcher(url):
            if url.endswith('bad'): raise TimeoutError()
            return RSS
        self.assertEqual([s['status'] for s in collect(sources,fetcher=fetcher)],['error','ok'])

    def test_bluesky_and_repost(self):
        post={'post':{'uri':'at://did:plc:abc/app.bsky.feed.post/123','record':{'text':'Public post','createdAt':STAMP}}}
        entries=parse_bluesky({'feed':[post,{**post,'reason':{'$type':'repost'}}]},SOURCE,STAMP)
        self.assertEqual(len(entries),1)
        self.assertEqual(entries[0]['url'],'https://bsky.app/profile/did:plc:abc/post/123')
        with self.assertRaises(ValueError):parse_bluesky({'error':'blocked'},SOURCE,STAMP)

    def test_weather_values_and_unknowns(self):
        source={**SOURCE,'location':'Tokyo','latitude':35,'longitude':139}
        data={'daily':{'time':['2026-10-03'],'weather_code':[0],'temperature_2m_max':[25],'temperature_2m_min':[None],'precipitation_probability_max':[30]}}
        entry=parse_weather(data,source,STAMP)[0]
        self.assertIn('晴れ',entry['title'])
        self.assertIn('25℃',entry['summary'])
        self.assertIn('最低 不明',entry['summary'])

    def test_unknown_dates(self):
        self.assertIsNone(iso_date('not a date'))
        self.assertIsNone(iso_date(None))

    def test_real_config(self):
        sources=load_config()
        self.assertEqual(sum(s['type']=='weather' for s in sources),2)

if __name__=='__main__':unittest.main()
