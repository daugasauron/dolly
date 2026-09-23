#include <dolly/audio.h>
#include <dolly/process.h>
#include <errno.h>
#include <string.h>

static void u32(void *data, size_t offset, uint32_t n) { memcpy((char *)data+offset,&n,4); }
static void u64(void *data, size_t offset, uint64_t n) { memcpy((char *)data+offset,&n,8); }
static int call(dolly_audio *audio, unsigned op, size_t bytes) {
  u32(audio->packet,0,DOLLY_AUDIO_VERSION);u32(audio->packet,4,op);
  u64(audio->packet,8,audio->scope);u64(audio->packet,16,++audio->sequence);
  u32(audio->packet,24,bytes-32);u32(audio->packet,28,0);
  int64_t result=dolly_process_call(DOLLY_AUDIO_PROCESS_OP,audio->packet,bytes,audio->reply,sizeof(audio->reply));
  if(result<0) {errno=-result;return -1;}
  return result;
}
int dolly_audio_open(dolly_audio *audio) {
  memset(audio,0,sizeof(*audio));int n=call(audio,DOLLY_AUDIO_OPEN,32);
  if(n<0)return -1;
  if(n!=16){errno=EPROTO;return -1;}
  memcpy(&audio->scope,audio->reply,8);return 0;
}
int dolly_audio_close(dolly_audio *audio) {
  int n=call(audio,DOLLY_AUDIO_CLOSE,32);if(n>=0)audio->scope=0;return n;
}
int dolly_audio_write(dolly_audio *audio,const float *stereo,uint32_t frames) {
  if(frames<DOLLY_AUDIO_MIN_FRAMES || frames>DOLLY_AUDIO_MAX_FRAMES){errno=EINVAL;return -1;}
  u32(audio->packet,32,frames);u32(audio->packet,36,0);memcpy(audio->packet+40,stereo,frames*8);
  int n=call(audio,DOLLY_AUDIO_WRITE,40+frames*8);uint32_t accepted;
  if(n<0)return -1;
  if(n!=4){errno=EPROTO;return -1;}memcpy(&accepted,audio->reply,4);return accepted;
}
int dolly_audio_get_status(dolly_audio *audio,dolly_audio_status *status) {
  int n=call(audio,DOLLY_AUDIO_STATUS,32);if(n<0)return -1;
  if(n!=sizeof(*status)){errno=EPROTO;return -1;}memcpy(status,audio->reply,n);return 0;
}
