"""Discovery, PNG metadata, fallback manifest and unsafe/broken resource rejection."""
import copy
import json
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from build_themes import ROOT, build


def test():
    with TemporaryDirectory() as tmp:
        root=Path(tmp)/'themes'
        shutil.copytree(ROOT,root)
        assert list(build(root))==['classic']
        fixture=root/'test-theme'
        fixture.mkdir()
        shutil.copytree(root/'classic/creatures',fixture/'frames')
        (fixture/'style.css').write_text('/* test */')
        m=build(root)['classic']
        m.update(id='test-theme', displayName='Test theme', stylesheet='style.css',
                 states={'H':dict(frames=['frames/human.png','frames/human-scared.png'],fps=12,pivot=[.5,.5],facingDegrees=-90)})
        path=fixture/'theme.json'
        path.write_text(json.dumps(m))
        assert build(root)['test-theme']['states']['H']['size']==(1254,1254)
        for field,value in [('id','classic'),('schemaVersion',25),('stylesheet','../classic/classic.css'),('stylesheet','no.css'),('stylesheet','frames/human.png')]:
            path.write_text(json.dumps(m|{field:value}))
            try: build(root)
            except ValueError: continue
            raise AssertionError(field)
        for invalid in ['../classic/creatures/human.png','/tmp/a.png','frames/%2e%2e/test.png','frames/a.svg','frames/missing.png']:
            broken=copy.deepcopy(m)
            broken['states']['H']['frames']=[invalid]
            path.write_text(json.dumps(broken))
            try: build(root)
            except ValueError: continue
            raise AssertionError(invalid)
    print('PASS generated registry, second theme fixture, frame metadata, traversal, extensions, missing files, duplicate ID and schema rejection')


if __name__=='__main__': test()
