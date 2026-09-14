DOLLY 3
MODULE gpu-fluid

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
    #define DOLLY_GPU_INFO 6u
    #define DOLLY_GPU_MAX_BINDINGS 16u
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
    #define DOLLY_GPU_VERTEX_PIPELINE 14u
    #define DOLLY_GPU_RENDER_VERTEX 15u

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
    int dolly_gpu_info(dolly_gpu *g);
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

FILE /usr/src/dolly/fluid/client.c
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
    int dolly_gpu_info(dolly_gpu *g) {return call(g,DOLLY_GPU_INFO,32);}
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

FILE /usr/src/dolly/fluid/app.c
    #include "platform.h"
    #define main fluid_upstream_main
    #include "fluid_simulation.c"
    #undef main
    
    static wgpu_context_t context;
    static dolly_display_surface surface;
    static bool show_panel=true,paused=false,automatic=true,rebuild=false,stopping=false,benchmark_mode=false;
    static unsigned selected_height=720,selected_grid=256,overlay_count;
    static const char *benchmark_style="ink";
    static double fps,gpu_ms=-1,last_mouse=-10;
    static uint64_t overlay_buffer,overlay_uniform,overlay_pipeline,overlay_group;
    static struct {float rect[4];uint32_t character,color,a,b;} overlay[512];
    static const uint32_t text_color=0xffe4e7e4,muted=0xffa6afa7,accent=0xff8cddac;
    static void add_item(float x,float y,float w,float h,unsigned c,uint32_t color) {
      if(overlay_count==ARRAY_SIZE(overlay))return;
      unsigned i=overlay_count++;overlay[i].rect[0]=x;overlay[i].rect[1]=y;overlay[i].rect[2]=w;overlay[i].rect[3]=h;overlay[i].character=c;overlay[i].color=color;
    }
    static void label(float x,float y,const char *s,uint32_t color) {for(;*s;s++,x+=12)if(*s!=' ')add_item(x,y,10,14,(unsigned char)*s,color);}
    static void button(int x,int y,int w,const char *s,bool active) {add_item(x,y,w,28,0,active?0xff415b40:0xff282c28);label(x+8,y+7,s,active?accent:text_color);}
    void fluid_draw_overlay(void) {
      if(benchmark_mode)return;
      overlay_count=0;
      if(show_panel) {
        add_item(12,12,404,258,0,0xec111611);
        label(28,28,"FLUID LAB",accent);button(286,20,114,"H HIDE",false);
        char text[80];if(gpu_ms>=0)snprintf(text,sizeof(text),"GPU %.2F MS   %.0F FPS",gpu_ms,fps);else snprintf(text,sizeof(text),"GPU N/A   %.0F FPS",fps);
        label(28,58,text,muted);
        label(28,94,"IMAGE",muted);button(138,86,102,"720P",selected_height==720);button(250,86,102,"1080P",selected_height==1080);
        label(28,130,"GRID",muted);button(138,122,76,"128",selected_grid==128);button(226,122,76,"256",selected_grid==256);button(314,122,76,"512",selected_grid==512);
        label(28,166,"PRESSURE",muted);button(150,158,36,"-",false);snprintf(text,sizeof(text),"%d",settings.pressure_iterations);label(202,166,text,text_color);button(250,158,36,"+",false);
        button(28,194,76,"INK",settings.render_mode==0);button(114,194,100,"SMOKE",settings.render_mode==2&&!settings.enable_shadows);button(224,194,112,"SHADED",settings.render_mode==2&&settings.enable_shadows);
        button(28,230,100,paused?"RESUME":"PAUSE",paused);button(138,230,88,"RESET",false);button(236,230,164,automatic?"AUTO ON":"AUTO OFF",automatic);
      } else {add_item(12,12,176,30,0,0xb8111611);label(24,20,"H CONTROLS",muted);}
      dolly_gpu_write(&fluid_gpu,overlay_buffer,overlay,overlay_count*sizeof(overlay[0]));
      dolly_gpu_draw(&fluid_gpu,overlay_pipeline,overlay_group,6,overlay_count,context.width,context.height,0);
    }
    static void overlay_init(void) {
      char *source=malloc(16384);FILE*f=fopen("/usr/src/dolly/fluid/overlay.wgsl","r");if(!f){perror("overlay");exit(1);}size_t n=fread(source,1,16383,f);source[n]=0;fclose(f);
      overlay_buffer=gpu_id();overlay_uniform=gpu_id();uint64_t shader=gpu_id();overlay_pipeline=gpu_id();overlay_group=gpu_id();
      dolly_gpu_buffer(&fluid_gpu,overlay_buffer,sizeof(overlay),128|8);dolly_gpu_buffer(&fluid_gpu,overlay_uniform,16,64|8);
      float screen[]={context.width,context.height,0,0};dolly_gpu_write(&fluid_gpu,overlay_uniform,screen,sizeof(screen));dolly_gpu_shader(&fluid_gpu,shader,source);free(source);
      dolly_gpu_pipeline(&fluid_gpu,overlay_pipeline,shader,"ui_vertex","ui_fragment",1);
      uint64_t buffers[]={overlay_buffer,overlay_uniform},sizes[]={sizeof(overlay),16};dolly_gpu_group(&fluid_gpu,overlay_group,overlay_pipeline,2,buffers,sizes);gpu_flush();
    }
    static void initialize(void) {
      context.width=selected_height*16/9;context.height=selected_height;context.render_format=WGPUTextureFormat_BGRA8Unorm;
      gpu_check(dolly_display_set_size(surface.generation,context.width,context.height,&surface));
      int n=dolly_gpu_open(&fluid_gpu,context.width,context.height);gpu_check(n);printf("GPU adapter: %.*s\n",n-16,fluid_gpu.reply+16);
      gpu_reset_client();gpu_dimensions(context.width,context.height);settings.grid_size=selected_grid;
      settings.dye_add_intensity=4;settings.dye_diffusion=.995f;settings.render_intensity_multiplier=2;settings.input_symmetry=3;settings.sim_speed=2;
      mouse_pixel_pos.x=context.width*.5f;mouse_pixel_pos.y=context.height*.74f;mouse_infos.last[0]=.5f;mouse_infos.last[1]=.26f;simulation.last_frame=0;settings.time=0;simulation.initialized=false;
      gpu_check(init(&context));gpu_flush();if(!benchmark_mode)overlay_init();
      printf("Fluid: image=%ux%u grid=%ux%u pressure=%d\n",context.width,context.height,settings.grid_w,settings.grid_h,settings.pressure_iterations);
    }
    static void cleanup(void) {gpu_check(dolly_gpu_wait(&fluid_gpu));shutdown(&context);gpu_flush();gpu_check(dolly_gpu_close(&fluid_gpu));}
    static void reset(void) {
      simulation_reset();
      dynamic_buffer_copy_to(&dynamic_buffers.dye,&dynamic_buffers.rgb_buffer,(WGPUCommandEncoder)1);
      dolly_gpu_submit(&fluid_gpu);gpu_flush();
    }
    static void click(unsigned x,unsigned y) {
      if(!show_panel){if(x<188&&y<42)show_panel=true;return;}
      if(x>=286&&y>=20&&y<48){show_panel=false;return;}
      if(y>=86&&y<114&&x>=138&&x<352){selected_height=x<240?720:1080;rebuild=true;}
      if(y>=122&&y<150&&x>=138&&x<390){selected_grid=x<214?128:x<302?256:512;rebuild=true;}
      if(y>=158&&y<186){if(x>=150&&x<186)settings.pressure_iterations=MAX(0,settings.pressure_iterations-5);if(x>=250&&x<286)settings.pressure_iterations=MIN(50,settings.pressure_iterations+5);}
      if(y>=194&&y<222){if(x>=28&&x<104)settings.render_mode=0;else if(x>=114&&x<214){settings.render_mode=2;settings.enable_shadows=0;}else if(x>=224&&x<336){settings.render_mode=2;settings.enable_shadows=1;}}
      if(y>=230&&y<258){if(x>=28&&x<128)paused=!paused;else if(x>=138&&x<226){reset();}else if(x>=236&&x<400)automatic=!automatic;}
    }
    static void events(void) {
      dolly_input_event e;
      while(dolly_display_next_event(surface.generation,&e,0)>0) {
        if(e.type==DOLLY_INPUT_EVENT_KEY&&e.action==DOLLY_KEY_ACTION_PRESS) {
          if(e.key_length==1){switch(e.data[0]){case 'h':case 'H':show_panel=!show_panel;break;case ' ':paused=!paused;break;case 'r':case 'R':reset();break;case 'a':case 'A':automatic=!automatic;break;case 'q':case 'Q':stopping=true;break;}}
          if(e.key_length==6&&!memcmp(e.data,"Escape",6))stopping=true;
        } else if(e.type==DOLLY_INPUT_EVENT_POINTER) {
          unsigned x=e.width_css_px,y=e.height_css_px;
          bool controls=show_panel?(x>=12&&x<416&&y>=12&&y<270):(x>=12&&x<188&&y>=12&&y<42);
          if(controls){if(e.action==DOLLY_POINTER_ACTION_PRESS)click(x,y);}
          else {mouse_pixel_pos.x=x;mouse_pixel_pos.y=y;last_mouse=seconds();}
        }
      }
    }
    static void autopilot(double t) {
      mouse_pixel_pos.x=context.width*(.5+.28*sin(t*.93));
      mouse_pixel_pos.y=context.height*(.5+.24*cos(t*1.37));
    }
    static void render(void) {
      if(!paused)gpu_check(frame(&context));
      else {float smoke[]={settings.raymarch_steps,settings.smoke_density,settings.enable_shadows,settings.shadow_intensity,settings.smoke_height,settings.light_height,settings.light_intensity,settings.light_falloff};uniform_update(&uniforms.smoke_parameters,&context,smoke,8);for(unsigned i=0;i<UNIFORM_COUNT;i++)uniform_update(global_uniforms[i],&context,NULL,0);WGPUCommandEncoder e=wgpuDeviceCreateCommandEncoder(context.device,NULL);render_program_dispatch(&context,e);WGPUCommandBuffer b=wgpuCommandEncoderFinish(e,NULL);wgpuQueueSubmit(context.queue,1,&b);}
    }
    static void info(double *total,uint64_t *samples) {gpu_flush();gpu_check(dolly_gpu_info(&fluid_gpu));memcpy(&gpu_ms,fluid_gpu.reply+24,8);memcpy(total,fluid_gpu.reply+32,8);memcpy(samples,fluid_gpu.reply+40,8);uint32_t supported;memcpy(&supported,fluid_gpu.reply,4);if(!supported)gpu_ms=-1;}
    static void check_result(void) {
      uint64_t bytes=dynamic_buffers.dye.buffers[0].size;
      WGPUBuffer staging=wgpuDeviceCreateBuffer(context.device,&(WGPUBufferDescriptor){.size=bytes,.usage=WGPUBufferUsage_MapRead|WGPUBufferUsage_CopyDst});
      wgpuCommandEncoderCopyBufferToBuffer((WGPUCommandEncoder)1,dynamic_buffers.dye.buffers[0].buffer,0,staging,0,bytes);
      dolly_gpu_submit(&fluid_gpu);dolly_gpu_map(&fluid_gpu,(uintptr_t)staging,bytes);gpu_flush();
      double sum=0;uint64_t nonzero=0;
      for(uint64_t at=0;at<bytes;at+=DOLLY_GPU_REPLY_BYTES){unsigned n=MIN(bytes-at,DOLLY_GPU_REPLY_BYTES);gpu_check(dolly_gpu_read(&fluid_gpu,(uintptr_t)staging,at,n));for(unsigned i=0;i<n;i+=4){float f;memcpy(&f,fluid_gpu.reply+i,4);if(!isfinite(f)){fputs("Non-finite fluid result\n",stderr);exit(1);}sum+=f;if(fabsf(f)>1e-6)nonzero++;}}
      if(nonzero<100||sum<=0){fputs("Fluid dye did not evolve\n",stderr);exit(1);}
      FILE*f=fopen("/workspace/fluid-proof.txt","w");if(!f){perror("fluid-proof");exit(1);}fprintf(f,"Fluid compute PASS: nonzero=%llu sum=%.9f\n",(unsigned long long)nonzero,sum);fclose(f);printf("Fluid compute PASS: nonzero=%llu sum=%.9f\n",(unsigned long long)nonzero,sum);
    }
    int main(int argc,char **argv) {
      bool check=argc>1&&!strcmp(argv[1],"--check");benchmark_mode=check||(argc>1&&!strcmp(argv[1],"--bench"));
      if(argc>1&&!benchmark_mode){fputs("usage: fluid [--bench [grid [height [steps [ink|smoke|shaded]]]]|--check]\n",stderr);return 1;}
      unsigned steps=check?60:120;
      if(benchmark_mode){if(argc>2)selected_grid=atoi(argv[2]);if(argc>3)selected_height=atoi(argv[3]);if(argc>4)steps=atoi(argv[4]);if(argc>5)benchmark_style=argv[5];fluid_clock=1;}
      if((selected_grid!=128&&selected_grid!=256&&selected_grid!=512)||(selected_height!=720&&selected_height!=1080)||steps<1||steps>1000){fputs("grid: 128/256/512; height: 720/1080; steps: 1..1000\n",stderr);return 1;}
      if(!strcmp(benchmark_style,"smoke")){settings.render_mode=2;settings.enable_shadows=0;}
      else if(!strcmp(benchmark_style,"shaded")){settings.render_mode=2;settings.enable_shadows=1;}
      else if(strcmp(benchmark_style,"ink")){fputs("style: ink/smoke/shaded\n",stderr);return 1;}
      gpu_check(dolly_display_acquire(&surface));initialize();
      if(benchmark_mode) {
        for(unsigned i=0;i<20;i++){fluid_clock+=16666667;autopilot(i/60.);render();}
        gpu_check(dolly_gpu_wait(&fluid_gpu));double before;uint64_t count_before;info(&before,&count_before);double start=seconds();
        for(unsigned i=0;i<steps;i++){fluid_clock+=16666667;autopilot((i+20)/60.);render();}
        gpu_check(dolly_gpu_wait(&fluid_gpu));double wall=seconds()-start,total;uint64_t samples;info(&total,&samples);
        printf("FLUID_BENCH {\"style\":\"%s\",\"grid\":%u,\"width\":%u,\"height\":%u,\"pressure\":%d,\"steps\":%u,\"wall_ms\":%.6f,\"gpu_ms\":%.6f,\"gpu_samples\":%llu}\n",benchmark_style,selected_grid,context.width,context.height,settings.pressure_iterations,steps,wall*1000/steps,samples>count_before?(total-before)/(samples-count_before):-1,(unsigned long long)(samples-count_before));
        if(check)check_result();
      } else {
        uint32_t sequence=0;unsigned frames=0;double start=seconds(),updated=start;
        while(!stopping){events();if(stopping)break;if(rebuild){cleanup();initialize();rebuild=false;}
          double now=seconds();if(automatic&&now-last_mouse>3)autopilot(now-start);
          render();frames++;if(now-updated>.5){fps=frames/(now-updated);frames=0;updated=now;double t;uint64_t n;info(&t,&n);}
          gpu_check(dolly_display_wait_frame(surface.generation,&sequence,-1));}
      }
      cleanup();gpu_check(dolly_display_release(surface.generation));return 0;
    }

FILE /usr/src/dolly/fluid/overlay.wgsl
    struct Item {rect:vec4f, character:u32, color:u32, a:u32, b:u32}
    @group(0) @binding(0) var<storage,read> items:array<Item>;
    @group(0) @binding(1) var<uniform> screen:vec4f;
    struct V { @builtin(position) pos:vec4f, @location(0) uv:vec2f, @location(1) @interpolate(flat) item:u32 }
    @vertex fn ui_vertex(@builtin(vertex_index) v:u32,@builtin(instance_index) i:u32)->V {
     let corners=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
     let q=corners[v];let r=items[i].rect;let p=r.xy+q*r.zw;var o:V;
     o.pos=vec4f(p.x/screen.x*2.-1.,1.-p.y/screen.y*2.,0,1);o.uv=q;o.item=i;return o;
    }
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
        case 48u: {lo=714286u;hi=14899u;}
        case 52u: {lo=1025321u;hi=8456u;}
        case 53u: {lo=492607u;hi=15888u;}
        case 54u: {lo=492590u;hi=14897u;}
        case 55u: {lo=139807u;hi=2114u;}
        case 56u: {lo=476718u;hi=14897u;}
        case 57u: {lo=1001006u;hi=14864u;}
        case 46u: {lo=0u;hi=4096u;}
        case 45u: {lo=1015808u;hi=0u;}
        case 43u: {lo=1020032u;hi=132u;}
        case 47u: {lo=139792u;hi=1058u;}
        default: {}
      }
      let i=p.y*5u+p.x;return f32(select((lo>>(i%20u))&1u,(hi>>((i-20u)%20u))&1u,i>=20u));
    }
    
    @fragment fn ui_fragment(v:V)->@location(0) vec4f {
     let item=items[v.item];let c=item.color;
     var alpha=f32((c>>24u)&255u)/255.;
     if(item.character!=0u) {alpha*=glyph(item.character,vec2u(min(v.uv*vec2f(5,7),vec2f(4,6))));}
     let rgb=vec3f(f32(c&255u),f32((c>>8u)&255u),f32((c>>16u)&255u))/255.;return vec4f(rgb*alpha,alpha);
    }

FILE /usr/src/dolly/fluid/platform.h
    #pragma once
    #define _POSIX_C_SOURCE 200809L
    #include <webgpu/webgpu.h>
    #include <dolly/gpu.h>
    #include <dolly/display.h>
    #include <cglm/vec2.h>
    #include <cglm/vec4.h>
    #include <assert.h>
    #include <math.h>
    #include <stdbool.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <time.h>
    
    #define CODE(...) #__VA_ARGS__
    #define STRVIEW(s) ((WGPUStringView){s,sizeof(s)-1})
    #define ASSERT(x) assert(x)
    #define ARRAY_SIZE(x) (sizeof(x)/sizeof((x)[0]))
    #define MIN(a,b) ((a)<(b)?(a):(b))
    #define MAX(a,b) ((a)>(b)?(a):(b))
    #define UNUSED_VAR(x) (void)(x)
    #define WGPU_RELEASE_RESOURCE(T,x) do {if(x){wgpu##T##Release(x);x=0;}} while(0);
    #define WGPU_VERTATTR_DESC(l,f,o) ((WGPUVertexAttribute){.shaderLocation=l,.format=f,.offset=o})
    #define WGPU_VERTEX_BUFFER_LAYOUT(name,stride,...) \
     WGPUVertexAttribute name##_attrs[]={__VA_ARGS__}; \
     WGPUVertexBufferLayout name##_vertex_buffer_layout={.arrayStride=stride,.stepMode=WGPUVertexStepMode_Vertex,.attributeCount=ARRAY_SIZE(name##_attrs),.attributes=name##_attrs};
    
    typedef struct wgpu_context_t { WGPUDevice device; WGPUAdapter adapter; WGPUQueue queue; WGPUTextureView swapchain_view; WGPUTextureFormat render_format; unsigned width,height; } wgpu_context_t;
    typedef struct { WGPUBuffer buffer; WGPUBufferUsage usage; uint32_t size,count; } wgpu_buffer_t;
    typedef struct { const char *label; WGPUBufferUsage usage; uint32_t size,count; struct {const void *data;uint32_t size;} initial; WGPUBool mapped_at_creation; } wgpu_buffer_desc_t;
    typedef struct {int type; float mouse_x,mouse_y;} input_event_t;
    enum {INPUT_EVENT_TYPE_MOUSE_MOVE=1};
    typedef struct {const char *title; bool no_depth_buffer;int (*init_cb)(wgpu_context_t*);int (*frame_cb)(wgpu_context_t*);void (*shutdown_cb)(wgpu_context_t*);void (*input_event_cb)(wgpu_context_t*,const input_event_t*);} wgpu_desc_t;
    static void wgpu_start(const wgpu_desc_t *d) {(void)d;abort();} /* app.c owns the Dolly entry point. */
    wgpu_buffer_t wgpu_create_buffer(wgpu_context_t*,const wgpu_buffer_desc_t*);
    void wgpu_destroy_buffer(wgpu_buffer_t*);
    WGPUShaderModule wgpu_create_shader_module(WGPUDevice,const char*);
    WGPUBlendState wgpu_create_blend_state(bool);
    extern dolly_gpu fluid_gpu;
    extern uint64_t fluid_clock;
    uint64_t gpu_id(void);
    void fluid_draw_overlay(void);
    void gpu_flush(void);
    void gpu_reset_client(void);
    void gpu_dimensions(unsigned,unsigned);
    void gpu_check(int);
    static double seconds(void) {struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec*1e-9;}
    static void stm_setup(void) {}
    static uint64_t stm_now(void) {return fluid_clock?fluid_clock:(uint64_t)(seconds()*1e9);}
    static double stm_ms(uint64_t t) {return t/1e6;}
    static double stm_sec(uint64_t t) {return t/1e9;}
    static uint64_t stm_diff(uint64_t a,uint64_t b) {return a-b;}

FILE /usr/src/dolly/fluid/webgpu.c
    #include "platform.h"
    #include <errno.h>
    
    dolly_gpu fluid_gpu;
    uint64_t fluid_clock;
    static uint64_t next_id, render_pipeline, compute_pipeline, render_group, compute_group, vertex_buffer, vertex_offset, vertex_size;
    static unsigned width,height;
    uint64_t gpu_id(void) {return ++next_id;}
    static bool clear;
    static float clear_color[4];
    static struct {uint64_t id,size;} buffers[128];
    static uint64_t id(const void *p) {return (uintptr_t)p;}
    static void put32(void *p,size_t o,uint32_t n) {memcpy((char*)p+o,&n,4);}
    static void put64(void *p,size_t o,uint64_t n) {memcpy((char*)p+o,&n,8);}
    static void unsupported(bool allowed) {if(!allowed){fputs("Unsupported fluid WebGPU descriptor\n",stderr);exit(1);}}
    void gpu_check(int n) {if(n<0){perror("fluid GPU");exit(1);}}
    void gpu_flush(void) {if(fluid_gpu.count)gpu_check(dolly_gpu_batch(&fluid_gpu));dolly_gpu_begin(&fluid_gpu);}
    void gpu_reset_client(void) {next_id=0;memset(buffers,0,sizeof(buffers));dolly_gpu_begin(&fluid_gpu);}
    void gpu_dimensions(unsigned w,unsigned h) {width=w;height=h;}
    static void reserve(size_t n) {if(fluid_gpu.length+n>sizeof(fluid_gpu.packet)||fluid_gpu.count==256)gpu_flush();}
    static void *record(unsigned op,size_t bytes) {reserve(bytes+7);return dolly_gpu_record(&fluid_gpu,op,bytes);}
    static uint64_t buffer_size(WGPUBuffer b) {for(unsigned i=0;i<128;i++)if(buffers[i].id==id(b))return buffers[i].size;unsupported(false);return 0;}
    WGPUBuffer wgpuDeviceCreateBuffer(WGPUDevice device,const WGPUBufferDescriptor *d) {
      (void)device;unsupported(!d->nextInChain&&!d->mappedAtCreation&&d->usage<=1023);
      uint64_t n=++next_id;unsigned i;for(i=0;i<128&&buffers[i].id;i++){}unsupported(i<128);
      buffers[i].id=n;buffers[i].size=d->size;
      reserve(32);dolly_gpu_buffer(&fluid_gpu,n,d->size,d->usage);return (WGPUBuffer)(uintptr_t)n;
    }
    void wgpuQueueWriteBuffer(WGPUQueue q,WGPUBuffer b,uint64_t offset,const void *data,size_t size) {
      (void)q;unsupported(offset%4==0&&size%4==0);
      while(size){size_t n=MIN(size,128*1024);void*p=record(DOLLY_GPU_WRITE_BUFFER,32+n);
        put64(p,8,id(b));put64(p,16,offset);put32(p,24,32);put32(p,28,n);memcpy((char*)p+32,data,n);
        offset+=n;data=(const char*)data+n;size-=n;}
    }
    wgpu_buffer_t wgpu_create_buffer(wgpu_context_t *ctx,const wgpu_buffer_desc_t *d) {
      WGPUBuffer b=wgpuDeviceCreateBuffer(ctx->device,&(WGPUBufferDescriptor){.usage=d->usage,.size=d->size,.mappedAtCreation=d->mapped_at_creation});
      if(d->initial.data)wgpuQueueWriteBuffer(ctx->queue,b,0,d->initial.data,d->initial.size?d->initial.size:d->size);
      return (wgpu_buffer_t){.buffer=b,.usage=d->usage,.size=d->size,.count=d->count};
    }
    static void release(uint64_t n) {if(n){void*p=record(DOLLY_GPU_RELEASE,16);put64(p,8,n);}}
    void wgpuBufferRelease(WGPUBuffer b) {release(id(b));for(unsigned i=0;i<128;i++)if(buffers[i].id==id(b))buffers[i].id=0;}
    void wgpu_destroy_buffer(wgpu_buffer_t *b) {if(b->buffer)wgpuBufferRelease(b->buffer);memset(b,0,sizeof(*b));}
    void wgpuShaderModuleRelease(WGPUShaderModule s) {release(id(s));}
    void wgpuComputePipelineRelease(WGPUComputePipeline p) {release(id(p));}
    void wgpuRenderPipelineRelease(WGPURenderPipeline p) {release(id(p));}
    void wgpuBindGroupRelease(WGPUBindGroup g) {release(id(g));}
    WGPUShaderModule wgpu_create_shader_module(WGPUDevice device,const char *source) {
      (void)device;uint64_t n=++next_id;reserve(strlen(source)+32);dolly_gpu_shader(&fluid_gpu,n,source);return (WGPUShaderModule)(uintptr_t)n;
    }
    WGPUComputePipeline wgpuDeviceCreateComputePipeline(WGPUDevice device,const WGPUComputePipelineDescriptor *d) {
      (void)device;unsupported(!d->nextInChain&&!d->layout&&!d->compute.constantCount&&!d->compute.nextInChain);
      size_t length=d->compute.entryPoint.length;unsupported(length>0&&length<=64);char entry[65];memcpy(entry,d->compute.entryPoint.data,length);entry[length]=0;
      uint64_t n=++next_id;reserve(104);dolly_gpu_compute_pipeline(&fluid_gpu,n,id(d->compute.module),entry);return (WGPUComputePipeline)(uintptr_t)n;
    }
    WGPUBlendState wgpu_create_blend_state(bool enabled) {
      unsupported(!enabled);WGPUBlendComponent c={.operation=WGPUBlendOperation_Add,.srcFactor=WGPUBlendFactor_One,.dstFactor=WGPUBlendFactor_Zero};return (WGPUBlendState){.color=c,.alpha=c};
    }
    WGPURenderPipeline wgpuDeviceCreateRenderPipeline(WGPUDevice device,const WGPURenderPipelineDescriptor *d) {
      (void)device;unsupported(!d->nextInChain&&!d->layout&&!d->depthStencil&&d->vertex.bufferCount==1&&d->fragment&&d->fragment->module==d->vertex.module&&d->fragment->targetCount==1&&d->primitive.topology==WGPUPrimitiveTopology_TriangleList&&d->primitive.cullMode==WGPUCullMode_None&&d->multisample.count==1);
      const WGPUVertexBufferLayout *layout=d->vertex.buffers;
      unsupported(layout->stepMode==WGPUVertexStepMode_Vertex&&layout->attributeCount<=8&&layout->arrayStride<=2048);
      size_t a=d->vertex.entryPoint.length,b=d->fragment->entryPoint.length,count=layout->attributeCount;unsupported(a<=64&&b<=64);
      uint64_t n=++next_id;void*p=record(DOLLY_GPU_VERTEX_PIPELINE,48+count*16+a+b);
      put64(p,8,n);put64(p,16,id(d->vertex.module));put32(p,32,a);put32(p,36,b);put32(p,40,layout->arrayStride);put32(p,44,count);
      for(unsigned i=0;i<count;i++) {const WGPUVertexAttribute *attr=layout->attributes+i;unsigned components=attr->format==WGPUVertexFormat_Float32x2?2:attr->format==WGPUVertexFormat_Float32x3?3:attr->format==WGPUVertexFormat_Float32x4?4:0;unsupported(components&&attr->offset<=UINT32_MAX);
        put32(p,48+i*16,attr->shaderLocation);put32(p,52+i*16,components);put32(p,56+i*16,attr->offset);}
      memcpy((char*)p+48+count*16,d->vertex.entryPoint.data,a);memcpy((char*)p+48+count*16+a,d->fragment->entryPoint.data,b);
      return (WGPURenderPipeline)(uintptr_t)n;
    }
    WGPUBindGroupLayout wgpuComputePipelineGetBindGroupLayout(WGPUComputePipeline p,uint32_t index) {unsupported(index==0);return (WGPUBindGroupLayout)p;}
    WGPUBindGroupLayout wgpuRenderPipelineGetBindGroupLayout(WGPURenderPipeline p,uint32_t index) {unsupported(index==0);return (WGPUBindGroupLayout)p;}
    void wgpuBindGroupLayoutRelease(WGPUBindGroupLayout layout) {(void)layout;} /* Borrowed auto layout. */
    WGPUBindGroup wgpuDeviceCreateBindGroup(WGPUDevice device,const WGPUBindGroupDescriptor *d) {
      (void)device;unsupported(!d->nextInChain&&d->entryCount<=DOLLY_GPU_MAX_BINDINGS);
      uint64_t n=++next_id;void*p=record(DOLLY_GPU_BIND_GROUP,32+d->entryCount*24);put64(p,8,n);put64(p,16,id(d->layout));put32(p,24,d->entryCount);
      for(unsigned i=0;i<d->entryCount;i++){const WGPUBindGroupEntry*e=d->entries+i;unsupported(e->binding==i&&e->buffer&&!e->sampler&&!e->textureView&&!e->nextInChain);put64(p,32+i*24,id(e->buffer));put64(p,40+i*24,e->offset);put64(p,48+i*24,e->size==WGPU_WHOLE_SIZE?buffer_size(e->buffer)-e->offset:e->size);}
      return (WGPUBindGroup)(uintptr_t)n;
    }
    WGPUStatus wgpuAdapterGetLimits(WGPUAdapter a,WGPULimits *limits) {(void)a;gpu_flush();gpu_check(dolly_gpu_info(&fluid_gpu));memset(limits,0,sizeof(*limits));memcpy(&limits->maxStorageBufferBindingSize,fluid_gpu.reply+8,8);limits->maxTextureDimension2D=4096;return WGPUStatus_Success;}
    WGPUStatus wgpuDeviceGetLimits(WGPUDevice d,WGPULimits *l) {return wgpuAdapterGetLimits((WGPUAdapter)d,l);}
    WGPUCommandEncoder wgpuDeviceCreateCommandEncoder(WGPUDevice d,const WGPUCommandEncoderDescriptor *desc) {(void)d;unsupported(!desc);return (WGPUCommandEncoder)1;}
    WGPUComputePassEncoder wgpuCommandEncoderBeginComputePass(WGPUCommandEncoder e,const WGPUComputePassDescriptor *d) {unsupported(e==(WGPUCommandEncoder)1&&!d);return (WGPUComputePassEncoder)1;}
    void wgpuComputePassEncoderSetPipeline(WGPUComputePassEncoder p,WGPUComputePipeline pipeline) {(void)p;compute_pipeline=id(pipeline);}
    void wgpuComputePassEncoderSetBindGroup(WGPUComputePassEncoder p,uint32_t index,WGPUBindGroup g,size_t count,const uint32_t *offsets) {(void)p;(void)offsets;unsupported(index==0&&count==0);compute_group=id(g);}
    void wgpuComputePassEncoderDispatchWorkgroups(WGPUComputePassEncoder e,uint32_t x,uint32_t y,uint32_t z) {(void)e;void*p=record(DOLLY_GPU_COMPUTE,40);put64(p,8,compute_pipeline);put64(p,16,compute_group);put32(p,24,x);put32(p,28,y);put32(p,32,z);}
    void wgpuComputePassEncoderEnd(WGPUComputePassEncoder p) {(void)p;}
    void wgpuComputePassEncoderRelease(WGPUComputePassEncoder p) {(void)p;}
    void wgpuCommandEncoderCopyBufferToBuffer(WGPUCommandEncoder e,WGPUBuffer a,uint64_t ao,WGPUBuffer b,uint64_t bo,uint64_t size) {(void)e;void*p=record(DOLLY_GPU_COPY_BUFFER,48);put64(p,8,id(a));put64(p,16,id(b));put64(p,24,ao);put64(p,32,bo);put64(p,40,size);}
    WGPURenderPassEncoder wgpuCommandEncoderBeginRenderPass(WGPUCommandEncoder e,const WGPURenderPassDescriptor *d) {(void)e;unsupported(d->colorAttachmentCount==1&&!d->depthStencilAttachment);clear=d->colorAttachments[0].loadOp==WGPULoadOp_Clear;const WGPUColor*c=&d->colorAttachments[0].clearValue;clear_color[0]=c->r;clear_color[1]=c->g;clear_color[2]=c->b;clear_color[3]=c->a;vertex_buffer=0;return (WGPURenderPassEncoder)1;}
    void wgpuRenderPassEncoderSetPipeline(WGPURenderPassEncoder e,WGPURenderPipeline p) {(void)e;render_pipeline=id(p);}
    void wgpuRenderPassEncoderSetBindGroup(WGPURenderPassEncoder e,uint32_t index,WGPUBindGroup g,size_t count,const uint32_t *o) {(void)e;(void)o;unsupported(index==0&&count==0);render_group=id(g);}
    void wgpuRenderPassEncoderSetVertexBuffer(WGPURenderPassEncoder e,uint32_t slot,WGPUBuffer b,uint64_t offset,uint64_t size) {(void)e;unsupported(slot==0);vertex_buffer=id(b);vertex_offset=offset;vertex_size=size==WGPU_WHOLE_SIZE?buffer_size(b)-offset:size;}
    void wgpuRenderPassEncoderDraw(WGPURenderPassEncoder e,uint32_t vertices,uint32_t instances,uint32_t first,uint32_t first_instance) {
      (void)e;unsupported(first==0&&first_instance==0&&vertex_buffer);void*p=record(DOLLY_GPU_RENDER_VERTEX,88);put64(p,8,render_pipeline);put64(p,16,render_group);put32(p,24,vertices);put32(p,28,instances);put32(p,32,width);put32(p,36,height);memcpy((char*)p+40,clear_color,16);put32(p,56,clear);put64(p,64,vertex_buffer);put64(p,72,vertex_offset);put64(p,80,vertex_size);clear=false;
    }
    void wgpuRenderPassEncoderEnd(WGPURenderPassEncoder p) {(void)p;}
    void wgpuRenderPassEncoderRelease(WGPURenderPassEncoder p) {(void)p;}
    WGPUCommandBuffer wgpuCommandEncoderFinish(WGPUCommandEncoder e,const WGPUCommandBufferDescriptor *d) {unsupported(e==(WGPUCommandEncoder)1&&!d);return (WGPUCommandBuffer)1;}
    void wgpuQueueSubmit(WGPUQueue q,size_t count,const WGPUCommandBuffer *b) {(void)q;unsupported(count==1&&b[0]==(WGPUCommandBuffer)1);fluid_draw_overlay();reserve(8);dolly_gpu_submit(&fluid_gpu);gpu_flush();}
    void wgpuCommandBufferRelease(WGPUCommandBuffer b) {(void)b;}
    void wgpuCommandEncoderRelease(WGPUCommandEncoder e) {(void)e;}

FILE /usr/src/dolly/fluid/without-imgui.h
    #pragma once
    /* The upstream ImGui panel is replaced by the Dolly controls in app.c. */
    #define imgui_overlay_init(...) ((void)0)
    #define imgui_overlay_shutdown(...) ((void)0)
    #define imgui_overlay_handle_input(...) ((void)0)
    #define imgui_overlay_new_frame(...) ((void)0)
    #define imgui_overlay_render(...) ((void)0)
    #define igSetNextWindowPos(...) ((void)0)
    #define igBegin(...) ((void)0)
    #define igEnd(...) ((void)0)
    #define igCollapsingHeader_TreeNodeFlags(...) false
    #define igSliderInt(...) false
    #define igSliderFloat(...) false
    #define igCombo_Str_arr(...) false
    #define igButton(...) false
    #define igCheckbox(...) false

FILE /usr/src/dolly/fluid/cglm/cglm.h
    #include "../platform.h"

FILE /usr/src/dolly/fluid/webgpu/wgpu_common.h
    #include "../platform.h"

FILE /usr/src/dolly/fluid/webgpu/imgui_overlay.h
    #include "../without-imgui.h"

FILE /usr/src/dolly/fluid/cimgui.h
    #include "without-imgui.h"

FILE /usr/src/dolly/fluid/sokol_time.h
    #include "platform.h"

