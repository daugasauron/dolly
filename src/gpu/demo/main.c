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
