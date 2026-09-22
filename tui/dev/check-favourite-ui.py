# Regression smoke test: isolated demo TUI, temporary files, no audio or model calls.
import os, pty, select, subprocess, time, tempfile, pathlib, json, fcntl, termios, struct, re, socket, sys
instant='--instant' in sys.argv
root=pathlib.Path(tempfile.mkdtemp(prefix='ears-favourite-ui-'))
for folder in ['moments','set','logs']: (root/folder).mkdir()
clip=root/'moments/fixture.wav';clip.write_bytes(b'fixture; never played')
m={'version':1,'id':'fixture','favorite':True,'label':'kept test groove','saved_at':1,'clip':{'path':str(clip)},'context_at_request':{'tempo':110,'key':'C major','active_slots':{'d4':r'~d.(\d4, \instrument, \bass, \dur, 1/4, \midinote, Pseq([36, 43, 48, 43], inf))'}},'events':[]}
if instant:
 m['context_at_request']['active_slots']['d2']=r'~d.(\d2, \instrument, \hat, \dur, 1/4, \amp, ~x.("X--X--X---X--X--", 0.2))'
 for slot,instrument in [('d2','hat'),('d3','clap')]:
  (root/'set'/f'{slot}.scd').write_text('~d.(\\'+slot+', \\instrument, \\'+instrument+', \\dur, 1/4, \\amp, ~x.("--X---X---X---X-", 0.2))')
(root/'moments/fixture.json').write_text(json.dumps(m))
master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',48,160,0,0))
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
env=dict(os.environ,TERM='xterm-256color',EARS_SET=str(root/'set'),EARS_MOMENTS_DIR=str(root/'moments'),EARS_LOG_DIR=str(root/'logs'),EARS_BUS_PORT=str(port),EARS_ANGLES='0')
p=subprocess.Popen(['./node_modules/.bin/tsx','tui/app.tsx','--demo','--keep','--manual','--mute'],cwd=str(pathlib.Path(__file__).resolve().parents[2]),env=env,stdin=slave,stdout=slave,stderr=slave);os.close(slave)
data=bytearray()
def pump(seconds=.4):
 end=time.monotonic()+seconds; start=len(data)
 while time.monotonic()<end:
  if select.select([master],[],[],.04)[0]:
   try:data.extend(os.read(master,65536))
   except OSError:break
 return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', bytes(data[start:]).decode(errors='replace'))
def key(value,seconds=.4):os.write(master,value.encode());return pump(seconds)
def events():
 files=[f for f in (root/'logs').glob('*.jsonl') if not f.is_symlink()]
 return [json.loads(line) for f in files for line in f.read_text().splitlines()]
try:
 pump(3)
 assert 'kept moments' in key('H'), 'memory picker missing'
 action=key('\r'); assert 'Mutate its rhythm' in action and 'Replay the captured audio' in action, 'action menu missing'
 key('\x1b[B'); developed=key('\r')
 assert any(e['type']=='inspiration' and e['decision']=='develop' and e['intent']=='rhythm' for e in events()), 'development not selected'
 assert ('2 ideas ready' if instant else 'waiting for listening report') in developed, 'incorrect request status'
 if instant:
  proposals=[e for e in events() if e['type']=='proposal']
  assert len(proposals)==2 and all(e.get('origin')=='recipe' and e.get('based_on_revision') for e in proposals), 'instant moves bypassed protocol metadata'
  assert not any(e['type']=='request' for e in events()), 'instant moves waited on a model request'
 # Deliver a proposal through the real bus/render path, without taking it or starting an engine.
 revision=[e['revision'] for e in events() if e['type']=='state'][-1]
 with socket.create_connection(('127.0.0.1',port)) as wire:
  wire.sendall((json.dumps({'v':0,'type':'proposal','from':'resident','request_id':'ui-regression',
   'based_on_revision':revision,'slot':'d4','code':r'~d.(\d4, \instrument, \bass, \dur, 1/4, \midinote, 48)',
   'why':'Answer the kept bass motif','evidence':'saved d4','expect':{'metric':'density','dir':'same'}})+'\n').encode())
  ready=pump(.7)
 assert ('3 ideas ready' if instant else '1 idea ready') in ready and ('1/2/3 take' if instant else '1 take') in ready, 'arrived option missing from footer'
 stage=key('f'); assert ('3 ideas ready' if instant else '1 idea ready') in stage, 'stage mode hides available option status'
 key('f')
 key('J')
 assert any(e['type']=='inspiration' and e['decision']=='clear' for e in events()), 'clear missing'
 key('H');key('\r'); back=key('\x1b',.6)
 assert 'kept moments' in back, 'escape did not return to picker'
 key('\x1b',.3);key('q',1)
 p.wait(timeout=3)
 assert p.returncode==0, f'exit {p.returncode}'
 assert not any(e['type'] in ['audition','applied','inbound'] for e in events()), 'selection unexpectedly changed output'
 assert len(list((root/'set').iterdir())) == (2 if instant else 0), 'unexpected source write'
 (root/'action-screen.txt').write_text(re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',action))
 print(json.dumps({'passed':['picker','development action','waiting-report status','ready-option status','stage status','clear','escape back','clean quit','no playback or source writes'],'evidence':str(root)}))
finally:
 (root/"terminal.txt").write_bytes(data)
 print("terminal log", root/"terminal.txt")
 if p.poll() is None:p.terminate();p.wait(timeout=3)
 os.close(master)
