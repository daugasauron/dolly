// Runs in Janis inside Dolly on the events of `pi --mode json -p`: the local
// model used several distinct tools, ran the program and reported its output.
import {readFileSync} from 'node:fs';
const events=readFileSync(process.argv[2],'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));
const text=content=>(content??[]).filter(part=>part.type==='text').map(part=>part.text).join('\n');
const calls=events.filter(event=>event.type==='tool_execution_start').map(event=>JSON.stringify([event.toolName,event.args]));
const results=events.filter(event=>event.type==='tool_execution_end').map(event=>text(event.result?.content));
const answers=events.filter(event=>event.type==='message_end'&&event.message.role==='assistant');
const answer=text(answers.at(-1)?.message.content);
const counted=/1\s+2\s+3\s+4\s+5/;
const failures=[
  new Set(calls).size>=3||`only ${new Set(calls).size} distinct tool calls`,
  results.some(result=>counted.test(result))||'no tool result shows the program printing 1 to 5',
  counted.test(answer)||`the final answer does not report the output: ${answer.slice(0,300)}`,
  !results.some(result=>result.includes('repeated the same'))||'the repeat guard stopped the run',
].filter(check=>check!==true);
console.log(JSON.stringify({calls,answer:answer.slice(0,300)}));
if(failures.length){console.log(`AGENT-PROOF-FAILED: ${failures.join('; ')}`);process.exit(1);}
console.log(`AGENT-PROOF-OK ${calls.length} tool calls`);
