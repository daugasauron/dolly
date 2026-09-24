// Read one presented frame before the compositor can normalize its alpha.
// Firefox's browser screenshot path can hide alpha leaking on the real display.
const configure=GPUCanvasContext.prototype.configure;
const currentTexture=GPUCanvasContext.prototype.getCurrentTexture;
const submit=GPUQueue.prototype.submit;
let device,surface,frames=0;
GPUCanvasContext.prototype.configure=function(options) {
  device=options.device;
  return configure.call(this,options);
};
GPUCanvasContext.prototype.getCurrentTexture=function() {
  surface=currentTexture.call(this);return surface;
};
GPUQueue.prototype.submit=function(commands) {
  const texture=surface;surface=null;
  if(!texture || ++frames!==120)return submit.call(this,commands);
  const {width,height}=texture,stride=Math.ceil(width*4/256)*256;
  const buffer=device.createBuffer({size:stride*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const encoder=device.createCommandEncoder();
  encoder.copyTextureToBuffer({texture},{buffer,bytesPerRow:stride},{width,height});
  submit.call(this,[...commands,encoder.finish()]);
  void buffer.mapAsync(GPUMapMode.READ).then(()=>{
    const pixels=new Uint8Array(buffer.getMappedRange());let nonOpaquePixels=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)
      if(pixels[y*stride+x*4+3]!==255)nonOpaquePixels++;
    postMessage({type:"status",surfaceAlpha:{width,height,nonOpaquePixels}});
    buffer.unmap();
  }).catch(error=>postMessage({type:"status",error:String(error)})).finally(()=>buffer.destroy());
};
