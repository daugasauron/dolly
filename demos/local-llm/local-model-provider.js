import {createAssistantMessageEventStream,getCurrentSystemPrompt,getCurrentTools} from '@earendil-works/pi-ai';
import {LocalLlama} from '/usr/lib/dolly-llm/client.mjs';
import {models} from '/usr/lib/dolly-llm/model.mjs';
import {qwenPrompt,qwenToolCalls} from '/usr/lib/dolly-llm/qwen.mjs';
import {minicpmPrompt,minicpmToolCalls} from '/usr/lib/dolly-llm/minicpm.mjs';

// Each model family's chat template, tool-call parser and the text that opens a call.
const formats={
  'qwen3.5':{prompt:qwenPrompt,toolCalls:qwenToolCalls,toolStart:'<tool_call>'},
  'minicpm5':{prompt:minicpmPrompt,toolCalls:minicpmToolCalls,toolStart:'<function name='},
};

function conversation(context) {
  const messages=[],systemPrompt=getCurrentSystemPrompt(context.messages);
  if(systemPrompt)messages.push({role:'system',content:systemPrompt});
  for(const message of context.messages) {
    if(message.role==='system')continue;
    const text=typeof message.content==='string'?message.content:message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');
    if(message.role==='toolResult')messages.push({role:'tool',content:text,tool_call_id:message.toolCallId});
    else {
      const tools=Array.isArray(message.content)?message.content.filter(c=>c.type==='toolCall'):[];
      messages.push({role:message.role,content:text,...(tools.length?{tool_calls:tools.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:JSON.stringify(c.arguments)}}))}:{})});
    }
  }
  return messages;
}
export default function(pi) {
  let ui;
  const engine=new LocalLlama(text=>ui?.setStatus('local-model',text));
  pi.on('session_start',(_event,ctx)=>{ui=ctx.ui;});
  pi.on('session_shutdown',()=>engine.stop());
  pi.registerCommand('local-unload',{description:'Release the local model and its GPU memory',handler:async(_args,ctx)=>{engine.stop();ctx.ui.setStatus('local-model',undefined);ctx.ui.notify('Local model unloaded','info');}});
  pi.registerProvider('webgpu',{
    baseUrl:'dolly://local',api:'dolly-llama',apiKey:'local',
    models:models.map(model=>({id:model.id,name:`${model.name} · GPU inside Dolly, ${model.gpu} GB`,reasoning:false,input:['text'],
      cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:model.context,maxTokens:2048})),
    streamSimple(model,context,options={}) {
      const stream=createAssistantMessageEventStream();
      const output={role:'assistant',content:[],api:model.api,provider:model.provider,model:model.id,timestamp:Date.now(),
        stopReason:'pending',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
      void (async()=>{
        try {
          const tools=getCurrentTools(context.messages).map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}}));
          const format=formats[models.find(entry=>entry.id===model.id).format];
          const prompt=format.prompt(conversation(context),tools);
          stream.push({type:'start',partial:output});
          output.content.push({type:'text',text:''});stream.push({type:'text_start',contentIndex:0,partial:output});
          const decoder=new TextDecoder();let result,text='',shown=0;
          for await(const event of engine.generate(model.id,{prompt,max_tokens:options.maxTokens??2048,temperature:options.temperature??0.2,top_p:0.9},options.signal)) {
            if(event.token) {
              text+=decoder.decode(new Uint8Array(event.token),{stream:true});
              // Hold tag prefixes until a complete tool envelope can be validated.
              const at=text.indexOf(format.toolStart);const safe=at<0?Math.max(shown,text.length-format.toolStart.length):at;
              if(safe>shown) {const delta=text.slice(shown,safe);shown=safe;output.content[0].text+=delta;stream.push({type:'text_delta',contentIndex:0,delta,partial:output});}
            }
            if(event.done)result=event;
          }
          if(!result)throw Error('Local model stream ended without completion');
          text+=decoder.decode();const at=text.indexOf(format.toolStart);
          if(at>=0) {
            if(result.reason!=='stop')throw Error('Model stopped before finishing its tool call');
            const calls=format.toolCalls(text.slice(at),tools);
            output.content[0].text=text.slice(0,at).trimEnd();
            stream.push({type:'text_end',contentIndex:0,content:output.content[0].text,partial:output});
            for(const call of calls) {
              const index=output.content.length;
              const toolCall={type:'toolCall',id:call.id,name:call.function.name,arguments:JSON.parse(call.function.arguments)};
              output.content.push(toolCall);stream.push({type:'toolcall_start',contentIndex:index,partial:output});stream.push({type:'toolcall_end',contentIndex:index,toolCall,partial:output});
            }
            output.stopReason='toolUse';
          } else {
            const delta=text.slice(shown);output.content[0].text+=delta;
            if(delta)stream.push({type:'text_delta',contentIndex:0,delta,partial:output});
            stream.push({type:'text_end',contentIndex:0,content:output.content[0].text,partial:output});output.stopReason=result.reason==='length'?'length':'stop';
          }
          // The engine reuses the previous request's matching prefix.
          output.usage.input=result.input_tokens-result.cached_tokens;output.usage.cacheRead=result.cached_tokens;
          output.usage.output=result.output_tokens;output.usage.totalTokens=result.input_tokens+result.output_tokens;
          ui?.setStatus('local-model',`${model.id} · ${result.tokens_per_second.toFixed(1)} tokens/s · GPU`);
          stream.push({type:'done',reason:output.stopReason,message:output});stream.end();
        } catch(error) {
          output.stopReason=options.signal?.aborted?'aborted':'error';output.errorMessage=String(error.message??error);
          ui?.setStatus('local-model',undefined);stream.push({type:'error',reason:output.stopReason,error:output});stream.end();
        }
      })();
      return stream;
    },
  });
}
