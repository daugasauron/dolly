// A new user's path through the local models, in Chrome and the installed Firefox on a
// hardware GPU: pi-local's engine, sessions and offline boot, then in pi-local a task with
// the bundled model, a second model installed and chosen with /local, its temperature and
// context size changed there, and the task again.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {launchInstalledFirefox} from '../../../test/browser.mjs';
import {startBrowserServer} from '../../../test/browser-server.mjs';
import {browsers} from '../../browsers.mjs';
import {acceptDownload,demoTest} from '../../browser.mjs';

const output=new URL('../../../build/llm-proof/',import.meta.url);
await mkdir(output,{recursive:true});
// The extension's hint on Pi's start screen, beside dolly-tools' sandbox line.
const hint=/\/local chooses/;

// Without a GPU, in headless Chrome on its software adapter: pi-local starts with the hint
// beside dolly-tools' sandbox line, and /local takes the hint away without loading a model.
for(const browser of browsers) await demoTest('pi-local start screen',{image:'pi-local',browser,webgpu:true},async({open})=>{
  const {page,text,waitText,input}=await open({prompt:null,viewport:{width:1280,height:840}});
  await waitText(/sandbox/);
  await waitText(hint);
  await page.screenshot({path:new URL(`${browser}-pi-local-start.png`,output).pathname});
  await input('/local\r');await waitText(/Local models/);
  await input('\x1b');await page.waitForTimeout(500);
  assert.doesNotMatch(await text(),hint);
});

if(!process.env.DISPLAY){console.log('local-llm: skipped: the model steps need a GPU window on DISPLAY');process.exit(77);}

const root=new URL('../../../',import.meta.url).pathname;
// The model pi-local bundles, and the one the user installs next (DOLLY_LLM_SECOND names another
// package of the demo's models: qwen3.5-4b or lfm2.5, run on demand).
const model='qwen3.5-2b',weights=`/usr/share/dolly/llm/${model}.gguf`,second=process.env.DOLLY_LLM_SECOND??'minicpm5-2b';

for(const image of (process.env.DOLLY_LLM_IMAGES??'pi-local').split(',')) {
  // CSP denies external model servers without disabling the browser HTTP cache.
  const site=await startBrowserServer(root,image,{responseHeaders:{'content-security-policy':"connect-src 'self'"}});
  try {
    for(const name of (process.env.DOLLY_LLM_BROWSERS??'chromium,firefox').split(',')) {
      const browser=await (name==='chromium'
        ? chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan']})
        : launchInstalledFirefox());
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
          if(image==='pi-local')await until(/sandbox/,`${label} with the sandbox line`);
          await until(hint,`${label} naming /local`);
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
          // A save is the whole filesystem, the model's weights with it.
          assert.equal(await submit(`test "$(stat -c %s ${weights})" -lt ${savedBytes}`),0,`the save (${savedBytes} bytes) lacks the weights`);
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
        // need a second ask, in a new session: a reply it ran on with fills the context, and Pi
        // then cuts the next replies short.
        const task=async file=>{
          for(let attempt=1;;attempt++) {
            await type(`Create /workspace/${file} containing the word dolly, then show it with cat.`);
            await until(/Working/,'working model',60000);
            for(let quiet=0,end=Date.now()+600000;quiet<4;await page.waitForTimeout(500)) {
              quiet=/Working/.test(await text().catch(()=>'Working'))?0:quiet+1;
              assert.ok(Date.now()<end,`${image} ${name}: the turn on ${file} did not end:\n${await text().catch(()=>'')}`);
            }
            await type(`! grep -q dolly /workspace/${file} && printf 'FILE${attempt}-%s\\n' WRITTEN || printf 'FILE${attempt}-%s\\n' MISSING`);
            if((await until(new RegExp(`FILE${attempt}-(WRITTEN|MISSING)`),'file check')).includes(`FILE${attempt}-WRITTEN`))return;
            assert.ok(attempt<3,`${image} ${name}: ${file} was not written:\n${await text()}`);
            await type('/new');await page.waitForTimeout(2500);
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
        assert.doesNotMatch(await text(),hint,'the hint stays after the first prompt');
        await page.screenshot({path:new URL(`${name}-${image}-first.png`,output).pathname});
        await type('/local');
        await until(/Local models · this GPU adapter runs/,'/local');
        assert.match(await text(),new RegExp(`${model} · [\\d.]+ GB GPU memory · in use`));
        assert.match(await text(),new RegExp(`${second} · [\\d.]+ GB GPU memory · not installed`));
        await page.screenshot({path:new URL(`${name}-${image}-local.png`,output).pathname});
        await choose(`${second} ·`);
        await until(new RegExp(`amy install ${second}`),'install question');
        await key('Enter');
        await until(/Using /,'installed model',900000);
        // Sets one parameter of the model in use through /local and leaves the list open.
        const parameter=async(name,value)=>{
          await type('/local');await until(/Local models/,'/local');
          await choose('Parameters of');await until(new RegExp(`${name} =`),'parameters');
          await choose(`${name} =`);await until(new RegExp(`${name} for`),`${name} question`);
          await type(value);await until(new RegExp(`${name} = ${value}`),`changed ${name}`);
        };
        await parameter('temperature','0.35');
        await page.screenshot({path:new URL(`${name}-${image}-parameters.png`,output).pathname});
        await key('Escape');await page.waitForTimeout(500);
        // A context the adapter cannot hold is refused at the next prompt and Pi goes on; a
        // context that fits reloads the model with it and Pi's window follows.
        await parameter('contextWindow','1048576');await key('Escape');await page.waitForTimeout(500);
        await type('Say hi.');
        await until(/asked for|Unable to create inference context|Local model exited/,'refused context',300000);
        await page.screenshot({path:new URL(`${name}-${image}-refused-context.png`,output).pathname});
        await parameter('contextWindow','12288');await key('Escape');await page.waitForTimeout(500);
        await until(/\/12k/,'context in the footer');
        // The model chosen with /local is Pi's default: a new session still runs on it.
        await type('/new');await page.waitForTimeout(2500);
        await task('second.txt');
        await until(new RegExp(`${second} · [\\d.]+ tokens/s`),'rate of the second model');
        await page.screenshot({path:new URL(`${name}-${image}-second.png`,output).pathname});
        await shell('shell after Pi');
        assert.equal(await submit(`amy installed | grep -q "^${second} "`),0,`${second} is not installed`);
        // The user's values are Pi's overrides; the engine sampled with one and was loaded with the other.
        assert.equal(await submit(`grep -q '"temperature": 0.35' /home/dolly/.pi/agent/models.json && grep -q 'temperature 0.35' /home/dolly/.cache/dolly-llm/engine.log`),0,await text());
        assert.equal(await submit(`grep -q '"contextWindow": 12288' /home/dolly/.pi/agent/models.json && grep -q 'n_ctx *= 12288' /home/dolly/.cache/dolly-llm/engine.log`),0,await text());
        const external=requests.filter(url=>new URL(url).origin!==site.origin);
        assert.deepEqual(external,[],'Local models attempted external network access');
        assert.deepEqual(errors,[]);
        console.log(image,name,`task with ${model}, ${second} installed and chosen with /local, temperature and context size changed, task again: passed with external requests denied`);
      } finally {await browser.close();}
    }
  } finally {await site.close();}
}
