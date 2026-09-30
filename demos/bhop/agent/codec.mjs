// Private application protocol, not the machine ABI. SPDX-License-Identifier: GPL-2.0-or-later
export const keys = { W:1, A:2, S:4, D:8, Space:16, ArrowLeft:32, ArrowRight:64, R:128 };
const integer = (minimum,maximum) => ({type:'integer',minimum,maximum});
export const parameters = {type:'object',additionalProperties:false,required:['actions'],properties:{
  actions:{type:'array',maxItems:128,items:{type:'object',additionalProperties:false,required:['ticks','keys'],properties:{
    ticks:{...integer(1,3000),description:'Duration in fixed 10 ms physics ticks. Maximum 3000 ticks (30 seconds) for the whole batch.'},
    keys:{type:'array',uniqueItems:true,maxItems:8,items:{type:'string',enum:Object.keys(keys)},description:'Keys held for this segment. Keys stay held across adjacent segments. Use [] to release them. Space jumps only on a new press.'},
    mouse_dx:{type:'number',minimum:-16000,maximum:16000,description:'TOTAL relative horizontal CSS pixels, spread evenly across these ticks; positive turns right. Thousandth-pixel precision.'},
    mouse_dy:{type:'number',minimum:-16000,maximum:16000,description:'TOTAL relative vertical CSS pixels, spread evenly across these ticks; positive looks down.'},
    wheel:{...integer(-1,1),description:'One ordinary scroll event at the start of this segment; either direction queues a jump.'},
  }}}
}};
export function encodeBatch(actions,id,generation) {
  for(const [name,value] of Object.entries({id,generation}))if(!Number.isInteger(value)||value<1||value>0xffffffff)throw Error(`Invalid ${name}`);
  if(!Array.isArray(actions)||actions.length>128)throw Error('At most 128 input segments');
  const bytes=new Uint8Array(24+actions.length*24),view=new DataView(bytes.buffer);
  [0x31504842,1,id,generation,actions.length,0].forEach((v,n)=>view.setUint32(n*4,v,true));
  let total=0;
  actions.forEach((action,n)=>{
    if(!action||typeof action!=='object'||Array.isArray(action)||Object.keys(action).some(key=>!['ticks','keys','mouse_dx','mouse_dy','wheel'].includes(key)))throw Error('Only timed keyboard, relative mouse and wheel inputs are allowed');
    if(!Number.isInteger(action.ticks)||action.ticks<1||action.ticks>3000||(total+=action.ticks)>3000)throw Error('A batch must fit within 3000 ticks (30 seconds)');
    if(!Array.isArray(action.keys)||new Set(action.keys).size!==action.keys.length||action.keys.some(key=>!Object.hasOwn(keys,key)))throw Error('Invalid keyboard input');
    const mouse=['mouse_dx','mouse_dy'].map(key=>{
      const value=action[key]??0;
      if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>16000||Math.abs(value*1000-Math.round(value*1000))>1e-6)throw Error('Mouse deltas use thousandths of a CSS pixel, at most 16000 pixels per segment');
      return Math.round(value*1000);
    });
    const wheel=action.wheel??0;if(!Number.isInteger(wheel)||Math.abs(wheel)>1)throw Error('Wheel must be -1, 0 or 1');
    [action.ticks,action.keys.reduce((mask,key)=>mask|keys[key],0),...mouse,wheel,0].forEach((v,word)=>view.setInt32(24+n*24+word*4,v,true));
  });
  return bytes;
}
