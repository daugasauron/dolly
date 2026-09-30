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
