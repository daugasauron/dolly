DOLLY 3
MODULE gpu-demo

REQUIRES TOOL cc

FILE /usr/include/dolly/gpu-abi.h
    /* Generated from abi/dolly-gpu-0.wat. */
    #pragma once
    #define DOLLY_GPU_VERSION 0u
    #define DOLLY_GPU_PROCESS_OP 128u
    #define DOLLY_GPU_SLOTS 8u
    #define DOLLY_GPU_REPLY_BYTES 65536u
    #define DOLLY_GPU_PACKET_BYTES 1048576u
    #define DOLLY_GPU_HEADER_BYTES 32u
    #define DOLLY_GPU_OPEN 1u
    #define DOLLY_GPU_BATCH 2u
    #define DOLLY_GPU_WAIT 3u
    #define DOLLY_GPU_READ 4u
    #define DOLLY_GPU_CLOSE 5u
    #define DOLLY_GPU_CREATE_BUFFER 1u
    #define DOLLY_GPU_WRITE_BUFFER 2u
    #define DOLLY_GPU_CREATE_SHADER 3u
    #define DOLLY_GPU_RENDER_PIPELINE 4u
    #define DOLLY_GPU_COMPUTE_PIPELINE 5u
    #define DOLLY_GPU_BIND_GROUP 6u
    #define DOLLY_GPU_RENDER 7u
    #define DOLLY_GPU_COMPUTE 8u
    #define DOLLY_GPU_COPY_BUFFER 9u
    #define DOLLY_GPU_MAP_READ 10u
    #define DOLLY_GPU_UNMAP 11u
    #define DOLLY_GPU_RELEASE 12u
    #define DOLLY_GPU_SUBMIT 13u

FILE /usr/include/dolly/gpu.h
    #pragma once
    #include <dolly/gpu-abi.h>
    #include <stddef.h>
    #include <stdint.h>
    
    /* Experimental client of dolly-gpu-0.wat; not the WebGPU C API. */
    typedef struct {
      uint64_t scope;
      uint32_t sequence, count;
      size_t length;
      unsigned char packet[DOLLY_GPU_PACKET_BYTES];
      unsigned char reply[DOLLY_GPU_REPLY_BYTES];
    } dolly_gpu;
    
    int dolly_gpu_open(dolly_gpu *g, uint32_t width, uint32_t height);
    int dolly_gpu_close(dolly_gpu *g);
    int dolly_gpu_wait(dolly_gpu *g);
    int dolly_gpu_read(dolly_gpu *g, uint64_t buffer, uint64_t offset, uint64_t length);
    void dolly_gpu_begin(dolly_gpu *g);
    void *dolly_gpu_record(dolly_gpu *g, uint32_t opcode, size_t bytes);
    int dolly_gpu_batch(dolly_gpu *g);
    void dolly_gpu_buffer(dolly_gpu *g, uint64_t id, uint64_t size, uint32_t usage);
    void dolly_gpu_write(dolly_gpu *g, uint64_t id, const void *data, uint32_t size);
    void dolly_gpu_shader(dolly_gpu *g, uint64_t id, const char *code);
    void dolly_gpu_pipeline(dolly_gpu *g, uint64_t id, uint64_t shader,
                            const char *vertex, const char *fragment, uint32_t blend);
    void dolly_gpu_compute_pipeline(dolly_gpu *g, uint64_t id, uint64_t shader, const char *entry);
    void dolly_gpu_group(dolly_gpu *g, uint64_t id, uint64_t pipeline,
                         unsigned count, const uint64_t *buffers, const uint64_t *sizes);
    void dolly_gpu_draw(dolly_gpu *g, uint64_t pipeline, uint64_t group,
                        unsigned vertices, unsigned instances, unsigned width, unsigned height, int clear);
    void dolly_gpu_dispatch(dolly_gpu *g, uint64_t pipeline, uint64_t group, unsigned x);
    void dolly_gpu_copy(dolly_gpu *g, uint64_t src, uint64_t dst, uint64_t size);
    void dolly_gpu_map(dolly_gpu *g, uint64_t id, uint64_t size);
    void dolly_gpu_submit(dolly_gpu *g);

FILE /usr/src/dolly/gpu/client.c
    #include <dolly/gpu.h>
    #include <dolly/process.h>
    #include <errno.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    
    static void u32(void *p, size_t at, uint32_t n) { memcpy((char *)p+at,&n,4); }
    static void u64(void *p, size_t at, uint64_t n) { memcpy((char *)p+at,&n,8); }
    static int call(dolly_gpu *g, unsigned operation, size_t bytes) {
      u32(g->packet,0,DOLLY_GPU_VERSION);u32(g->packet,4,operation);
      u64(g->packet,8,g->scope);u64(g->packet,16,++g->sequence);
      u32(g->packet,24,bytes-32);u32(g->packet,28,0);
      int64_t result=dolly_process_call(DOLLY_GPU_PROCESS_OP,g->packet,bytes,g->reply,sizeof(g->reply));
      if(result<0) { errno=(int)-result;return -1; }
      return (int)result;
    }
    int dolly_gpu_open(dolly_gpu *g, uint32_t width, uint32_t height) {
      memset(g,0,sizeof(*g));u32(g->packet,32,width);u32(g->packet,36,height);
      int n=call(g,DOLLY_GPU_OPEN,40);
      if(n>=16) memcpy(&g->scope,g->reply,8);
      else if(n>=0) {errno=EPROTO;return -1;}
      return n;
    }
    int dolly_gpu_close(dolly_gpu *g) {return call(g,DOLLY_GPU_CLOSE,32);}
    int dolly_gpu_wait(dolly_gpu *g) {return call(g,DOLLY_GPU_WAIT,32);}
    int dolly_gpu_read(dolly_gpu *g, uint64_t buffer, uint64_t offset, uint64_t length) {
      u64(g->packet,32,buffer);u64(g->packet,40,offset);u64(g->packet,48,length);
      return call(g,DOLLY_GPU_READ,56);
    }
    void dolly_gpu_begin(dolly_gpu *g) { g->length=40;g->count=0;u32(g->packet,36,0); }
    void *dolly_gpu_record(dolly_gpu *g, uint32_t opcode, size_t bytes) {
      bytes=(bytes+7)&~(size_t)7;
      if(bytes<8 || bytes>sizeof(g->packet)-g->length || g->count==256) {
        fputs("GPU client packet capacity exceeded\n",stderr);abort();
      }
      void *p=g->packet+g->length;memset(p,0,bytes);g->length+=bytes;g->count++;
      u32(p,0,opcode);u32(p,4,bytes);return p;
    }
    int dolly_gpu_batch(dolly_gpu *g) {u32(g->packet,32,g->count);return call(g,DOLLY_GPU_BATCH,g->length);}
    void dolly_gpu_buffer(dolly_gpu *g,uint64_t id,uint64_t size,uint32_t usage) {
      void *p=dolly_gpu_record(g,DOLLY_GPU_CREATE_BUFFER,32);u64(p,8,id);u64(p,16,size);u32(p,24,usage);
    }
    void dolly_gpu_write(dolly_gpu *g,uint64_t id,const void *data,uint32_t size) {
      void *p=dolly_gpu_record(g,DOLLY_GPU_WRITE_BUFFER,32+size);u64(p,8,id);u32(p,24,32);u32(p,28,size);memcpy((char *)p+32,data,size);
    }
    void dolly_gpu_shader(dolly_gpu *g,uint64_t id,const char *code) {
      size_t n=strlen(code);void *p=dolly_gpu_record(g,DOLLY_GPU_CREATE_SHADER,24+n);
      u64(p,8,id);u32(p,16,n);memcpy((char *)p+24,code,n);
    }
    void dolly_gpu_pipeline(dolly_gpu *g,uint64_t id,uint64_t shader,const char *vs,const char *fs,uint32_t blend) {
      size_t a=strlen(vs),b=strlen(fs);void *p=dolly_gpu_record(g,DOLLY_GPU_RENDER_PIPELINE,40+a+b);
      u64(p,8,id);u64(p,16,shader);u32(p,28,blend);u32(p,32,a);u32(p,36,b);
      memcpy((char *)p+40,vs,a);memcpy((char *)p+40+a,fs,b);
    }
    void dolly_gpu_compute_pipeline(dolly_gpu *g,uint64_t id,uint64_t shader,const char *entry) {
      size_t n=strlen(entry);void *p=dolly_gpu_record(g,DOLLY_GPU_COMPUTE_PIPELINE,32+n);
      u64(p,8,id);u64(p,16,shader);u32(p,24,n);memcpy((char *)p+32,entry,n);
    }
    void dolly_gpu_group(dolly_gpu *g,uint64_t id,uint64_t pipeline,unsigned count,const uint64_t *buffers,const uint64_t *sizes) {
      void *p=dolly_gpu_record(g,DOLLY_GPU_BIND_GROUP,32+24*count);u64(p,8,id);u64(p,16,pipeline);u32(p,24,count);
      for(unsigned i=0;i<count;i++){u64(p,32+i*24,buffers[i]);u64(p,48+i*24,sizes[i]);}
    }
    void dolly_gpu_draw(dolly_gpu *g,uint64_t pipeline,uint64_t group,unsigned vertices,unsigned instances,unsigned width,unsigned height,int clear) {
      void *p=dolly_gpu_record(g,DOLLY_GPU_RENDER,64);u64(p,8,pipeline);u64(p,16,group);
      u32(p,24,vertices);u32(p,28,instances);u32(p,32,width);u32(p,36,height);u32(p,56,!!clear);
    }
    void dolly_gpu_dispatch(dolly_gpu *g,uint64_t pipeline,uint64_t group,unsigned x) {
      void *p=dolly_gpu_record(g,DOLLY_GPU_COMPUTE,40);u64(p,8,pipeline);u64(p,16,group);u32(p,24,x);u32(p,28,1);u32(p,32,1);
    }
    void dolly_gpu_copy(dolly_gpu *g,uint64_t src,uint64_t dst,uint64_t size) {
      void *p=dolly_gpu_record(g,DOLLY_GPU_COPY_BUFFER,48);u64(p,8,src);u64(p,16,dst);u64(p,40,size);
    }
    void dolly_gpu_map(dolly_gpu *g,uint64_t id,uint64_t size) {
      void *p=dolly_gpu_record(g,DOLLY_GPU_MAP_READ,32);u64(p,8,id);u64(p,24,size);
    }
    void dolly_gpu_submit(dolly_gpu *g) {dolly_gpu_record(g,DOLLY_GPU_SUBMIT,8);}

FILE /usr/src/dolly/gpu/common.wgsl
    struct Uniforms { screen: vec4f, state: vec4f }
    @group(0) @binding(0) var<uniform> u: Uniforms;
    fn hash(p: vec2f) -> f32 { return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
    fn noise(p: vec2f) -> f32 {
      let i=floor(p);let f=fract(p);let v=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2f(1,0)),v.x),mix(hash(i+vec2f(0,1)),hash(i+1.),v.x),v.y);
    }
    fn stars(uv: vec2f) -> vec3f {
      let p=uv*200.;let h=hash(floor(p));
      return vec3f(pow(max(0.,1.-length(fract(p)-.5)*2.),12.)*step(.974,h)*(0.7+0.3*sin(u.screen.z+h*90.)));
    }

FILE /usr/src/dolly/gpu/compute.wgsl
    @group(0) @binding(1) var<storage,read_write> particles:array<vec4f>;
    @compute @workgroup_size(64) fn update(@builtin(global_invocation_id) id:vec3u) {
      let i=id.x;if(i>=arrayLength(&particles)){return;}
      let f=f32(i);let t=u.screen.z*.23;let seed=f/8192.;
      let a=seed*6.2831853*13.+t*(.3+fract(seed*17.));
      let r=.08+.65*sqrt(fract(seed*17.))+ .06*sin(a*3.+t);
      let tilt=sin(t*.3)*.35;
      let x=cos(a)*r;let y=sin(a)*r*.60;
      let destination=vec2f(x*cos(tilt)-y*sin(tilt),x*sin(tilt)+y*cos(tilt));
      let old=particles[i];let position=mix(old.xy,destination,select(.12,1.,u.state.y<1.));
      particles[i]=vec4f(position,seed, .45+.55*pow(sin(a*.5+t)*.5+.5,2.));
    }

FILE /usr/src/dolly/gpu/hud.wgsl
    fn glyph(c:u32,p:vec2u)->f32 {
      var lo=0u;var hi=0u;
      switch(c) {
        case 65u: {lo=1033774u;hi=17969u;}
        case 66u: {lo=509487u;hi=15921u;}
        case 67u: {lo=33854u;hi=30753u;}
        case 68u: {lo=575023u;hi=15921u;}
        case 69u: {lo=492607u;hi=31777u;}
        case 70u: {lo=492607u;hi=1057u;}
        case 71u: {lo=951358u;hi=31281u;}
        case 72u: {lo=1033777u;hi=17969u;}
        case 73u: {lo=135327u;hi=31876u;}
        case 74u: {lo=270620u;hi=6441u;}
        case 75u: {lo=103729u;hi=17701u;}
        case 76u: {lo=33825u;hi=31777u;}
        case 77u: {lo=710513u;hi=17969u;}
        case 78u: {lo=841329u;hi=17969u;}
        case 79u: {lo=575022u;hi=14897u;}
        case 80u: {lo=509487u;hi=1057u;}
        case 81u: {lo=575022u;hi=22837u;}
        case 82u: {lo=509487u;hi=17701u;}
        case 83u: {lo=459838u;hi=15888u;}
        case 84u: {lo=135327u;hi=4228u;}
        case 85u: {lo=575025u;hi=14897u;}
        case 86u: {lo=575025u;hi=4433u;}
        case 87u: {lo=706097u;hi=18293u;}
        case 88u: {lo=141873u;hi=17962u;}
        case 89u: {lo=141873u;hi=4228u;}
        case 90u: {lo=139807u;hi=31778u;}
        case 49u: {lo=135364u;hi=14468u;}
        case 50u: {lo=410158u;hi=31778u;}
        case 51u: {lo=475663u;hi=15888u;}
        default: {}
      }
      let i=p.y*5u+p.x;return f32(select((lo>>(i%20u))&1u,(hi>>((i-20u)%20u))&1u,i>=20u));
    }
    fn label0(p:vec2f)->f32 {
      let chars=array<u32,13>(68u,79u,76u,76u,89u,32u,71u,80u,85u,32u,76u,65u,66u);
      if(any(p<vec2f(0)) || p.y>=7. || p.x>=78.){return 0.;}
      let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
    }
    fn label1(p:vec2f)->f32 {
      let chars=array<u32,6>(65u,85u,82u,79u,82u,65u);
      if(any(p<vec2f(0)) || p.y>=7. || p.x>=36.){return 0.;}
      let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
    }
    fn label2(p:vec2f)->f32 {
      let chars=array<u32,5>(80u,82u,73u,83u,77u);
      if(any(p<vec2f(0)) || p.y>=7. || p.x>=30.){return 0.;}
      let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
    }
    fn label3(p:vec2f)->f32 {
      let chars=array<u32,15>(77u,65u,71u,78u,69u,84u,73u,67u,32u,71u,65u,82u,68u,69u,78u);
      if(any(p<vec2f(0)) || p.y>=7. || p.x>=90.){return 0.;}
      let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
    }
    fn label4(p:vec2f)->f32 {
      let chars=array<u32,29>(49u,32u,65u,85u,82u,79u,82u,65u,32u,32u,32u,50u,32u,80u,82u,73u,83u,77u,32u,32u,32u,51u,32u,71u,65u,82u,68u,69u,78u);
      if(any(p<vec2f(0)) || p.y>=7. || p.x>=174.){return 0.;}
      let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
    }
    fn label5(p:vec2f)->f32 {
      let chars=array<u32,21>(83u,80u,65u,67u,69u,32u,80u,65u,85u,83u,69u,32u,32u,32u,81u,32u,83u,72u,69u,76u,76u);
      if(any(p<vec2f(0)) || p.y>=7. || p.x>=126.){return 0.;}
      let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
    }
    fn hud(p:vec2f,col:vec3f)->vec3f {
      let scale=max(1.,floor(u.screen.y/360.));let q=p/scale;let h=u.screen.y/scale;
      var mask=label0(q-vec2f(20,18))*.65;
      if(u.state.x<.5){mask+=label1((q-vec2f(20,36))/2.);}else if(u.state.x<1.5){mask+=label2((q-vec2f(20,36))/2.);}else{mask+=label3((q-vec2f(20,36))/2.);}
      mask+=label4(q-vec2f(20,h-38))*.65+label5(q-vec2f(20,h-23))*.45;
      return mix(col,vec3f(.82,.94,1.),clamp(mask,0.,1.));
    }

FILE /usr/src/dolly/gpu/main.c
    #define _POSIX_C_SOURCE 200809L
    #include <dolly/gpu.h>
    #include <dolly/display.h>
    #include <errno.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <time.h>
    
    static dolly_gpu gpu;
    static double now(void) {struct timespec ts;clock_gettime(CLOCK_MONOTONIC,&ts);return ts.tv_sec+ts.tv_nsec*1e-9;}
    static void check(int n) {if(n<0){perror("GPU demo");exit(1);}}
    static char *shader(const char *file,int hud) {
      const char *parts[]={"common.wgsl",hud?"hud.wgsl":NULL,file};
      char *code=calloc(1,65536);size_t used=0;
      for(unsigned i=0;i<3;i++) {
        if(!parts[i])continue;char path[256];snprintf(path,sizeof(path),"/usr/src/dolly/gpu/%s",parts[i]);
        FILE *f=fopen(path,"rb");if(!f){perror(path);exit(1);}
        used+=fread(code+used,1,65535-used,f);fclose(f);
      }
      return code;
    }
    static void compute_check(void) {
      int n=dolly_gpu_open(&gpu,0,0);check(n);
      printf("GPU adapter: %.*s\n",n-16,gpu.reply+16);
      const char *source="@group(0) @binding(0) var<storage,read_write> a:array<u32>; @compute @workgroup_size(4) fn test(@builtin(global_invocation_id) i:vec3u){if(i.x<4u){a[i.x]=a[i.x]*2u+1u;}}";
      uint32_t input[]={1,2,3,4};uint64_t buffers[]={1},sizes[]={16};
      dolly_gpu_begin(&gpu);dolly_gpu_buffer(&gpu,1,16,128|8|4);dolly_gpu_buffer(&gpu,2,16,1|8);
      dolly_gpu_write(&gpu,1,input,sizeof(input));dolly_gpu_shader(&gpu,3,source);
      dolly_gpu_compute_pipeline(&gpu,4,3,"test");dolly_gpu_group(&gpu,5,4,1,buffers,sizes);
      dolly_gpu_dispatch(&gpu,4,5,1);dolly_gpu_copy(&gpu,1,2,16);dolly_gpu_submit(&gpu);dolly_gpu_map(&gpu,2,16);check(dolly_gpu_batch(&gpu));
      check(dolly_gpu_read(&gpu,2,0,16));uint32_t output[4];memcpy(output,gpu.reply,16);
      for(unsigned i=0;i<4;i++)if(output[i]!=input[i]*2+1){fputs("GPU compute mismatch\n",stderr);exit(1);}
      FILE *proof=fopen("/workspace/gpu-proof.txt","w");if(!proof){perror("gpu-proof.txt");exit(1);}
      fprintf(proof,"GPU compute: %u %u %u %u\n",output[0],output[1],output[2],output[3]);fclose(proof);
      double start=now();for(unsigned i=0;i<200;i++){dolly_gpu_begin(&gpu);check(dolly_gpu_batch(&gpu));}
      printf("GPU empty batch round trip: %.3f us (200 calls)\n",(now()-start)*1e6/200.);
      check(dolly_gpu_close(&gpu));puts("GPU compute PASS: 3 5 7 9; /workspace/gpu-proof.txt");
    }
    static void benchmark(void) {
      check(dolly_gpu_open(&gpu,64,64));
      const char *code="@group(0) @binding(0) var<uniform> color:vec4f; @vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{return vec4f(f32((i<<1u)&2u)*2.-1.,f32(i&2u)*2.-1.,0,1);} @fragment fn fs()->@location(0) vec4f{return color;}";
      uint64_t buffers[]={1},sizes[]={16};float color[]={.2,.4,.6,1};
      dolly_gpu_begin(&gpu);dolly_gpu_buffer(&gpu,1,16,64|8);dolly_gpu_shader(&gpu,2,code);
      dolly_gpu_pipeline(&gpu,3,2,"vs","fs",0);dolly_gpu_group(&gpu,4,3,1,buffers,sizes);check(dolly_gpu_batch(&gpu));
      for(unsigned sample=0;sample<4;sample++) {
        double start=now();
        for(unsigned i=0;i<200;i++) {
          dolly_gpu_begin(&gpu);dolly_gpu_write(&gpu,1,color,sizeof(color));
          dolly_gpu_draw(&gpu,3,4,3,1,64,64,1);dolly_gpu_submit(&gpu);check(dolly_gpu_batch(&gpu));
        }
        check(dolly_gpu_wait(&gpu));
        if(sample)printf("GPU render benchmark: %.3f us\n",(now()-start)*1e6/200.);
      }
      check(dolly_gpu_close(&gpu));
    }
    int main(int argc,char **argv) {
      if(argc>1 && !strcmp(argv[1],"--bench")){benchmark();return 0;}
      if(argc>1 && !strcmp(argv[1],"--check")){compute_check();return 0;}
      dolly_display_surface surface;check(dolly_display_acquire(&surface));
      unsigned width=1280,height=720;
      check(dolly_display_set_size(surface.generation,width,height,&surface));
      int n=dolly_gpu_open(&gpu,width,height);
      if(n<0) {
        dolly_display_release(surface.generation);perror("WebGPU unavailable");
        puts("The browser must expose a WebGPU adapter. No software renderer is substituted.");return 1;
      }
      printf("GPU adapter: %.*s\n",n-16,gpu.reply+16);
      dolly_gpu_begin(&gpu);dolly_gpu_buffer(&gpu,1,32,64|8);dolly_gpu_buffer(&gpu,2,8192*16,128|8);
      char *code=shader("scenes.wgsl",1);dolly_gpu_shader(&gpu,3,code);free(code);
      code=shader("compute.wgsl",0);dolly_gpu_shader(&gpu,4,code);free(code);
      code=shader("particles.wgsl",0);dolly_gpu_shader(&gpu,5,code);free(code);
      dolly_gpu_pipeline(&gpu,6,3,"fullscreen","scene",0);
      dolly_gpu_compute_pipeline(&gpu,7,4,"update");dolly_gpu_pipeline(&gpu,8,5,"particle","glow",2);
      uint64_t buffers[]={1,2},sizes[]={32,8192*16};
      dolly_gpu_group(&gpu,9,6,1,buffers,sizes);dolly_gpu_group(&gpu,10,7,2,buffers,sizes);dolly_gpu_group(&gpu,11,8,2,buffers,sizes);
      check(dolly_gpu_batch(&gpu));
      int running=1,paused=0,mode=0;unsigned frame=0,frame_sequence=0;double previous=now(),time=0,submit_seconds=0;
      while(running) {
        dolly_input_event e;
        while(dolly_display_next_event(surface.generation,&e,0)>0) {
          if(e.type!=DOLLY_INPUT_EVENT_KEY || e.action!=DOLLY_KEY_ACTION_PRESS)continue;
          if(e.key_length==1){char c=e.data[0];if(c>='1'&&c<='3')mode=c-'1';else if(c==' ')paused=!paused;else if(c=='q'||c=='Q')running=0;}
          if(e.key_length==6&&!memcmp(e.data,"Escape",6))running=0;
        }
        if(!running)break;
        double current=now(),dt=current-previous;previous=current;if(dt>.05)dt=.05;if(!paused)time+=dt;
        float uniform[]={(float)width,(float)height,(float)time,paused?0:(float)dt,(float)mode,(float)frame,0,0};
        dolly_gpu_begin(&gpu);dolly_gpu_write(&gpu,1,uniform,sizeof(uniform));
        if(mode==2&&!paused)dolly_gpu_dispatch(&gpu,7,10,128);
        dolly_gpu_draw(&gpu,6,9,3,1,width,height,1);
        if(mode==2)dolly_gpu_draw(&gpu,8,11,6,8192,width,height,0);
        dolly_gpu_submit(&gpu);double start=now();check(dolly_gpu_batch(&gpu));submit_seconds+=now()-start;frame++;
        check(dolly_display_wait_frame(surface.generation,&frame_sequence,-1));
      }
      check(dolly_gpu_wait(&gpu));check(dolly_gpu_close(&gpu));check(dolly_display_release(surface.generation));
      printf("GPU: %u frames; mean command round trip %.3f ms.\n",frame,frame?submit_seconds*1000/frame:0);
      return 0;
    }

FILE /usr/src/dolly/gpu/particles.wgsl
    @group(0) @binding(1) var<storage,read> particles:array<vec4f>;
    struct Vertex { @builtin(position) position:vec4f, @location(0) uv:vec2f, @location(1) color:vec3f }
    @vertex fn particle(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Vertex {
      let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
      let p=particles[i];let corner=corners[vi];var v:Vertex;
      let aspect=u.screen.y/u.screen.x;let size=.0045+.004*p.w;
      v.position=vec4f((p.xy+corner*size)*vec2f(aspect,1.)*1.7,0,1);v.uv=corner;
      v.color=(.5+.5*cos(vec3f(0,2,4)+p.z*18.+u.screen.z*.12))*(.20+.35*p.w);
      return v;
    }
    @fragment fn glow(v:Vertex)->@location(0) vec4f {
      let intensity=pow(max(0.,1.-dot(v.uv,v.uv)),2.);return vec4f(v.color*intensity,0);
    }

FILE /usr/src/dolly/gpu/scenes.wgsl
    @vertex fn fullscreen(@builtin(vertex_index) i:u32) -> @builtin(position) vec4f {
      let x=f32((i<<1u)&2u);let y=f32(i&2u);return vec4f(x*2.-1.,y*2.-1.,0,1);
    }
    fn aurora(uv:vec2f) -> vec3f {
      let t=u.screen.z*.14;var col=mix(vec3f(.006,.012,.035),vec3f(.015,.055,.11),uv.y)+stars(uv);
      let ridge=.83+.025*sin(uv.x*12.)+.015*sin(uv.x*37.);
      for(var i=0;i<8;i++) {
        let k=f32(i);let x=uv.x*3.+k*.13;
        let wave=.30+.085*sin(x*2.+t+k*.2)+.11*sin(x*.7-t*1.2)+.05*noise(vec2f(x*4.,t));
        let y=uv.y-wave;let curtain=exp(-abs(y)*9.)*smoothstep(-.08,.03,y);
        let threads=pow(noise(vec2f(x*36.+t,k*.1+t*.3)),2.);
        let hue=mix(vec3f(.03,.8,.43),vec3f(.38,.11,.8),smoothstep(0.,.32,y));
        col+=hue*curtain*(.10+threads*.4)*.33;
      }
      col*=1.-smoothstep(ridge-.006,ridge+.002,uv.y)*.91;
      return col;
    }
    fn rotate(p:vec2f,a:f32)->vec2f {let c=cos(a);let s=sin(a);return vec2f(c*p.x-s*p.y,s*p.x+c*p.y);}
    fn shape(q:vec3f)->f32 {
      var p=q;let xz=rotate(p.xz,u.screen.z*.21);p=vec3f(xz.x,p.y,xz.y);let xy=rotate(p.xy,.6+u.screen.z*.14);p=vec3f(xy,p.z);
      let ring=length(vec2f(length(p.xy)-1.04,p.z))-.27;
      let facets=max(max(abs(p.x),abs(p.y)),abs(p.z))-.85;
      return mix(ring,facets,.25+.20*sin(u.screen.z*.25));
    }
    fn prism(uv:vec2f)->vec3f {
      let p=(uv-.5)*vec2f(u.screen.x/u.screen.y,1.);let ro=vec3f(0,0,4.3);let rd=normalize(vec3f(p*2.7,-3.));
      var travel=0.;var glow=0.;var d=0.;var hit=false;
      for(var i=0;i<72;i++) {
        d=shape(ro+rd*travel);glow+=.007/(.04+abs(d));
        if(d<.0015){hit=true;break;}travel+=d*.78;if(travel>8.){break;}
      }
      var col=vec3f(.005,.009,.022)+stars(uv)*.4;
      if(hit) {
        let p3=ro+rd*travel;let e=vec2f(.002,0);
        let n=normalize(vec3f(shape(p3+e.xyy)-shape(p3-e.xyy),shape(p3+e.yxy)-shape(p3-e.yxy),shape(p3+e.yyx)-shape(p3-e.yyx)));
        let fres=pow(1.-max(0.,dot(n,-rd)),2.);
        let hue=.5+.5*cos(vec3f(0,2,4)+dot(n,vec3f(3,2,1))*2.+u.screen.z*.22);
        let light=max(.05,dot(n,normalize(vec3f(-1,2,3))));
        col=hue*(.17+light*.6)+vec3f(.3,.7,1.)*fres*.8;
        col+=pow(max(0.,dot(reflect(rd,n),normalize(vec3f(-1,2,3)))),48.)*1.8;
      }
      return col+vec3f(.025,.015,.055)*glow;
    }
    @fragment fn scene(@builtin(position) p:vec4f)->@location(0) vec4f {
      let uv=p.xy/u.screen.xy;var col=vec3f(.006,.009,.025)+stars(uv)*.6;
      if(u.state.x<.5){col=aurora(uv);}else if(u.state.x<1.5){col=prism(uv);}
      col*=.65+.35*pow(max(0.,16.*uv.x*uv.y*(1.-uv.x)*(1.-uv.y)),.25);
      col=pow(max(col,vec3f(0)),vec3f(.85));
      return vec4f(hud(p.xy,col),1);
    }

