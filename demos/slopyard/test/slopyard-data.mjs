import {readFile} from 'node:fs/promises';

// Read the data-only Lua tables exported by the game; never evaluate Lua code.
export function parseLua(source){
 let p=0;
 const space=()=>{for(;;){const m=/^(?:\s+|--[^\n]*(?:\n|$))/.exec(source.slice(p));if(!m)break;p+=m[0].length;}},take=s=>{space();if(source.startsWith(s,p)){p+=s.length;return true;}return false;},need=s=>{if(!take(s))throw Error('Expected '+s+' at '+p);};
 function value(){
  space();const rest=source.slice(p),long=/^\[(=*)\[/.exec(rest);
  if(long){p+=long[0].length;if(source[p]==='\n')p++;const end=source.indexOf(']'+long[1]+']',p);if(end<0)throw Error('Unclosed Lua string');const text=source.slice(p,end);p=end+long[1].length+2;return text;}
  if(source[p]==='"'||source[p]==="'"){
   const quote=source[p++];let out='';while(p<source.length&&source[p]!==quote){let c=source[p++];if(c==='\\'){
    const digits=/^\d{1,3}/.exec(source.slice(p));if(digits){out+=String.fromCharCode(Number(digits[0]));p+=digits[0].length;continue;}
    c=source[p++];out+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v',a:'\x07'})[c]??c;
   }else out+=c;}if(source[p++]!==quote)throw Error('Unclosed Lua string');return out;
  }
  const array=take('array');if(array||take('{')){
   if(array)need('{');const fields=new Map();let index=1,sequence=array;
   while(!take('}')){
    space();const key=/^([A-Za-z_]\w*)\s*=/.exec(source.slice(p));let k;
    if(source[p]==='['&&!/^\[=*\[/.test(source.slice(p))){p++;k=value();need(']');need('=');}
    else if(key){k=key[1];p+=key[0].length;}else{k=index++;sequence=true;}
    fields.set(k,value());if(take('}'))break;if(!take(',')&&!take(';'))throw Error('Expected table separator at '+p);
   }
   if(fields.size&&[...fields.keys()].every(k=>Number.isInteger(k)&&k>0))sequence=true;
   if(sequence){const out=[];for(const[k,v]of fields)out[k-1]=v;return out;}
   return Object.fromEntries(fields);
  }
  if(take('(')){const a=value();need('/');const b=value();need(')');return a/b;}
  for(const [name,v]of [['true',true],['false',false],['nil',null]])if(take(name))return v;
  const number=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);if(number){p+=number[0].length;return Number(number[0]);}
  throw Error('Unsupported Lua data at '+p);
 }
 need('return');const out=value();space();if(p!==source.length)throw Error('Trailing Lua code');return out;
}
export function writeLua(value){
 const literal=v=>v===null||v===undefined?'nil':typeof v==='string'?JSON.stringify(v):typeof v==='boolean'?String(v):typeof v==='number'?(Number.isFinite(v)?String(v):Number.isNaN(v)?'(0/0)':v>0?'(1/0)':'(-1/0)'):Array.isArray(v)?'array{'+Array.from(v,literal).join(',')+'}':'{'+Object.entries(v).map(([k,x])=>'['+literal(k)+']='+literal(x)).join(',')+'}';
 return 'return '+literal(value)+'\n';
}
export async function readLua(path){return parseLua(await readFile(path,'utf8'));}
export async function readCatalog(){const data=await readLua(new URL('../src/designs.lua',import.meta.url));return Promise.all(data.designs.map(async d=>({...d,source:await readFile(new URL('../src/'+d.program,import.meta.url),'utf8')})));}
export async function compileCommand(){return (await readFile(new URL('../slopyard.dm',import.meta.url),'utf8')).split('\n').find(s=>s.startsWith('SLOP cc ')).slice(5);}
