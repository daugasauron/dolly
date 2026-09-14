#!/usr/bin/env node
import {startBrowserServer} from "../test/browser-server.mjs";
const port=Number(process.argv[2]??9093);
if(!Number.isInteger(port)||port<1||port>65535)throw Error("usage: node scripts/serve-gpu-demo.mjs [PORT] [IMAGE]");
const image=process.argv[3]??"gpu-demo";
const site=await startBrowserServer(new URL("..",import.meta.url).pathname,image,port);
console.log(`Dolly GPU experiment: ${site.origin}/${image}/`);
for(const signal of ["SIGINT","SIGTERM"])process.once(signal,async()=>{await site.close();process.exit(0);});
