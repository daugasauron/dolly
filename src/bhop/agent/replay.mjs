// A portable replay made only of the recorded framebuffers and input events. SPDX-License-Identifier: GPL-2.0-or-later
import { recording, framePath, attemptPath } from './player.js';
export async function exportReplay(fs,run,scratch,command) {
  const attempts=[];
  const names=fs.readdirSync(run).filter(name=>/^attempt-\d{6}$/.test(name)).sort();
  for(const name of names) {
    const saved=recording(fs,run,Number(name.slice(8))),file=`${attemptPath(run,saved.attempt)}/inputs.jsonl`;
    attempts.push({id:saved.attempt,frames:saved.frames.map(frame=>({...frame,url:'data:image/png;base64,'+fs.readFileSync(framePath(run,saved.attempt,frame.index)).toString('base64')})),
      inputs:fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[]});
  }
  const path=`${scratch}/bhop-attempts.html`;
  fs.writeFileSync(path,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Airtime attempt review</title>
<style>body{margin:0;background:#0c121b;color:#e7ebea;font:16px system-ui}main{max-width:1200px;margin:auto;padding:20px}header,nav{display:flex;gap:16px;align-items:center;flex-wrap:wrap}h1{font-size:22px}button,select{font:inherit;background:#263f49;color:inherit;border:1px solid #597a88;padding:8px}img{display:block;width:100%;margin:16px 0}input{flex:1;min-width:180px}pre{white-space:pre-wrap;max-height:240px;overflow:auto;color:#91dae0}small{color:#a4b1b9}</style>
<main><header><h1>Airtime / Attempt review</h1><select aria-label="Attempt"></select><small>Recorded framebuffers and keyboard/mouse events</small></header>
<img alt="Recorded bhop framebuffer"><nav><button id="play">Play</button><button id="back">Previous</button><input type="range" min="0" value="0" aria-label="Frame"><button id="next">Next</button><output></output></nav><pre></pre></main>
<script>const attempts=${JSON.stringify(attempts).replace(/</g,'\\u003c')},select=document.querySelector('select'),slider=document.querySelector('input'),output=document.querySelector('output'),image=document.querySelector('img');let timer;
for(const a of attempts)select.add(new Option('Attempt '+a.id,a.id));select.selectedIndex=attempts.length-1;
function current(){return attempts.find(a=>a.id===Number(select.value))}
function draw(){const a=current(),f=a?.frames[Number(slider.value)];slider.max=Math.max(0,(a?.frames.length||1)-1);if(!f){output.textContent='No frames recorded yet';return}image.src=f.url;output.textContent='Frame '+f.index+' · '+(f.milliseconds/1000).toFixed(2)+' s';document.querySelector('pre').textContent=a.inputs.filter(e=>e.tick<=f.tick&&e.tick>f.tick-20).map(e=>e.type===1?(e.tick*10)+' ms '+e.code+(e.action?' down':' up'):e.type===8?(e.tick*10)+' ms mouse ('+e.dx_milli/1000+', '+e.dy_milli/1000+')':e.type===7?(e.tick*10)+' ms wheel '+e.action:(e.tick*10)+' ms pointer '+(e.action?'captured':'released')).join('\\n')}
function stop(){clearTimeout(timer);timer=null;document.querySelector('#play').textContent='Play'}
function step(){const a=current(),n=Number(slider.value);if(!a||n>=a.frames.length-1){stop();return}timer=setTimeout(()=>{slider.value=n+1;draw();step()},Math.max(10,a.frames[n+1].milliseconds-a.frames[n].milliseconds))}
select.onchange=()=>{stop();slider.value=0;draw()};slider.oninput=()=>{stop();draw()};document.querySelector('#back').onclick=()=>{stop();slider.value=Number(slider.value)-1;draw()};document.querySelector('#next').onclick=()=>{stop();slider.value=Number(slider.value)+1;draw()};document.querySelector('#play').onclick=()=>{if(timer)stop();else{if(Number(slider.value)>=Number(slider.max))slider.value=0;draw();document.querySelector('#play').textContent='Pause';step()}};draw();</script></html>`);
  if(fs.statSync(path).size>64*1024*1024)throw Error(`Replay exceeds Dolly's 64 MiB download limit. All recorded PNGs remain in ${run}.`);
  if(await command('download',[path]))throw Error('Could not export the attempt replay');
}
