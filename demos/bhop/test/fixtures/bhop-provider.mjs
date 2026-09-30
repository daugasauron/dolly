import assert from 'node:assert/strict';

export const firstAttempt = [{ticks:1,keys:['R']},{ticks:35,keys:['W']},
  {ticks:37,keys:['Space','D'],mouse_dx:123.457,mouse_dy:-22.123},{ticks:15,keys:[]}];
export function bhopProvider() {
  const requests=[],steps=new Map();
  return { requests,
    async handle(request,response,headers) {
      const path=new URL(request.url,'http://fixture').pathname;
      const json=body=>{response.writeHead(200,{...headers,'content-type':'application/json'});response.end(JSON.stringify(body));};
      if(path.endsWith('/models'))return json({data:[{id:'fixture/vision',name:'Bhop vision fixture',
        architecture:{input_modalities:['text','image'],output_modalities:['text']},supported_parameters:['tools','reasoning'],
        context_length:128000,top_provider:{max_completion_tokens:4096},pricing:{prompt:'0.1',completion:'0.2'}}]});
      assert.equal(request.headers.authorization,'Bearer sk-or-v1-bhop-fixture');
      if(path.endsWith('/key'))return json({data:{usage:0}});
      const chunks=[];for await(const chunk of request)chunks.push(chunk);
      const payload=JSON.parse(Buffer.concat(chunks));
      assert.equal(payload.model,'fixture/vision');assert.equal(payload.reasoning?.effort,'low');
      assert.deepEqual(payload.tools.map(t=>t.function.name),['game_input','review_attempt']);
      const images=payload.messages.flatMap(m=>Array.isArray(m.content)?m.content.filter(c=>c.type==='image_url').map(c=>c.image_url.url):[]);
      assert.ok(images.length>0&&images.length<=4);
      for(const url of images){const png=Buffer.from(url.split(',')[1],'base64');assert.equal(png.readUInt32BE(16),960);assert.equal(png.readUInt32BE(20),540);}
      const text=payload.messages.filter(m=>m.role==='user').map(m=>typeof m.content==='string'?m.content:m.content.filter(c=>c.type==='text').map(c=>c.text).join('\n')).join('\n');
      const markers=[...text.matchAll(/BHOP-ATTEMPT|BHOP-CANCEL|Review the snapshots from your last attempt/g)];
      const phase=markers.at(-1)?.[0]||'unknown',step=steps.get(phase)||0;steps.set(phase,step+1);
      requests.push({phase,step,images,messages:payload.messages});
      response.writeHead(200,{...headers,'content-type':'text/event-stream'});response.flushHeaders();
      await new Promise(resolve=>setTimeout(resolve,phase==='BHOP-ATTEMPT'&&step===1?3500:200));
      if(response.destroyed)return;
      const send=(delta,finish_reason=null)=>response.write(`data: ${JSON.stringify({id:`bh-${requests.length}`,object:'chat.completion.chunk',created:0,model:payload.model,
        choices:[{index:0,delta,finish_reason}],...(finish_reason?{usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}:{})})}\n\n`);
      send({role:'assistant',reasoning_content:'BHOP-FIXTURE-THINKING: inspect the framebuffer, try a jump, then review the recorded attempt.\n'});
      let name,args;
      if(phase==='BHOP-ATTEMPT'&&step===0){name='game_input';args={actions:firstAttempt};}
      else if(phase==='BHOP-ATTEMPT'&&step===1){name='review_attempt';args={frames:[0,4,7]};}
      else if(phase==='BHOP-ATTEMPT'&&step===2){name='game_input';args={actions:[{ticks:1,keys:['R']},{ticks:25,keys:['W']},{ticks:50,keys:['D'],mouse_dx:95.003,wheel:1},{ticks:20,keys:[]}]};}
      else if(phase==='BHOP-CANCEL'){name='game_input';args={actions:[{ticks:1,keys:['R']},{ticks:2999,keys:['W'],mouse_dx:-456.789}]};}
      else if(phase.startsWith('Review')&&step===0){name='review_attempt';args={};}
      send({content:name?'I will execute ordinary inputs and compare recorded screenshots.\n':'The attempt review is complete.\n'});
      if(name)send({tool_calls:[{index:0,id:`bh_call_${requests.length}`,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
      send({},name?'tool_calls':'stop');response.end('data: [DONE]\n\n');
    },
    verify() {
      assert.ok(requests.filter(r=>r.phase==='BHOP-ATTEMPT').length>=4);
      assert.ok(requests.some(r=>r.phase.startsWith('Review')),'idle prompts retry the course');
      assert.ok(requests.some(r=>r.images.length===4),'input responses carry a timeline of framebuffers');
      assert.ok(requests.some(r=>r.images.length===3),'review returns the selected archive frames');
      const views=requests.flatMap(r=>r.images);assert.ok(new Set(views).size>=6,'the attempt changes the actual rendered view');
    }
  };
}
