import fs from 'node:fs';
const observations=[],call=Game.call;
Game.call=(op,args)=>{
 const result=call(op,args);
 if(op==='proxy_import_done')observations.push({message:args,enabled:call('enabled'),config:JSON.parse(fs.readFileSync('/workspace/blockwalker-agent/models.json','utf8'))});
 return result;
};
try{await import('/usr/src/dolly/blockwalker/agent.mjs');}
finally{fs.writeFileSync('/workspace/proxy-import-proof.json',JSON.stringify(observations));}
