"""Deterministic complete manual-install ZIP. Requires Python 3.10+ and Node 18+."""
from pathlib import Path
import argparse
import ast
import hashlib
import json
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASE = '251a1dbe3e3aedd179b17d7582db183949cb840d'

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def tests(root):
    files = sorted(str(p.relative_to(root)) for p in (root/'tests').glob('*.test.js'))
    result = subprocess.run(['node','--test','--test-reporter=tap',*files],cwd=root,text=True,capture_output=True)
    if result.returncode: raise RuntimeError(result.stdout+'\n'+result.stderr)
    counts = {key:int(value) for key,value in re.findall(r'^# (tests|pass|fail|skipped|cancelled) (\d+)$',result.stdout,re.M)}
    if not counts.get('tests') or counts.get('fail') or counts.get('skipped') or counts.get('cancelled'):
        raise RuntimeError('Test suite did not fully pass: '+str(counts))
    return counts

def validate(root):
    manifest=json.loads((root/'module.json').read_text())
    package=json.loads((root/'package.json').read_text())
    assert manifest['id']=='zft-round-initiative'
    assert manifest['version']==package['version']
    assert manifest['compatibility']=={'minimum':'13','maximum':'13'}
    assert f'"{manifest["version"]}"' in (root/'scripts/constants.js').read_text()
    for path in root.rglob('*.json'):json.loads(path.read_text())
    js=list(root.rglob('*.js'))
    imports=[]
    for path in js:
        check=subprocess.run(['node','--check',str(path)],capture_output=True,text=True)
        if check.returncode:raise RuntimeError(check.stderr)
        for ref in re.findall(r'from\s+["\']([^"\']+)["\']',path.read_text()):
            if ref.startswith('.'):
                assert (path.parent/ref).is_file(),f'Missing import {path}: {ref}'
                imports.append([str(path.relative_to(root)),ref])
    for path in root.rglob('*.py'):ast.parse(path.read_text(),filename=str(path))
    for ref in manifest['esmodules']+manifest['styles']:assert (root/ref).is_file(),ref
    templates=list((root/'templates').glob('*.hbs'))
    for path in templates:
        stack=[]
        for token in re.findall(r'{{(.*?)}}',path.read_text(),re.S):
            token=token.strip()
            if token.startswith('#'):stack.append(token.split()[0][1:])
            elif token.startswith('/'):
                assert stack and stack.pop()==token[1:],str(path)
        assert not stack,str(path)
    assert len(templates)==2
    # CSS structural check only. A real browser parser/layout was unavailable.
    css=(root/'styles/round-initiative.css').read_text()
    assert css.count('{')==css.count('}')
    assert 'pointer-events: none' in css
    runtime='\n'.join(p.read_text() for p in (root/'scripts').glob('*.js'))
    assert not re.search(r'\.(?:nextRound|nextTurn|startCombat|resetAll)\s*\(',runtime)
    assert not re.search(r'update\s*\(\s*{\s*round\s*:',runtime)
    protected=json.loads((root/'docs/reference/provenance.json').read_text())
    for path,expected in protected['sha256'].items():assert digest(root/path)==expected,f'Protected source changed: {path}'
    license_bytes=(root/'LICENSE').read_bytes()
    blob=hashlib.sha1(b'blob '+str(len(license_bytes)).encode()+b'\0'+license_bytes).hexdigest()
    assert blob=='bd94e2af2e17272c2afb446f315a44926602362c','Original MIT license changed'
    for path in root.rglob('*.md'):
        for ref in re.findall(r'\]\(([^)]+)\)',path.read_text()):
            if ref.startswith(('https://','http://','#')):continue
            ref=ref.split('#')[0]
            assert (path.parent/ref).exists(),f'Broken local documentation link: {path} -> {ref}'
    return {'javascript_syntax_files':len(js),'resolved_imports':len(imports),'templates_checked':len(templates),
            'css':'structural brace/scoped-selector checks; browser parsing/layout NOT TESTED',
            'protected_sources':'SHA-256 verified; original MIT Git blob verified',
            'native_round_mutation':'none in module runtime'},manifest

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT.parent/'build-output');args=parser.parse_args()
    version=json.loads((ROOT/'module.json').read_text())['version']
    saved=ROOT/'artifacts'/f'zft-round-initiative-v{version}.zip'
    if saved.exists():
        raise RuntimeError(f'Version {version} is already archived. Use {saved} or increment the prerelease before building changed source.')
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=True)
    if output.is_relative_to(ROOT) and output != ROOT/'build-output':
        raise RuntimeError('Use build-output/ or an output directory outside the source tree.')
    report_path=ROOT/'docs/validation/build.json'
    if not report_path.exists():report_path.write_text('{}\n')
    static,manifest=validate(ROOT)
    test_counts=tests(ROOT)
    def sources(root):return sorted(p for p in root.rglob('*') if p.is_file() and not any(part in {'.git','__pycache__','node_modules','artifacts','build-output','ui-check'} for part in p.relative_to(root).parts))
    source_hashes={str(p.relative_to(ROOT)):digest(p) for p in sources(ROOT) if p!=report_path}
    git_head=subprocess.run(['git','-C',str(ROOT),'rev-parse','HEAD'],capture_output=True,text=True)
    source_commit=git_head.stdout.strip() if git_head.returncode==0 else BASE
    report={'module':manifest['id'],'version':manifest['version'],'baseline_commit':source_commit,
            'origin_baseline_commit':BASE,
            'source_state':'Source checkout; inspect PROJECT_STATUS.md and the Git commit for repository provenance',
            'previous_runtime_zip_sha256':'fa4d89ffc50ec8fd7e3415b4dcd9c0bea594c86a7f8023e6d3d89f7f0691afa7',
            'channel':'complete manual extraction ZIP; one module-id wrapper',
            'evidence':'locally-validated; no Foundry runtime acceptance',
            'static':static,'tests':test_counts,'extracted_zip_tests':'same suite must pass; build fails otherwise',
            'browser_ui':'NOT TESTED: Chromium local socket creation denied',
            'live_versions':'Not inspected; record actual V13/D&D5e/Midi-QOL/Carousel/Tools versions during acceptance',
            'source_sha256':source_hashes,
            'hash_scope':'All source files except this generated report, to avoid self-hashing',
            'file_classification':{'scripts/':'RUNTIME-REQUIRED','templates/':'RUNTIME-REQUIRED','styles/':'RUNTIME-REQUIRED',
                                   'docs/reference/':'PROTECTED-REFERENCE','tests/':'SOURCE-ONLY (included)','tools/':'SOURCE-ONLY (included)',
                                   'world_journals':'MUTABLE-DATA; external to archive; never purge'},
            'github':'Build command makes no GitHub writes; repository checkpoint state is recorded separately'}
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    paths=sources(ROOT)
    archive=output/f'{manifest["id"]}-v{manifest["version"]}.zip'
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for path in paths:
            name=f'{manifest["id"]}/{path.relative_to(ROOT).as_posix()}'
            info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644 << 16
            z.writestr(info,path.read_bytes())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        names=z.namelist();assert len(names)==len(set(names))==len(paths)
        assert all(name.startswith(manifest['id']+'/') for name in names)
        with tempfile.TemporaryDirectory(prefix='zft-ri-extracted-') as tmp:
            z.extractall(tmp);extracted=Path(tmp)/manifest['id']
            extracted_static,_=validate(extracted)
            extracted_tests=tests(extracted)
            assert extracted_tests==test_counts
            assert extracted_static==static
    receipt={'archive':archive.name,'sha256':digest(archive),'files':len(paths),'bytes':archive.stat().st_size,
             'version':manifest['version'],'tests':test_counts,'extracted_zip_tests':extracted_tests,
             'static':static,'zip_crc':'PASS','duplicate_paths':0,'github':'unchanged'}
    (output/(archive.stem+'-receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))

if __name__=='__main__':main()
