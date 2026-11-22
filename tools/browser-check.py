"""Local DOM simulation only; does not execute Foundry's renderer or turn hooks."""
import functools
import http.server
import json
import os
import shutil
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = r'''
<html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles/round-initiative.css">
<style>body{background:#16151b;font:14px Arial;color:#eee;margin:0;padding:24px}*{box-sizing:border-box}button{font:inherit;cursor:pointer}#tracker{width:300px;background:#211c28}#tracker button{height:70px;min-height:70px;padding:16px}#tracker li{list-style:none;padding:8px}.combatant-controls{display:flex;align-items:center;gap:4px;min-height:20px}footer{display:flex;flex-direction:column}.combat-controls,.zft-turn-time-controls{padding:8px}#underlay{position:fixed;left:45%;top:37%;z-index:1}</style>
</head><body><section id="tracker"><header class="combat-tracker-header" data-application-part="header">Round and settings</header><ol id="entries" class="directory-list" data-application-part="tracker"></ol><footer><nav class="combat-controls"><button id="native">Native Next Turn</button></nav><div class="zft-turn-time-controls">Existing timing controls</div></footer></section><button id="underlay">Existing canvas control</button>
<script type="module">
const {setup}=await import('/tests/helpers.js');setup();
for(const combatant of game.combat.combatants){const row=document.createElement('li');row.dataset.combatantId=combatant.id;const name=document.createElement('h4');name.textContent=combatant.name;const controls=document.createElement('div');controls.className='combatant-controls';const target=document.createElement('a');target.textContent='Native target';controls.append(target);const initiative=document.createElement('div');initiative.className='token-initiative';initiative.textContent=combatant.initiative.toFixed(2);row.append(name,controls,initiative);document.getElementById('entries').append(row);}
const hooks=new Map();globalThis.Hooks={on:(n,f)=>{if(!hooks.has(n))hooks.set(n,[]);hooks.get(n).push(f);},once:(n,f)=>Hooks.on(n,f),callAll:(n,...args)=>{for(const f of hooks.get(n)??[])f(...args);}};
globalThis.foundry={applications:{api:{ApplicationV2:class{},HandlebarsApplicationMixin:Base=>Base,DialogV2:{wait:async()=>true}}},utils:{escapeHTML:s=>String(s),randomID:()=>crypto.randomUUID(),hasProperty:(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o)!==undefined}};
const values=new Map();const prior=game.settings.get;
game.settings={get:(id,k)=>values.has(k)?values.get(k):prior(id,k),set:async(_id,k,v)=>{values.set(k,v);return v;},register:(_id,k,v)=>{if(!values.has(k))values.set(k,v.default);}};
const module={};game.modules={get:()=>module};
ui.combat={viewed:game.combat,activate(){},render:()=>Hooks.callAll('renderCombatTracker',ui.combat,document.getElementById('tracker'))};
const setFlag=game.combat.setFlag;
game.combat.setFlag=async function(ns,key,value){await setFlag.call(this,ns,key,value);Hooks.callAll('updateCombat',this,{flags:{[ns]:{[key]:value}}},{},game.user.id);};
const update=game.combat.update;
game.combat.update=async function(changes){await update.call(this,changes);Hooks.callAll('updateCombat',this,changes,{},game.user.id);return this;};
const setInitiative=game.combat.setInitiative;game.combat.setInitiative=async function(id,value){await setInitiative.call(this,id,value);Hooks.callAll('updateCombatant');};
window.underlayClicks=0;document.getElementById('underlay').onclick=()=>underlayClicks++;
window.baselineRowHeights=Array.from(document.querySelectorAll('[data-combatant-id]'),e=>e.getBoundingClientRect().height);
await import('/scripts/main.js');Hooks.callAll('init');Hooks.callAll('ready');window.fixtureReady=true;
</script></body></html>
'''

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_GET(self):
        if self.path == '/fixture':
            data=FIXTURE.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(data)
        else:super().do_GET()

def main():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    checks=[]
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':1280,'height':900})
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/fixture')
            page.wait_for_function('window.fixtureReady === true')
            assert page.locator('.zft-ri-tracker-tools').count()==1
            assert page.locator('.zft-ri-current').count()==4
            assert page.locator('.zft-ri-tracker-button').count()==5
            page.evaluate("Hooks.callAll('renderCombatTracker',ui.combat,document.getElementById('tracker'))")
            assert page.locator('.zft-ri-tracker-tools').count()==1
            assert page.locator('#native,.zft-turn-time-controls').count()==2
            assert page.locator('.zft-ri-tracker-tools').evaluate('(e)=>e.previousElementSibling.classList.contains("combat-tracker-header") && e.nextElementSibling.id==="entries"')
            assert page.locator('.zft-ri-current').first.evaluate('(e)=>e.tagName')=='A'
            assert page.locator('.zft-ri-current-wrap').first.bounding_box()['height']<=20
            assert page.locator('.zft-ri-current').first.bounding_box()['height']<=20
            assert page.locator('.zft-ri-tracker-tools').bounding_box()['height']<=32
            for control in page.locator('.zft-ri-tracker-button').all():
                assert control.evaluate('(e)=>e.tagName')=='A'
                box=control.bounding_box();assert box['height']==24 and box['width']==24
            assert page.evaluate('Array.from(document.querySelectorAll("[data-combatant-id]"),e=>e.getBoundingClientRect().height).every((h,i)=>h===baselineRowHeights[i])')
            checks.append('32px strip and 24px inline controls resist oversized button rules; character rows retain baseline height')
            score=page.locator('[data-combatant-id=b] .zft-ri-edit-score')
            score.click();field=page.locator('.zft-ri-initiative-input');field.fill('28.20');field.press('Enter')
            page.wait_for_function("game.combat.combatants.get('b').initiative===28.2")
            assert page.evaluate('game.combat.combatant.id')=='a'
            score.click();field=page.locator('.zft-ri-initiative-input');field.fill('2');field.press('Escape')
            assert page.evaluate("game.combat.combatants.get('b').initiative")==28.2
            checks.append('inline decimal save preserves current combatant; Escape cancels')
            page.locator('[data-zft-ri-action=restore]').focus()
            assert 'Unavailable' in page.locator('#zft-ri-tooltip').inner_text()
            checks.append('keyboard-focus tooltip explains disabled recovery')
            page.locator('[data-zft-ri-action=prepare]').click()
            page.wait_for_function("document.querySelector('[data-zft-ri-action=prepare]').disabled")
            assert page.locator('#zft-ri-notice').inner_text().startswith('Round 1: Roll Initiative')
            assert page.evaluate("getComputedStyle(document.getElementById('zft-ri-notice')).pointerEvents")=='none'
            page.locator('#underlay').click();assert page.evaluate('underlayClicks')==1
            checks.append('embedded request clears/rolls and shows a pointer-transparent notice')
            page.evaluate("game.combat.combatants.get('a').initiative=23;Hooks.callAll('updateCombatant')")
            page.locator('[data-zft-ri-action=begin]').click()
            page.wait_for_function("document.querySelector('[data-zft-ri-action=restore]').disabled===false")
            assert 'Protected' in page.locator('.zft-ri-tracker-status').inner_text()
            page.locator('[data-combatant-id=c] .zft-ri-current').click()
            page.wait_for_function("game.combat.combatant.id==='c'")
            assert page.locator('[data-combatant-id=c] .zft-ri-current').is_disabled()
            checks.append('begin protects then row button selects the exact NPC')
            page.evaluate("game.combat.combatants.forEach(c=>c.initiative=null);game.combat.turn=2;Hooks.callAll('updateCombatant')")
            before=page.evaluate('game.combat.combatant.id')
            page.locator('[data-zft-ri-action=restore]').click()
            page.wait_for_function("game.combat.combatants.get('a').initiative===23")
            assert page.evaluate('game.combat.combatant.id')==before
            checks.append('mid-round recovery retains selected combatant and restores saved values')
            for width in (300,260,220):
                page.locator('#tracker').evaluate('(e,w)=>e.style.width=w+"px"',width)
                assert page.locator('.zft-ri-tracker-tools').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
                assert page.locator('[data-zft-ri-action=restore]').is_visible()
            checks.append('toolbar wraps at narrow tracker widths without hiding recovery')
            screenshot_dir=Path(os.environ.get('ZFT_UI_CHECK_OUTPUT',ROOT.parent/'ui-check'));screenshot_dir.mkdir(exist_ok=True)
            page.screenshot(path=str(screenshot_dir/'embedded-tracker.png'),full_page=True)
            page.evaluate("game.user.isGM=false;game.user.isActiveGM=false;Hooks.callAll('renderCombatTracker',ui.combat,document.getElementById('tracker'))")
            assert page.locator('.zft-ri-tracker-tools,.zft-ri-current').count()==0
            assert page.locator('#native,.zft-turn-time-controls').count()==2
            checks.append('player render removes GM controls and retains existing controls')
            assert not errors,errors
            browser.close()
        result={'evidence':'locally-validated DOM simulation; not Foundry','checks':checks,'count':len(checks),'browser_errors':errors}
        (ROOT/'docs/validation/browser-check.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result,indent=2))
    finally:server.shutdown()

if __name__=='__main__':main()
