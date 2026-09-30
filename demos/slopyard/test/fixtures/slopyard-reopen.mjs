import fs from 'node:fs';
const before=JSON.parse(fs.readFileSync('/workspace/slopyard-world.json','utf8'));
Game.call('save');
const after=JSON.parse(fs.readFileSync('/workspace/slopyard-world.json','utf8'));
for(const key of ['creatures','designs','removals','seconds','installed','installedHz','name']){
 if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw Error('Restart changed saved '+key);
}
if(!after.creatures.some(c=>c.magnets.some(m=>m?.attached&&m.load>0)))throw Error('Restart check needs a loaded magnet');
Game.call('exit');
