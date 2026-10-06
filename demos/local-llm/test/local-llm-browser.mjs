// A new user's path through the local models, in Chrome and the installed Firefox on a
// hardware GPU: pi-local's engine, sessions and offline boot, then in pi-local and in
// Dollyfile Studio a task with the bundled model, a second model installed and chosen
// with /local, a parameter changed there, and the task again.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright-core';
import {startBrowserServer} from '../../../test/browser-server.mjs';
import {acceptDownload} from '../../browser.mjs';

if(!process.env.DISPLAY){console.log('local-llm: skipped, it needs a GPU window on DISPLAY');process.exit(0);}

const root=new URL('../../../',import.meta.url).pathname;
// The model both images bundle, and the one the user installs next: the most capable
// model the adapter's shader kind can load.
const model='qwen3.5-2b',weights=`/usr/share/dolly/llm/${model}.gguf`;
const second={f16:{id:'qwen3.5-4b',packages:['qwen3.5-4b-1','qwen3.5-4b-2','qwen3.5-4b-3','qwen3.5-4b-4']},f32:{id:'minicpm5-2b',packages:['minicpm5-2b']}};
const output=new URL('../../../build/llm-proof/',import.meta.url);
await mkdir(output,{recursive:true});
// Playwright drives the installed Firefox, which on Ubuntu is a snap with a
// private /tmp: its profile and downloads must live under $HOME.
process.env.TMPDIR=new URL('tmp/',output).pathname;await mkdir(process.env.TMPDIR,{recursive:true});

for(const image of (process.env.DOLLY_LLM_IMAGES??'pi-local,dollyfile-studio').split(',')) {
  // CSP denies external model servers without disabling the browser HTTP cache.
  const site=await startBrowserServer(root,image,{responseHeaders:{'content-security-policy':"connect-src 'self'"}});
  try {
    for(const name of (process.env.DOLLY_LLM_BROWSERS??'chromium,firefox').split(',')) {
      const browser=await ({chromium,firefox})[name].launch(name==='chromium'
        ? {channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan']}
        : {channel:'moz-firefox',headless:false,firefoxUserPrefs:{'dom.webgpu.enabled':true}});
      try {
        const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:840}});
        const page=await context.newPage(),errors=[],requests=[];
        page.on('pageerror',error=>errors.push(String(error)));
        page.on('request',request=>requests.push(request.url()));
        const text=()=>page.evaluate(()=>__dolly.visibleTerminalText());
        const submit=command=>{
          console.log(image,name,'run',command.slice(0,90));
          return page.evaluate(command=>__dolly.submit(command),command);
        };
        const until=async(pattern,label,timeout=120000)=>{
          for(const end=Date.now()+timeout;;await page.waitForTimeout(500)) {
            const visible=await text().catch(()=>'');
            if(pattern.test(visible))return visible;
            assert.ok(Date.now()<end,`${image} ${name}: no ${label}:\n${visible}`);
          }
        };
        const key=async value=>{await page.locator('#keyboard').focus();await page.keyboard.press(value);};
        const type=async value=>{await page.locator('#keyboard').focus();await page.keyboard.type(value,{delay:10});await page.keyboard.press('Enter');};
        const boot=async label=>{
          await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus),null,{timeout:240000});
          assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready',await page.locator('#bootstrap-log').textContent());
          await until(new RegExp(model.replaceAll('.','\\.')),label);
          // Pi draws its footer before it reads keys.
          await page.waitForTimeout(2000);
        };
        const shell=async label=>{await key('Control+d');await until(/dolly:[^\n]*\$\s*$/,label);await page.waitForTimeout(300);};

        await page.goto(site.origin+`/${image}/`);
        await boot('Pi with the bundled model');
        console.log(image,name,'image booted');
        if(image==='pi-local') {
          const snapshotDownloads=()=>[...site.requests].filter(([path])=>/\.snapshot(?:\.gz)?$/.test(path)).reduce((total,[,count])=>total+count,0);
          assert.ok(snapshotDownloads()>0,'Initial boot did not fetch snapshot bytes');
          await page.screenshot({path:new URL(`${name}-pi.png`,output).pathname});
          await shell('recovery shell');
          assert.equal(await submit('dolly-llama --check'),0,await text());
          const upload=submit('upload /workspace/local-llm-proof.mjs');
          await page.waitForSelector('#file-upload[open]');
          await page.locator('#file-upload input').setInputFiles(new URL('./fixtures/local-llm.mjs',import.meta.url).pathname);
          assert.equal(await upload,0);await page.waitForTimeout(200);
          const running=submit(`janis /workspace/local-llm-proof.mjs ${model}`);
          const progress=setInterval(()=>{void text().then(value=>console.log(name,value.slice(-360)),()=>{});},30000); // progress only: the screen may not answer while a model step runs
          let status;try{status=await running;}finally{clearInterval(progress);}
          assert.equal(status,0,await text());
          assert.match(await text(),/LOCAL-LLM-PROOF-OK/);
          const downloading=submit('download /workspace/local-llm-proof.json'),download=acceptDownload(page,()=>downloading);
          const file=await download;const resultPath=new URL(`${name}.json`,output).pathname;
          await file.saveAs(resultPath);assert.equal(await downloading,0);await page.waitForTimeout(200);
          const result=JSON.parse(await readFile(resultPath,'utf8'));
          assert.equal(result.cancel,true);assert.equal(result.restart,true);assert.equal(result.reuse,true);
          // Pi's own agent loop on the local model: several distinct tool calls and a final answer.
          const checker=submit('upload /tmp/agent-proof.mjs');
          await page.waitForSelector('#file-upload[open]');
          await page.locator('#file-upload input').setInputFiles(new URL('./fixtures/agent-proof.mjs',import.meta.url).pathname);
          assert.equal(await checker,0);await page.waitForTimeout(200);
          const task='List the files in /workspace, write hello.c that prints the numbers 1 to 5, compile it with cc -o hello hello.c, run ./hello and tell me its output.';
          // A 2B model sometimes errs on its own; a harness fault fails every attempt.
          for(let attempt=1;;attempt++) {
            const agent=Date.now();
            assert.equal(await submit(`timeout 600 pi --mode json -p '${task}' > /tmp/agent.jsonl`),0,await text());
            const status=await submit('janis /tmp/agent-proof.mjs /tmp/agent.jsonl');
            console.log(name,'agent task attempt',attempt,(Date.now()-agent)/1000,'s:',(await text()).match(/AGENT-PROOF-\S+.*/)?.[0]);
            assert.equal(await submit('rm -f /workspace/hello /workspace/hello.c /workspace/a.out'),0);
            if(status===0)break;
            assert.ok(attempt<3,await text());
          }
          assert.equal(await submit('printf saved > /workspace/session-proof.txt'),0);
          assert.equal(await page.evaluate(()=>__dolly.saveSession('llm-proof')),'llm-proof');
          const savedBytes=await page.evaluate(()=>Number(document.documentElement.dataset.sessionUncompressedBytes));
          assert.ok(savedBytes<10*1024*1024,`Base model was copied into the session (${savedBytes} bytes)`);
          assert.equal(await submit(`janis -e 'const fs=process.getBuiltinModule("node:fs");const fd=fs.openSync("${weights}","r+");fs.writeSync(fd,new Uint8Array([0]),0,1,0);fs.closeSync(fd);'`),0);
          await assert.rejects(page.evaluate(()=>__dolly.saveSession('llm-proof')),/session|snapshot|large|save/i);
          await page.reload();
          await boot('restored Pi');
          await shell('restored recovery shell');
          assert.equal(await submit(`test -f ${weights} && cat /workspace/session-proof.txt`),0);
          assert.match(await text(),/saved/);
          assert.equal(await submit(`janis /workspace/local-llm-proof.mjs ${model}`),0,await text());
          // Open the original image, without the saved session or its workspace.
          await page.goto(site.origin+`/${image}/`);
          await boot('fresh Pi');
          await writeFile(resultPath,JSON.stringify({...result,browser:name,version:browser.version(),savedBytes,restored:true,freshBoot:true},null,2)+'\n');
          console.log(name,'bundled inference, reuse, cancellation, session restore and fresh boot passed');
        }

        // From here on the keyboard only, in Pi.
        // A turn is over when Pi worked and then shows no work for a while; a small model may
        // need a second ask.
        const task=async file=>{
          for(let attempt=1;;attempt++) {
            await type(`Create /workspace/${file} containing the word dolly, then show it with cat.`);
            await until(/Working/,'working model',60000);
            for(let quiet=0;quiet<4;await page.waitForTimeout(500))quiet=/Working/.test(await text().catch(()=>'Working'))?0:quiet+1;
            await type(`! grep -q dolly /workspace/${file} && printf 'FILE${attempt}-%s\\n' WRITTEN || printf 'FILE${attempt}-%s\\n' MISSING`);
            if((await until(new RegExp(`FILE${attempt}-(WRITTEN|MISSING)`),'file check')).includes(`FILE${attempt}-WRITTEN`))return;
            assert.ok(attempt<3,`${image} ${name}: ${file} was not written:\n${await text()}`);
          }
        };
        // Moves the selector's arrow to the row holding text, then takes it.
        const choose=async row=>{
          for(let moves=0;!(await text()).split('\n').some(line=>line.includes('→') && line.includes(row));moves++) {
            assert.ok(moves<24,`${image} ${name}: no row ${row}:\n${await text()}`);
            await key('ArrowDown');await page.waitForTimeout(150);
          }
          await key('Enter');
        };
        await task('first.txt');
        await page.screenshot({path:new URL(`${name}-${image}-first.png`,output).pathname});
        await type('/local');
        const shaders=/this GPU adapter runs (f16|f32) shaders/.exec(await until(/Local models · this GPU adapter runs/,'/local'))[1];
        const next=second[shaders];
        assert.match(await text(),new RegExp(`${model} · [\\d.]+ GB GPU memory · in use`));
        assert.match(await text(),new RegExp(`${next.id} · [\\d.]+ GB GPU memory · not installed`));
        await page.screenshot({path:new URL(`${name}-${image}-local.png`,output).pathname});
        await choose(`${next.id} ·`);
        await until(new RegExp(`amy install ${next.packages.join('[\\s\\S]*')}`),'install question');
        await key('Enter');
        await until(/Using /,'installed model',900000);
        await type('/local');await until(/Local models/,'/local');
        await choose('Parameters of');await until(/temperature =/,'parameters');
        await choose('temperature =');await until(/temperature for/,'temperature question');
        await type('0.35');await until(/temperature = 0\.35/,'changed temperature');
        await page.screenshot({path:new URL(`${name}-${image}-parameters.png`,output).pathname});
        await key('Escape');await page.waitForTimeout(500);
        await task('second.txt');
        await until(new RegExp(`${next.id.replaceAll('.','\\.')} · [\\d.]+ tokens/s`),'rate of the second model');
        await page.screenshot({path:new URL(`${name}-${image}-second.png`,output).pathname});
        await shell('shell after Pi');
        for(const name of next.packages)assert.equal(await submit(`amy installed | grep -q "^${name} "`),0,`${name} is not installed`);
        // The user's value is Pi's override, and the engine sampled with it.
        assert.equal(await submit(`grep -q '"temperature": 0.35' /home/dolly/.pi/agent/models.json && grep -q 'temperature 0.35' /home/dolly/.cache/dolly-llm/engine.log`),0,await text());
        const external=requests.filter(url=>new URL(url).origin!==site.origin);
        assert.deepEqual(external,[],'Local models attempted external network access');
        assert.deepEqual(errors,[]);
        console.log(image,name,`task with ${model}, ${next.id} installed and chosen with /local, temperature changed, task again: passed with external requests denied`);
      } finally {await browser.close();}
    }
  } finally {await site.close();}
}
