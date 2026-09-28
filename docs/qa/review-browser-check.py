"""Local-only acceptance check; synthetic roster and a disposable browser profile."""
import argparse
import json
from urllib.parse import urlsplit
import re
import struct
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8787')
parser.add_argument('--output', type=Path, default=Path('review-browser-results'))
args = parser.parse_args()
if urlsplit(args.url).hostname not in {'localhost', '127.0.0.1', '::1'}:
    parser.error('Use a local test server, not a live deployment.')
OUT = args.output
OUT.mkdir(parents=True, exist_ok=True)
BASE_URL = args.url.rstrip('/')
NAME = '\u6797\u821f'
TEXT = '\u6797\u821f \u5317\u4eac\u5927\u5b66 \u5317\u4eac\n\u5468\u6674 \u590d\u65e6\u5927\u5b66 \u4e0a\u6d77\n\u674e\u5b89 \u6b66\u6c49\u5927\u5b66 \u6b66\u6c49'
UPDATE = '\u6797\u821f \u6d59\u6c5f\u5927\u5b66 \u676d\u5dde'
results = {'checks': [], 'page_errors': []}

def passed(name):
    results['checks'].append(name)
    print('PASS', name, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440,'height':1000}, accept_downloads=True)
    page = context.new_page()
    page.set_default_timeout(7000)
    page.on('pageerror', lambda err: results['page_errors'].append(str(err)))
    page.on('dialog', lambda dialog: dialog.accept())
    results['browser'] = context.browser.version
    try:
        page.goto(BASE_URL+'/', wait_until='domcontentloaded')
        page.get_by_role('button',name='\u65b0\u5efa\u9879\u76ee',exact=True).click()
        page.wait_for_url(re.compile(r'#/project/'))
        URL = page.url
        rows = page.locator('[data-student-row]')
        expect(page.get_by_role('button',name='\u5c55\u5f00\u5bfc\u5165\u540d\u5355',exact=True)).to_be_visible()
        expect(rows).to_have_count(0)
        page.get_by_role('button',name='\u5c55\u5f00\u5bfc\u5165\u540d\u5355',exact=True).click()
        def compare(text):
            page.locator('.data-workspace textarea').fill(text)
            page.get_by_role('button',name='\u8bc6\u522b\u6587\u672c',exact=True).click()
            page.get_by_role('button',name='\u6bd4\u8f83\u5e76\u66f4\u65b0',exact=True).click()
        def confirm():
            page.get_by_role('button',name='\u786e\u8ba4\u66f4\u65b0\u540d\u5355',exact=True).click()
        compare(TEXT)
        expect(page.locator('.import-diff__summary')).to_contain_text('\u65b0\u589e 3')
        confirm()
        expect(rows).to_have_count(3)
        ids = rows.evaluate_all('(els)=>els.map(e=>e.dataset.studentRow)')
        passed('add three synthetic records through diff preview')
        page.get_by_role('button',name='\u9690\u85cf '+NAME,exact=True).click()
        expect(rows.first).to_have_class(re.compile('is-hidden'))
        compare(TEXT)
        expect(page.locator('.import-diff__summary')).to_contain_text('\u672a\u53d8\u5316 3')
        confirm()
        assert rows.evaluate_all('(els)=>els.map(e=>e.dataset.studentRow)') == ids
        expect(rows.first).to_have_class(re.compile('is-hidden'))
        passed('identical reimport preserves IDs and hidden state')
        compare(UPDATE)
        expect(page.get_by_role('button',name='\u786e\u8ba4\u66f4\u65b0\u540d\u5355',exact=True)).to_be_disabled()
        page.locator('.import-diff select').select_option('match:'+ids[0])
        expect(page.locator('.import-diff__summary')).to_contain_text('\u66f4\u65b0 1')
        expect(page.locator('.import-diff__summary')).to_contain_text('\u65e7\u8bb0\u5f55\u4fdd\u7559 2')
        page.locator('.import-diff').screenshot(path=str(OUT/'diff-desktop.png'))
        page.set_viewport_size({'width':390,'height':844})
        expect(page.get_by_role('button',name='\u53d6\u6d88\u6bd4\u8f83',exact=True)).to_be_visible()
        page.locator('.import-diff').scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/'diff-mobile.png'))
        results['mobile_dimensions'] = page.locator('.import-diff').evaluate('(e)=>({client:e.clientWidth,scroll:e.scrollWidth,viewport:innerWidth})')
        assert results['mobile_dimensions']['scroll'] <= results['mobile_dimensions']['client'] + 2
        page.get_by_role('button',name='\u53d6\u6d88\u6bd4\u8f83',exact=True).click()
        expect(page.locator('.import-diff')).to_have_count(0)
        page.get_by_role('button',name='\u6bd4\u8f83\u5e76\u66f4\u65b0',exact=True).click()
        page.locator('.import-diff select').select_option('match:'+ids[0])
        passed('mobile preview cancellation and re-entry at 390px')
        page.set_viewport_size({'width':1440,'height':1000})
        confirm()
        expect(rows).to_have_count(3)
        expect(rows.first).to_contain_text('\u676d\u5dde\u5e02')
        expect(rows.first).to_have_class(re.compile('is-hidden'))
        assert rows.evaluate_all('(els)=>els.map(e=>e.dataset.studentRow)') == ids
        passed('explicit match updates one person and keeps absent records')
        page.get_by_role('button',name='\u64a4\u9500\uff1a\u6bd4\u8f83\u5e76\u66f4\u65b0\u540d\u5355',exact=True).click()
        expect(rows.first).to_contain_text('\u5317\u4eac\u5e02')
        page.get_by_role('button',name='\u91cd\u505a\uff1a\u6bd4\u8f83\u5e76\u66f4\u65b0\u540d\u5355',exact=True).click()
        expect(rows.first).to_contain_text('\u676d\u5dde\u5e02')
        passed('single-step undo and redo')
        page.get_by_role('button',name=re.compile('^\u4ea4\u4ed8')).click()
        expect(page.get_by_role('note')).to_contain_text('3 \u6761\uff0c\u5176\u4e2d\u9690\u85cf 1 \u6761')
        for button, filename in [('\u5bfc\u51fa SVG','poster.svg'),('PNG','poster.png')]:
            with page.expect_download(timeout=60000) as pending:
                page.get_by_role('button',name=button,exact=True).click()
            download = pending.value
            assert download.failure() is None
            download.save_as(str(OUT/filename))
        svg = (OUT/'poster.svg').read_text()
        assert '<svg' in svg and NAME not in svg
        png = (OUT/'poster.png').read_bytes()
        assert png[:8] == b'\x89PNG\r\n\x1a\n'
        results['png_dimensions'] = struct.unpack('>II',png[16:24])
        assert results['png_dimensions'] == (1500,1000)
        expect(page.locator('body')).to_contain_text('\u5e94\u7528\u4e0d\u80fd\u786e\u8ba4\u662f\u5426\u5df2\u5199\u5165\u78c1\u76d8')
        passed('actual SVG and PNG browser downloads')
        page.get_by_role('checkbox',name='\u5de5\u7a0b\u5305\u5305\u542b\u8d44\u6e90',exact=True).uncheck()
        with page.expect_download() as pending:
            page.get_by_role('button',name='\u5bfc\u51fa\u5de5\u7a0b\u5305',exact=True).click()
        pending.value.save_as(str(OUT/'source.cengfan'))
        package = json.loads((OUT/'source.cengfan').read_text())
        records = package['project']['students']
        assert len(records)==3 and records[0]['visibility'] is False
        assert [s['id'] for s in records] == ids
        assert records[0]['city']=='\u676d\u5dde\u5e02'
        passed('source package retains complete roster without resources')
        page.screenshot(path=str(OUT/'delivery-desktop.png'))
        page.get_by_role('button',name='\u8fd4\u56de\u9879\u76ee\u5217\u8868',exact=True).click()
        expect(page.get_by_role('button',name='\u65b0\u5efa\u9879\u76ee',exact=True)).to_be_visible()
        page.goto(URL, wait_until='domcontentloaded')
        page.get_by_role('button',name=re.compile('^\u540d\u5355')).click()
        expect(rows).to_have_count(3)
        expect(rows.first).to_contain_text('\u676d\u5dde\u5e02')
        assert rows.evaluate_all('(els)=>els.map(e=>e.dataset.studentRow)') == ids
        page.reload(wait_until='domcontentloaded')
        expect(rows).to_have_count(3)
        passed('return-to-workbench save, reopen, and refresh preserve edits')
        page.get_by_role('button',name='\u8fd4\u56de\u9879\u76ee\u5217\u8868',exact=True).click()
        upload = page.get_by_label('\u5bfc\u5165\u5de5\u7a0b\u5305\u6587\u4ef6',exact=True)
        upload.set_input_files(str(OUT/'source.cengfan'))
        page.get_by_role('button',name='\u6253\u5f00\u9879\u76ee source',exact=True).click()
        page.wait_for_url(re.compile(r'#/project/'))
        page.get_by_role('button',name=re.compile('^\u540d\u5355')).click()
        expect(rows).to_have_count(3)
        expect(rows.first).to_contain_text('\u676d\u5dde\u5e02')
        expect(rows.first).to_have_class(re.compile('is-hidden'))
        assert rows.evaluate_all('(els)=>els.map(e=>e.dataset.studentRow)') == ids
        passed('source package import round-trip preserves roster identities')
        assert not results['page_errors']
        results['status']='passed'
    except Exception as error:
        results['status']='failed';results['error']=str(error)
        page.screenshot(path=str(OUT/'failure.png'))
        (OUT/'failure-body.txt').write_text(page.locator('body').inner_text())
        raise
    finally:
        (OUT/'result.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
        context.close()
        browser.close()
