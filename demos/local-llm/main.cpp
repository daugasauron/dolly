// dolly-llama: one GGUF on the GPU. stdout is a stream of server-sent events: one when the
// model is ready, then for each stdin line, which is the body llama-server takes at
// /v1/chat/completions, the events llama-server would answer with.
// The chat template, tool-call grammar and parser and the sampling defaults are the
// GGUF's own, through llama.cpp's common library.
#include "chat.h"
#include "common.h"
#include "log.h"
#include "sampling.h"
#include "unicode.h"
#include "ggml-backend.h"
#include <algorithm>
#include <cerrno>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>
using json=common_json;
static volatile sig_atomic_t interrupted;
static bool cancelled(void*) {return interrupted;}
extern "C" bool dolly_webgpu_f16();
static void check(bool good,const std::string &message) {if(!good)throw std::runtime_error(message);}
static void line(const json &value) {puts(value.dump_safe().c_str());fflush(stdout);}
static void event(const json &value) {printf("data: %s\n\n",value.dump_safe().c_str());fflush(stdout);}
static void chunk(const json &delta,const json &finish=nullptr) {
    event({{"object","chat.completion.chunk"},{"choices",json::array({json{{"index",0},{"delta",delta},{"finish_reason",finish}}})}});
}
static json delta_of(const common_chat_msg_diff &diff) {
    json delta=json::object();
    if(!diff.reasoning_content_delta.empty())delta["reasoning_content"]=diff.reasoning_content_delta;
    if(!diff.content_delta.empty())delta["content"]=diff.content_delta;
    if(diff.tool_call_index!=std::string::npos) {
        json function=json::object(),call={{"index",diff.tool_call_index}};
        if(!diff.tool_call_delta.id.empty()) {call["id"]=diff.tool_call_delta.id;call["type"]="function";}
        if(!diff.tool_call_delta.name.empty())function["name"]=diff.tool_call_delta.name;
        if(!diff.tool_call_delta.arguments.empty())function["arguments"]=diff.tool_call_delta.arguments;
        call["function"]=function;delta["tool_calls"]=json::array({call});
    }
    return delta;
}
// The request fields this engine implements; any other is refused by name.
static const std::set<std::string> request_fields={"model","messages","tools","tool_choice","parallel_tool_calls","stream",
  "stream_options","max_tokens","max_completion_tokens","chat_template_kwargs","temperature","top_p","top_k","min_p",
  "repeat_penalty","presence_penalty","frequency_penalty","seed"};

struct Engine {
    common_params params;
    llama_model *model;
    llama_context *ctx;
    const llama_vocab *vocab;
    common_chat_templates_ptr templates;
    std::vector<llama_token> cached; // the tokens whose state the context holds, in order
    // Recurrent state saved after each user message's prompt, newest last, for a memory
    // that cannot roll back: the next user message re-evaluates from there, not from nothing.
    std::vector<common_prompt_checkpoint> checkpoints;
    void complete(const std::string &request);
};

void Engine::complete(const std::string &request) {
    check(request.size()<=1024*1024,"Request exceeds 1 MiB");
    const json body=json::parse(request);
    for(const auto &[field,value]:body.items())check(request_fields.count(field),"Unsupported request field: "+field);
    check(body.value("stream",false),"Only stream: true is implemented");
    common_chat_templates_inputs inputs;
    inputs.messages=common_chat_msgs_parse_oaicompat(body.at("messages"));
    if(body.contains("tools"))inputs.tools=common_chat_tools_parse_oaicompat(body.at("tools"));
    inputs.tool_choice=common_chat_tool_choice_parse_oaicompat(body.value("tool_choice",std::string("auto")));
    inputs.parallel_tool_calls=body.value("parallel_tool_calls",common_chat_templates_get_caps(templates.get())["supports_parallel_tool_calls"]);
    inputs.reasoning_format=COMMON_REASONING_FORMAT_DEEPSEEK;
    inputs.enable_thinking=false;
    if(body.contains("chat_template_kwargs"))for(const auto &[name,value]:body.at("chat_template_kwargs").items()) {
        inputs.chat_template_kwargs[name]=value.dump();
        if(name=="enable_thinking")inputs.enable_thinking=value.get<bool>();
    }
    const auto chat=common_chat_templates_apply(templates.get(),inputs);
    common_chat_parser_params parser(chat);
    parser.reasoning_format=inputs.reasoning_format;
    parser.parse_tool_calls=!inputs.tools.empty() && inputs.tool_choice!=COMMON_CHAT_TOOL_CHOICE_NONE;
    if(!chat.parser.empty())parser.parser.load(chat.parser);

    // The GGUF's sampling defaults, then the request's.
    auto sampling=params.sampling;
    sampling.temp=body.value("temperature",sampling.temp);sampling.top_p=body.value("top_p",sampling.top_p);
    sampling.top_k=body.value("top_k",sampling.top_k);sampling.min_p=body.value("min_p",sampling.min_p);
    sampling.penalty_repeat=body.value("repeat_penalty",sampling.penalty_repeat);
    sampling.penalty_present=body.value("presence_penalty",sampling.penalty_present);
    sampling.penalty_freq=body.value("frequency_penalty",sampling.penalty_freq);
    sampling.seed=body.value("seed",sampling.seed);
    // The template's tool-call grammar, applied from its trigger on, as llama-server passes it.
    if(!chat.grammar.empty())sampling.grammar={COMMON_GRAMMAR_TYPE_TOOL_CALLS,chat.grammar};
    sampling.grammar_lazy=chat.grammar_lazy;sampling.generation_prompt=chat.generation_prompt;
    for(const auto &text:chat.preserved_tokens) {
        const auto ids=common_tokenize(vocab,text,false,true);
        if(ids.size()==1)sampling.preserved_tokens.insert(ids[0]);
    }
    for(auto trigger:chat.grammar_triggers) {
        const auto ids=trigger.type==COMMON_GRAMMAR_TRIGGER_TYPE_WORD?common_tokenize(vocab,trigger.value,false,true):llama_tokens{};
        if(ids.size()==1 && sampling.preserved_tokens.count(ids[0])) {trigger.type=COMMON_GRAMMAR_TRIGGER_TYPE_TOKEN;trigger.token=ids[0];}
        sampling.grammar_triggers.push_back(trigger);
    }
    common_sampler_ptr sampler(common_sampler_init(model,sampling));
    check(sampler!=nullptr,"Unable to create the sampler");

    const auto tokens=common_tokenize(vocab,chat.prompt,true,true);
    const int n=tokens.size(),context=llama_n_ctx(ctx);
    // llama-server's wording: Pi compacts and retries on it.
    check(n>0 && n<context,"the request exceeds the available context size, try increasing it");
    const int limit=std::min<int>(context-n,body.value("max_tokens",body.value("max_completion_tokens",context)));
    check(limit>0,"max_tokens must be positive");
    // Agent turns resend the whole conversation: reuse the longest cached prefix,
    // keeping one token to evaluate. Recurrent state cannot roll back, so a
    // divergence inside it restores the latest checkpoint before it, or starts again.
    size_t reused=0;
    while(reused<cached.size() && reused+1<tokens.size() && cached[reused]==tokens[reused])reused++;
    auto memory=llama_get_memory(ctx);
    if(reused<cached.size() && !llama_memory_seq_rm(memory,0,reused,-1)) {
        while(!checkpoints.empty() && checkpoints.back().n_tokens>int64_t(reused))checkpoints.pop_back();
        if(checkpoints.empty())reused=0;
        else {
            checkpoints.back().load_tgt(ctx,0,LLAMA_STATE_SEQ_FLAGS_PARTIAL_ONLY);
            reused=checkpoints.back().n_tokens;
            check(llama_memory_seq_rm(memory,0,reused,-1),"Unable to roll the context back to its checkpoint");
        }
    }
    if(reused==0) {llama_memory_clear(memory,true);checkpoints.clear();}
    cached.resize(reused);
    // The prompt up to the generation prompt is what later turns keep; that is where a checkpoint goes.
    const int kept=inputs.messages.back().role=="user"?n-int(common_tokenize(vocab,chat.generation_prompt,false,true).size()):0;
    const auto start=ggml_time_us();
    for(int at=reused;at<n && !interrupted;) {
        const int count=std::min<int>({params.n_batch,n-at,at<kept?kept-at:n-at});
        check(llama_decode(ctx,llama_batch_get_one(const_cast<llama_token*>(tokens.data())+at,count))==0 || interrupted,"Prompt evaluation failed");
        cached.insert(cached.end(),tokens.begin()+at,tokens.begin()+at+count);at+=count;
        if(at==kept && kept>int(reused)) {
            if(checkpoints.size()==2)checkpoints.erase(checkpoints.begin());
            checkpoints.emplace_back().update_pos(kept,0,kept-1);
            checkpoints.back().update_tgt(ctx,0,LLAMA_STATE_SEQ_FLAGS_PARTIAL_ONLY);
        }
    }
    const auto prefill=ggml_time_us();
    chunk({{"role","assistant"},{"content",nullptr}});
    std::string text;common_chat_msg message;std::vector<std::string> call_ids;
    int generated=0;bool stopped=false;int64_t sampling_us=0,publishing_us=0;
    const auto publish=[&](bool partial) {
        const auto began=ggml_time_us();
        auto next=common_chat_parse(text,partial,parser);
        if(!next.empty()) {
            next.set_tool_call_ids(call_ids,[&]{return "call_"+std::to_string(ggml_time_us())+"_"+std::to_string(call_ids.size());});
            for(const auto &diff:common_chat_msg_diff::compute_diffs(message,next))chunk(delta_of(diff));
            message=next;
        }
        publishing_us+=ggml_time_us()-began;
    };
    while(generated<limit && !interrupted && !stopped) {
        const auto began=ggml_time_us();
        auto token=common_sampler_sample(sampler.get(),ctx,-1);
        common_sampler_accept(sampler.get(),token,true);
        sampling_us+=ggml_time_us()-began;
        if(llama_vocab_is_eog(vocab,token)) {stopped=true;break;}
        text+=common_token_to_piece(ctx,token,sampling.preserved_tokens.count(token)>0);generated++;
        check(llama_decode(ctx,llama_batch_get_one(&token,1))==0 || interrupted,"Token evaluation failed");
        cached.push_back(token);
        // Text that may still become one of the template's stop words is held back.
        bool held=!common_utf8_is_complete(text);
        for(const auto &stop:chat.additional_stops) {
            const auto at=text.find(stop);
            if(at!=std::string::npos) {text.resize(at);stopped=true;}
            else for(size_t length=std::min(stop.size()-1,text.size());length>0 && !held;length--)
                held=text.compare(text.size()-length,length,stop,0,length)==0;
        }
        if(!held && !stopped)publish(true);
    }
    if(interrupted) {cached.clear();throw std::runtime_error("Generation was interrupted");}
    publish(false);
    const auto end=ggml_time_us();
    fprintf(stderr,"dolly-llama: %d prompt tokens, %zu reused, %.0f ms; %d generated in %.0f ms (sampling %.0f, parsing and writing %.0f); temperature %.2f; %zu checkpoints of %.1f MiB\n",
      n,reused,(prefill-start)/1000.0,generated,(end-prefill)/1000.0,sampling_us/1000.0,publishing_us/1000.0,sampling.temp,
      checkpoints.size(),checkpoints.empty()?0.0:checkpoints.back().size()/1048576.0);
    chunk(json::object(),!stopped?"length":message.tool_calls.empty()?"stop":"tool_calls");
    event({{"object","chat.completion.chunk"},{"choices",json::array()},
      {"usage",{{"prompt_tokens",n},{"completion_tokens",generated},{"total_tokens",n+generated},
        {"prompt_tokens_details",{{"cached_tokens",reused}}}}},
      {"timings",{{"cache_n",reused},{"prompt_n",n-reused},{"prompt_ms",(prefill-start)/1000.0},{"predicted_n",generated},
        {"predicted_ms",(end-prefill)/1000.0},{"predicted_per_second",generated*1e6/std::max<int64_t>(1,end-prefill)}}}});
}

int main(int argc,char **argv) {
    if(argc<2 || argc>3) {fprintf(stderr,"usage: dolly-llama MODEL.gguf [CONTEXT_TOKENS]\n       dolly-llama --check\nEach stdin line is a llama-server chat-completions request with stream: true.\n");return 2;}
    signal(SIGINT,[](int){interrupted=1;});
    // llama's common logger prints from its own thread; llama and ggml report on stderr themselves.
    common_log_set_verbosity_thold(-1);
    llama_log_set([](ggml_log_level level,const char *text,void*) {if(level!=GGML_LOG_LEVEL_DEBUG)fputs(text,stderr);},nullptr);
    llama_backend_init();
    if(!ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_GPU)) {
        line({{"error","Local inference requires a WebGPU adapter; the page's GPU indicator says why there is none"}});
        llama_backend_free();return 1;
    }
    const char *shaders=dolly_webgpu_f16()?"f16":"f32";
    if(strcmp(argv[1],"--check")==0) {line({{"ready",true},{"shaders",shaders}});llama_backend_free();return 0;}
    Engine engine;auto &params=engine.params;
    params.model.path=argv[1];params.n_ctx=argc==3?atoi(argv[2]):8192;params.n_batch=params.n_ubatch=512;
    params.n_gpu_layers=999;params.load_mode=LLAMA_LOAD_MODE_NONE;params.fit_params=false;params.warmup=false;
    params.cpuparams.n_threads=params.cpuparams_batch.n_threads=1;
    // f32 shaders cannot store f16: keep the KV cache and attention mask in f32.
    if(!dolly_webgpu_f16()) {params.cache_type_k=params.cache_type_v=GGML_TYPE_F32;params.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;}
    if(params.n_ctx<128) {fprintf(stderr,"context must be at least 128 tokens\n");return 2;}
    auto loaded=common_init_from_params(params);
    engine.model=loaded->model();engine.ctx=loaded->context();
    if(!engine.ctx) {event({{"error",engine.model?"Unable to create inference context; see stderr":"Unable to load model; see stderr"}});return 1;}
    engine.vocab=llama_model_get_vocab(engine.model);
    llama_set_abort_callback(engine.ctx,cancelled,nullptr);
    engine.templates=common_chat_templates_init(engine.model,"");
    event({{"ready",true},{"context",llama_n_ctx(engine.ctx)},{"trained_context",llama_model_n_ctx_train(engine.model)},
      {"thinking",common_chat_templates_support_enable_thinking(engine.templates.get())},{"shaders",shaders}});
    char *request=nullptr;size_t capacity=0;
    for(;;) {
        interrupted=0;
        if(getline(&request,&capacity,stdin)<0) {if(errno==EINTR){clearerr(stdin);continue;}break;}
        try {engine.complete(request);}
        catch(const std::exception &error) {engine.cached.clear();event({{"error",{{"message",error.what()}}}});}
        printf("data: [DONE]\n\n");fflush(stdout);
    }
    free(request);loaded.reset();llama_backend_free();return 0;
}
