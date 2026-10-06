#include "llama.h"
#include "ggml-backend.h"
#include <nlohmann/json.hpp>
#include <algorithm>
#include <cerrno>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
using json=nlohmann::json;
static volatile sig_atomic_t interrupted;
static void emit(const json &value) {auto text=value.dump();puts(text.c_str());fflush(stdout);}
static bool cancelled(void*) {return interrupted;}
extern "C" bool dolly_webgpu_f16();
static void check(bool good,const char *message) {if(!good)throw std::runtime_error(message);}

int main(int argc,char **argv) {
    if(argc<2 || argc>3) {fprintf(stderr,"usage: dolly-llama MODEL.gguf [CONTEXT_TOKENS]\nJSON requests on stdin: prompt, max_tokens, temperature, top_k, top_p, presence_penalty, seed\n");return 2;}
    const unsigned context=argc==3?strtoul(argv[2],nullptr,10):8192;
    if(context<128 || context>16384) {fprintf(stderr,"context must be 128..16384 tokens\n");return 2;}
    signal(SIGINT,[](int){interrupted=1;});
    llama_backend_init();
    if(!ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU)) {
        emit({{"error","Local inference requires a WebGPU adapter; the page's GPU indicator says why there is none"}});
        llama_backend_free();return 1;
    }
    const char *shaders=dolly_webgpu_f16()?"f16":"f32";
    if(strcmp(argv[1],"--check")==0) {emit({{"ready",true},{"gpu",true},{"shaders",shaders}});llama_backend_free();return 0;}
    auto mp=llama_model_default_params();mp.n_gpu_layers=999;mp.load_mode=LLAMA_LOAD_MODE_NONE;
    llama_model *model=llama_model_load_from_file(argv[1],mp);
    if(!model) {emit({{"error","Unable to load model; see stderr"}});return 1;}
    const auto vocab=llama_model_get_vocab(model);
    auto cp=llama_context_default_params();cp.n_ctx=context;cp.n_batch=512;cp.n_ubatch=512;
    cp.n_threads=1;cp.n_threads_batch=1;cp.no_perf=false;cp.abort_callback=cancelled;
    // f32 shaders cannot store f16: keep the KV cache and attention mask in f32.
    if(!dolly_webgpu_f16()) {cp.type_k=cp.type_v=GGML_TYPE_F32;cp.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;}
    auto ctx=llama_init_from_model(model,cp);
    if(!ctx) {llama_model_free(model);emit({{"error","Unable to create inference context"}});return 1;}
    emit({{"ready",true},{"context",context},{"parameters",llama_model_n_params(model)},{"shaders",shaders}});
    char *line=nullptr;size_t capacity=0;
    std::vector<llama_token> cached; // the tokens whose state the context holds, in order
    for(;;) {
        interrupted=0;
        if(getline(&line,&capacity,stdin)<0) {if(errno==EINTR){clearerr(stdin);continue;}break;}
        llama_sampler *sampler=nullptr;
        try {
            check(strlen(line)<=1024*1024,"Request exceeds 1 MiB");
            const auto request=json::parse(line);const auto prompt=request.at("prompt").get<std::string>();
            const int maximum=request.value("max_tokens",1024),top_k=request.value("top_k",0);
            const float temperature=request.value("temperature",0.6f),top_p=request.value("top_p",1.0f),
              presence=request.value("presence_penalty",0.0f);
            check(maximum>0 && maximum<=4096 && temperature>=0 && temperature<=2 && top_k>=0 && top_p>0 && top_p<=1 &&
              presence>=-2 && presence<=2,"Invalid generation limits");
            int n=-llama_tokenize(vocab,prompt.data(),prompt.size(),nullptr,0,true,true);
            check(n>0 && n+maximum<=int(context),"The request exceeds the available context size");
            std::vector<llama_token> tokens(n);
            check(llama_tokenize(vocab,prompt.data(),prompt.size(),tokens.data(),n,true,true)==n,"Tokenization failed");
            // Agent turns resend the whole conversation: reuse the longest cached prefix,
            // keeping one token to evaluate. Recurrent state cannot roll back, so a
            // divergence inside it starts again from an empty context.
            size_t reused=0;
            while(reused<cached.size() && reused+1<tokens.size() && cached[reused]==tokens[reused])reused++;
            auto memory=llama_get_memory(ctx);
            if(reused<cached.size() && !llama_memory_seq_rm(memory,0,reused,-1))reused=0;
            if(reused==0)llama_memory_clear(memory,true);
            cached.resize(reused);llama_perf_context_reset(ctx);
            sampler=llama_sampler_chain_init(llama_sampler_chain_default_params());
            if(temperature==0)llama_sampler_chain_add(sampler,llama_sampler_init_greedy());
            else {
                // The presence penalty covers this response. Without a seed every request draws
                // afresh: a fixed one replays the same draws when an agent turn repeats its context.
                llama_sampler_chain_add(sampler,llama_sampler_init_penalties(llama_vocab_n_tokens(vocab),maximum,1,0,presence));
                if(top_k)llama_sampler_chain_add(sampler,llama_sampler_init_top_k(top_k));
                llama_sampler_chain_add(sampler,llama_sampler_init_top_p(top_p,1));
                llama_sampler_chain_add(sampler,llama_sampler_init_temp(temperature));
                llama_sampler_chain_add(sampler,llama_sampler_init_dist(request.value("seed",uint32_t(LLAMA_DEFAULT_SEED))));
            }
            const auto start=ggml_time_us();
            for(int at=reused;at<n && !interrupted;at+=cp.n_batch) {
                const int count=std::min<int>(cp.n_batch,n-at);
                auto batch=llama_batch_get_one(tokens.data()+at,count);
                check(llama_decode(ctx,batch)==0 || interrupted,"Prompt evaluation failed");
                cached.insert(cached.end(),tokens.begin()+at,tokens.begin()+at+count);
            }
            const auto prefill=ggml_time_us();int generated=0;bool stopped=false;
            while(generated<maximum && !interrupted) {
                auto token=llama_sampler_sample(sampler,ctx,-1);
                if(llama_vocab_is_eog(vocab,token)){stopped=true;break;}
                char buffer[1024];int bytes=llama_token_to_piece(vocab,token,buffer,sizeof buffer,0,true);
                check(bytes>=0,"Token text exceeds output buffer");
                emit({{"token",std::vector<uint8_t>((uint8_t*)buffer,(uint8_t*)buffer+bytes)}});generated++;
                auto batch=llama_batch_get_one(&token,1);
                check(llama_decode(ctx,batch)==0 || interrupted,"Token evaluation failed");
                cached.push_back(token);
            }
            if(interrupted)cached.clear();
            const auto end=ggml_time_us();
            emit({{"done",true},{"reason",interrupted?"aborted":stopped?"stop":"length"},
              {"input_tokens",n},{"cached_tokens",reused},{"output_tokens",generated},{"prefill_ms",(prefill-start)/1000.0},
              {"generation_ms",(end-prefill)/1000.0},{"tokens_per_second",generated*1e6/std::max<int64_t>(1,end-prefill)}});
            llama_perf_context_print(ctx);
        } catch(const std::exception &error) {cached.clear();emit({{"error",error.what()}});}
        if(sampler)llama_sampler_free(sampler);
    }
    free(line);llama_free(ctx);llama_model_free(model);llama_backend_free();return 0;
}
