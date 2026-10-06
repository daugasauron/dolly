// Pi's local provider and its /local command. A model is a description under
// /usr/share/dolly/llm; requests go through Pi's own OpenAI chat-completions adapter to
// dolly-llama, which answers in llama-server's dialect over its pipes. A user's changes
// are Pi's modelOverrides in ~/.pi/agent/models.json.
import {readFileSync,writeFileSync} from 'node:fs';
import {streamSimple} from '@earendil-works/pi-ai';
import {getAgentDir} from '@earendil-works/pi-coding-agent';
import {LocalLlama,checkGpu} from '/usr/lib/dolly-llm/client.mjs';
import {models,unmet} from '/usr/lib/dolly-llm/model.mjs';

const provider='webgpu';
const gigabytes=bytes=>`${(bytes/1e9).toFixed(1)} GB`;
// llama-server's dialect, as Pi's llama.cpp provider declares it.
const dialect={supportsStore:false,supportsDeveloperRole:false,supportsReasoningEffort:false,supportsUsageInStreaming:true,
  supportsStrictMode:false,maxTokensField:'max_tokens',thinkingFormat:'qwen-chat-template'};
const onOrOff={off:'off',minimal:null,low:null,medium:'medium',high:null,xhigh:null};
const piModels=()=>models().filter(model=>model.installed).map(model=>({id:model.id,name:`${model.name} · local GPU`,input:['text'],
  cost:{input:0,output:0,cacheRead:0,cacheWrite:0},compat:dialect,...(model.pi.reasoning && {thinkingLevelMap:onOrOff}),...model.pi}));
// What /local can change: the request fields dolly-llama implements, and Pi's two limits.
const parameters=['temperature','top_p','top_k','min_p','repeat_penalty','presence_penalty','frequency_penalty','seed','contextWindow','maxTokens'];
const limits=new Set(['contextWindow','maxTokens']);

export default function(pi) {
  let ui;
  const engine=new LocalLlama(text=>ui?.setStatus('local-model',text));
  // Above the editor until the first prompt or /local: a notification would replace
  // dolly-tools' sandbox note, which Pi shows one at a time.
  const hint=show=>ui?.setWidget('local-model',show?['/local chooses and configures the local model: install, switch, context size, sampling, unload.']:undefined);
  pi.on('session_start',(_event,ctx)=>{ui=ctx.ui;hint(true);});
  pi.on('session_shutdown',()=>engine.stop());
  pi.on('provider_stream_event',event=>{
    const timings=event.provider===provider && event.data?.timings;
    if(timings)ui?.setStatus('local-model',`${event.model} · ${timings.predicted_per_second.toFixed(1)} tokens/s · ${timings.cache_n} of ${timings.cache_n+timings.prompt_n} prompt tokens reused`);
  });
  // Pi's loop has no bound on a model repeating itself: a small one can call the
  // same tool with the same input forever while the result stays the same. A third
  // identical call after two identical results is not run, and the model reads
  // why; if it insists, the run ends and the user is told.
  const key=event=>JSON.stringify([event.toolName,event.input]);
  let last,repeats=0,warned;
  pi.on('agent_start',()=>{last=undefined;repeats=0;warned=undefined;hint(false);});
  pi.on('tool_result',event=>{
    if(event.parentToolCallId || key(event)===warned)return;
    const call=key(event),result=JSON.stringify(event.content);
    repeats=last?.call===call && last.result===result?repeats+1:1;last={call,result};
  });
  pi.on('tool_call',(event,ctx)=>{
    if(event.parentToolCallId)return;
    if(key(event)===warned) {
      const reason=`Stopped: the model repeated the same ${event.toolName} call ${repeats+2} times with the same result.`;
      ctx.ui.notify(reason,'warning');return {block:true,reason,terminate:true};
    }
    warned=undefined;
    if(repeats<2 || last.call!==key(event))return;
    warned=key(event);
    return {block:true,reason:`Not run: this ${event.toolName} call already returned the same result twice. Use that result or do something else.`};
  });
  pi.registerProvider(provider,{
    baseUrl:'dolly://local',api:'dolly-llama',apiKey:'local',models:piModels(),refreshModels:async()=>piModels(),
    streamSimple:(model,context,options)=>streamSimple({...model,api:'openai-completions'},context,{...options,
      fetch:(_url,request)=>engine.respond(models().find(entry=>entry.id===model.id),model.contextWindow,request)}),
  });

  const overridesPath=`${getAgentDir()}/models.json`;
  const readOverrides=()=>{try{return JSON.parse(readFileSync(overridesPath,'utf8'));}catch{return {};}};
  // The registry rereads the descriptions and models.json; the session takes the changed model.
  async function reload(ctx,id) {
    await ctx.modelRegistry.refresh({providers:[provider],allowNetwork:false});
    const model=ctx.modelRegistry.find(provider,id);
    if(model)await pi.setModel(model);
    return model;
  }
  async function editParameters(ctx,id) {
    for(;;) {
      const model=ctx.modelRegistry.find(provider,id),shipped=piModels().find(entry=>entry.id===id);
      const level=pi.getThinkingLevel();
      const value=(from,name)=>limits.has(name)?from[name]:from.samplingParamsByThinkingLevel?.[level]?.[name]??from.samplingParams?.[name];
      const rows=parameters.map(name=>{
        const now=value(model,name),original=value(shipped,name);
        return `${name} = ${now??"the model file's default"}${now===original?'':` (shipped: ${original??"the model file's default"})`}`;
      });
      const choice=await ctx.ui.select(`Parameters of ${id}${model.reasoning?`, thinking ${level}`:''} · Esc closes`,rows);
      if(!choice)return;
      const name=parameters[rows.indexOf(choice)];
      const text=await ctx.ui.input(`${name} for ${id} (empty restores the shipped value)`,String(value(model,name)??''));
      if(text===undefined)continue;
      const number=Number(text);
      if(text.trim() && !(Number.isFinite(number) && number>=0 && (!limits.has(name) || Number.isInteger(number) && number>=1024))) {
        ctx.ui.notify(`${name} takes a number${limits.has(name)?' of tokens, at least 1024':', zero or more'}; "${text}" is not one`,'error');continue;
      }
      const file=readOverrides();
      const override=((file.providers??={})[provider]??={modelOverrides:{}}).modelOverrides[id]??={};
      const perLevel=!limits.has(name) && shipped.samplingParamsByThinkingLevel?.[level]?.[name]!==undefined;
      const target=limits.has(name)?override:perLevel?((override.samplingParamsByThinkingLevel??={})[level]??={}):(override.samplingParams??={});
      if(text.trim())target[name]=number;else delete target[name];
      writeFileSync(overridesPath,JSON.stringify(file,null,2)+'\n');
      await reload(ctx,id);
    }
  }
  pi.registerCommand('local',{description:'Local models: install, switch, parameters, GPU',handler:async(_args,ctx)=>{
    hint(false);
    const gpu=await checkGpu().catch(error=>({error:error.message}));
    const active=ctx.model?.provider===provider?ctx.model.id:undefined,all=models();
    const rows=all.map(model=>{
      const missing=gpu.error??unmet(model,gpu.shaders);
      if(missing)return `${model.id} · cannot run: ${missing}`;
      const state=model.id===active?'in use':model.installed?'installed':`not installed, ${gigabytes(model.bytes)} to download`;
      return `${model.id} · ${model.gpu[gpu.shaders]} GB GPU memory · ${state}`;
    });
    const edit=active && `Parameters of ${active}…`,unload=engine.process && `Unload ${engine.loaded.split(' ')[0]} and free its GPU memory`;
    const title=gpu.error?`Local models · ${gpu.error}`:`Local models · this GPU adapter runs ${gpu.shaders} shaders`;
    const choice=await ctx.ui.select(title,[...rows,edit,unload].filter(Boolean));
    if(!choice)return;
    if(choice===edit)return editParameters(ctx,active);
    if(choice===unload) {engine.stop();ctx.ui.setStatus('local-model',undefined);return ctx.ui.notify('Local model unloaded','info');}
    const model=all[rows.indexOf(choice)];
    if(gpu.error || unmet(model,gpu.shaders))return ctx.ui.notify(choice,'error');
    if(!model.installed) {
      if(!await ctx.ui.confirm(`Install ${model.name}?`,`amy install ${model.packages.join(' ')} fetches ${gigabytes(model.bytes)} from this site into the session. A session holding it is too large to save.`))return;
      for(const [index,name] of model.packages.entries()) {
        ctx.ui.setStatus('local-model',`Installing ${model.id}: package ${index+1} of ${model.packages.length}, ${gigabytes(model.bytes)} in all…`);
        const result=await pi.exec('amy',['install',name]);
        if(result.code===0)continue;
        ctx.ui.setStatus('local-model',undefined);
        return ctx.ui.notify(`amy install ${name} failed: ${result.stderr.trim().split('\n').pop()}`,'error');
      }
      ctx.ui.setStatus('local-model',undefined);
    }
    engine.stop();
    ctx.ui.notify(await reload(ctx,model.id)?`Using ${model.name}; the first prompt loads it on the GPU`:`${model.id} did not register; see /model`,'info');
  }});
}
