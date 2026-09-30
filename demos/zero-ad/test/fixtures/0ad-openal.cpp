#define AL_ALEXT_PROTOTYPES
#include <AL/al.h>
#include <AL/alc.h>
#include <AL/alext.h>
#include <cassert>
#include <cmath>
#include <cstdio>
#include <vector>
int main() {
 for(int run=0;run<2;++run) {
  auto* device=alcLoopbackOpenDeviceSOFT(nullptr);assert(device);
  int attrs[]={ALC_FORMAT_CHANNELS_SOFT,ALC_STEREO_SOFT,ALC_FORMAT_TYPE_SOFT,ALC_FLOAT_SOFT,ALC_FREQUENCY,48000,0};
  auto* context=alcCreateContext(device,attrs);assert(context);assert(alcMakeContextCurrent(context));
  ALuint buffer,source;alGenBuffers(1,&buffer);alGenSources(1,&source);
  std::vector<short> tone(48000);for(unsigned i=0;i<tone.size();++i)tone[i]=12000*std::sin(6.283185307179586*440*i/48000);
  alBufferData(buffer,AL_FORMAT_MONO16,tone.data(),tone.size()*sizeof(short),48000);
  alSourcei(source,AL_BUFFER,buffer);alSource3f(source,AL_POSITION,1,0,0);alDistanceModel(AL_NONE);alSourcePlay(source);
  std::vector<float> samples(4096*2);double left=0,right=0;
  for(int chunk=0;chunk<14;++chunk) {
   alcRenderSamplesSOFT(device,samples.data(),4096);
   for(unsigned i=0;i<samples.size();i+=2){assert(std::isfinite(samples[i])&&std::isfinite(samples[i+1]));left+=samples[i]*samples[i];right+=samples[i+1]*samples[i+1];}
  }
  ALint state;alGetSourcei(source,AL_SOURCE_STATE,&state);assert(state==AL_STOPPED);assert(alGetError()==AL_NO_ERROR);assert(right>100 && right>left*2);
  printf("OpenAL loopback %d: left=%g right=%g stopped=%d\n",run,left,right,state);
  alDeleteSources(1,&source);alDeleteBuffers(1,&buffer);alcMakeContextCurrent(nullptr);alcDestroyContext(context);assert(alcCloseDevice(device));
 }
}
