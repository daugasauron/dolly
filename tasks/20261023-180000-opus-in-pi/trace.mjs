// node trace.mjs SESSIONS.jsonl: where a Pi session's time and calls went, from its session file.
// Model time: an assistant entry's write time minus its request start (message.timestamp).
// Tool time: from the assistant entry to its last tool result. Prints a table of calls,
// failures, and which commands touched packages (amy), libraries and builds.
import {readFileSync} from 'node:fs';
const lines=readFileSync(process.argv[2],'utf8').trim().split('\n').map(line=>JSON.parse(line));
const at=entry=>Date.parse(entry.timestamp);
let model=0,tools=0,cost=0,first=null,last=null,calls=[],pendingCalls=[],lastAssistant=null;
const rows=[];
for(const entry of lines) {
  if(entry.type!=='message')continue;
  const m=entry.message;
  if(m.role==='user'&&first===null)first=at(entry);
  if(m.role==='assistant') {
    const seconds=(at(entry)-m.timestamp)/1000;model+=seconds;cost+=m.usage?.cost?.total??0;last=at(entry);
    const made=m.content.filter(part=>part.type==='toolCall');
    const said=m.content.filter(part=>part.type==='text').map(part=>part.text).join(' ').replace(/\s+/g,' ');
    rows.push({kind:'model',seconds,out:m.usage?.output??0,text:said.slice(0,160),calls:made.length});
    pendingCalls=made.map(call=>({name:call.name,args:call.arguments}));lastAssistant=at(entry);
  }
  if(m.role==='toolResult') {
    const call=pendingCalls.shift()??{name:m.toolName,args:{}};
    const seconds=(at(entry)-lastAssistant)/1000;last=at(entry);
    const text=(Array.isArray(m.content)?m.content.filter(part=>part.type==='text').map(part=>part.text).join(''):String(m.content));
    const status=text.match(/Command exited with code (\d+)/)?.[1]??(m.isError?'error':'0');
    const what=call.name==='bash'?call.args.command:call.name==='write'||call.name==='read'||call.name==='edit'?`${call.args.path??call.args.file_path} ${call.name==='write'?`(${(call.args.content??'').split('\n').length} lines)`:''}`:JSON.stringify(call.args);
    calls.push({name:call.name,status,what,seconds,tail:text.trim().split('\n').filter(Boolean).slice(-2).join(' | ').slice(0,200)});
    rows.push({kind:'tool',seconds});
  }
}
for(const row of rows)if(row.kind==='tool')tools+=row.seconds;
console.log(`wall ${((last-first)/1000).toFixed(0)} s, model ${model.toFixed(0)} s, tool-result wait ${tools.toFixed(0)} s (parallel calls counted per call), cost $${cost.toFixed(3)}, model turns ${rows.filter(r=>r.kind==='model').length}, tool calls ${calls.length}, failed ${calls.filter(c=>c.status!=='0').length}`);
const grep=pattern=>calls.filter(c=>pattern.test(c.what));
console.log('amy:',grep(/\bamy\b/).map(c=>c.what.replace(/\s+/g,' ').slice(0,90)).join(' || ')||'none');
console.log('libraries named:',[...new Set(calls.flatMap(c=>c.what.match(/raylib|SDL2?|sdl2|imgui|box3d|freetype|libpng|openal|dolly\/(display|input|audio|raylib)\.h/g)??[]))].join(', ')||'none');
console.log('\n#  tool   status  s     what');
calls.forEach((c,i)=>console.log(`${String(i+1).padStart(2)} ${c.name.padEnd(8)} ${c.status.padEnd(5)} ${c.seconds.toFixed(1).padStart(6)}  ${c.what.replace(/\s+/g,' ').slice(0,110)}${c.status!=='0'?`\n             -> ${c.tail}`:''}`));
