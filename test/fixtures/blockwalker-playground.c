#include "world.c"
#include <assert.h>

static void ticks(int n){for(int i=0;i<n;i++)world_step();}
static float cargo_z(int id){return b3Body_GetPosition(world_find(id)->physics.parts[0].body).z;}
static void motor(int id,float throttle){Creature *c=world_find(id);vehicle_controls(&c->design,c->controls,throttle,0);}
static void magnet(int id,int powered){Creature *c=world_find(id);c->physics.parts[8].magnet_power=powered;}
static void check_pier_water(JSContext *ctx){
    int ids[]={world_drop_cargo(106,-1.75f,10,MATERIAL_HULL),world_drop_cargo(125,-1.75f,10,MATERIAL_HULL),world_drop_cargo(106,.65f,10,MATERIAL_ALLOY),world_drop_cargo(164,4.65f,40,MATERIAL_ALLOY),world_drop_cargo(164,22,40,MATERIAL_ALLOY)};
    const char *names[]={"covered","open","deck","under beam","roof"};float floors[]={-12,-12,0,4,19};
    for(int step=0;step<3600;step++){
        if(step==1800){world_save(ctx);world_close();world_load(ctx);}
        world_step();assert(world.count==5&&world.deaths==0);
    }
    for(int i=0;i<5;i++){
        Creature *c=world_find(ids[i]);b3Pos p=b3Body_GetPosition(c->physics.parts[0].body);JSValue sensors=physics_sensors(ctx,&c->physics,&c->design,.1);
        double ground=get_number(ctx,sensors,"ground",NAN);JS_FreeValue(ctx,sensors);
        assert(ground==floors[i]);
        if(i>=2){assert(fabsf(p.y-floors[i]-.485f)<.02f);}
        else{assert(p.y>WATER_LEVEL-.4f&&p.y<WATER_LEVEL+.6f);}
        printf("PIER WATER: %s cargo y %.4f, ground %.1f after 60 s and restart\n",names[i],p.y,ground);
    }
    Character *box=&world_find(ids[0])->design;Vector3 buried={0,-1,0},sunk={125,-6,10};
    assert(physical_failure(box,buried,1,.5f,terrain_floor(buried))==REMOVAL_TERRAIN);
    assert(physical_failure(box,sunk,1,.5f,terrain_floor(sunk))==REMOVAL_SUNK);
    world_close();
}
static void check_resume(JSContext *ctx){
    Character rig={0};character_add(&rig,-1,0,0,0,BLOCK_BOX,0);character_add(&rig,0,0,1,0,BLOCK_HINGE,1);rig.blocks[1].axis=1;rig.anchored=1;
    const char *source="function(t,s,m){m.calls=(m.calls||0)+1;m.angle=s.angles[1];m.rate=s.rates[1];m.time=t;m.dt=s.dt;m.ready=s.contactsReady;return {A:.3};}";
    for(int hz=10;hz<=60;hz+=50)for(int steps=72;steps<=73;steps++){
        world_close();Creature *c=spawn(&rig,source,"Resume probe",1,hz,-40,0);int id=c->id;ticks(steps);c=world_find(id);
        float angle=c->physics.parts[1].angle,rate=c->physics.parts[1].rate,command=c->controls['A'];int previous=c->controller->last_step,calls=get_number(c->controller->ctx,c->controller->memory,"calls",0);double age=world.age;
        assert(angle>.8f&&rate>.7f&&command>.29f);world_save(ctx);world_close();world_load(ctx);c=world_find(id);
        assert(world.age==age&&c->physics.steps==steps&&c->controller->last_step==previous&&c->controls['A']==command&&!c->physics.sampled);
        assert(fabsf(c->physics.parts[1].angle-angle)<.0001f&&fabsf(c->physics.parts[1].rate-rate)<.0001f);
        ticks(1);c=world_find(id);assert(get_number(c->controller->ctx,c->controller->memory,"calls",0)==calls&&c->physics.parts[1].command==command&&c->physics.sampled);
        int ran=0;
        for(int i=0;i<7&&!ran;i++){
            angle=c->physics.parts[1].angle;rate=c->physics.parts[1].rate;double time=c->physics.steps/60.;ticks(1);
            ran=get_number(c->controller->ctx,c->controller->memory,"calls",0)>calls;
            if(ran){
                assert(fabs(get_number(c->controller->ctx,c->controller->memory,"angle",0)-angle)<.0001&&fabs(get_number(c->controller->ctx,c->controller->memory,"rate",0)-rate)<.0001);
                assert(get_number(c->controller->ctx,c->controller->memory,"ready",0)==1&&fabs(get_number(c->controller->ctx,c->controller->memory,"dt",0)-(time-previous/60.))<1e-9);
                printf("RESUME: %d Hz at step %d, first input angle %.6f, rate %.6f, dt %.6f, held command %.3f\n",hz,steps,angle,rate,time-previous/60.,command);
            }
        }assert(ran);world_close();
    }character_clear(&rig);
}
static void check_air_traffic(JSContext *ctx){
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);int lookout=0;
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        int bird=name&&!strncmp(name,"Postbird /",10),scout=!lookout&&name&&!strncmp(name,"Komame /",8);
        if(bird||scout){put_number(ctx,item,"x",0);put_number(ctx,item,"z",scout?12:0);if(scout){lookout=1;JS_SetPropertyStr(ctx,item,"source",JS_NewString(ctx,"function(){return {}}"));}JS_SetPropertyUint32(ctx,selected,scout?1:0,JS_DupValue(ctx,item));}
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==2);
    Creature *bird=&world.creatures[0],*scout=&world.creatures[1];Controller *controller=bird->controller;
    const char *memory="{\"phase\":\"return\",\"home\":[0,12],\"goal\":[0,12],\"ts\":0,\"hi\":0,\"pi\":0,\"ri\":0,\"job\":0,\"deliveries\":0,\"cruise\":5.2}";
    JS_FreeValue(controller->ctx,controller->memory);controller->memory=JS_ParseJSON(controller->ctx,memory,strlen(memory),"traffic-trial");
    float peak=0,travel=0,displacement=0;
    for(int i=0;i<20*60;i++){
        world_step();assert(world.count==2&&world.deaths==0);
        b3Pos a=b3Body_GetPosition(bird->physics.parts[0].body),b=b3Body_GetPosition(scout->physics.parts[0].body);
        peak=fmaxf(peak,a.y);travel=fmaxf(travel,a.z);displacement=fmaxf(displacement,hypotf(b.x,b.z-12));
    }
    assert(peak>8&&travel>10&&displacement<.1f);
    printf("AIR TRAFFIC: courier crossed %.3f m at peak %.3f m; stationary lookout displaced %.4f m\n",travel,peak,displacement);world_close();
}
static void check_walker_recovery(JSContext *ctx){
    // Recorded Marrowstep lift stall at 1200 seconds.
    const float poses[][13]={
        {-79.6057739f,2.46544480f,34.5087395f,0.00821135659f,-0.104552686f,-0.00970508158f,0.994438112f,0.0000975672738f,0.00000156650867f,0.0000277990985f,0.00000290911180f,-0.00000565144546f,0.0000294476431f},
        {-79.8150482f,2.45161676f,35.4864960f,0.00855860300f,-0.104414813f,-0.0129341185f,0.994412899f,0.0000678265424f,-0.00000465017820f,0.0000237537424f,-0.00000142727322f,-0.0000142936597f,0.0000414608876f},
        {-79.3973846f,2.47982645f,33.5307312f,0.00801522378f,-0.104375280f,-0.00406296039f,0.994497359f,0.0000627121699f,0.00000525320365f,0.0000190374449f,0.00000198608132f,0.0000365329397f,0.00000724589790f},
        {-80.0234756f,2.43745637f,36.4643402f,0.00958090182f,-0.103568830f,-0.0160378423f,0.994446874f,0.000100395773f,-0.00000535343406f,0.0000263449892f,-0.00000702019270f,0.00000706406445f,0.0000512324768f},
        {-79.1900406f,2.49544048f,32.5525169f,0.00811433606f,-0.103585444f,0.00161482429f,0.994586170f,-0.00000113205351f,0.0000122811543f,0.0000189565744f,-0.0000311581462f,0.0000314830795f,-0.0000123603295f},
        {-81.0018005f,2.47371268f,36.2597046f,0.212344781f,-0.103705741f,0.00533384411f,0.971661687f,0.000113855902f,-0.00000802084378f,0.0000289480085f,0.0000105130539f,0.00000913036092f,-0.0000276181709f},
        {-80.9466782f,1.56450856f,35.8479385f,0.212250590f,-0.103023894f,0.00635917345f,0.971748590f,0.0000849478674f,-0.00000525690348f,0.0000189527145f,0.0000103498087f,0.00000914538941f,-0.0000276669743f},
        {-80.8898087f,0.655178726f,35.4368134f,0.211889863f,-0.102537535f,0.00740651740f,0.971871376f,0.00000276153742f,-0.00000213714247f,-0.00000380446886f,-0.00000701099589f,0.00000140397219f,-0.00000452853101f},
        {-81.8686752f,0.684000134f,35.2343674f,0.211881205f,-0.102518760f,0.00749374367f,0.971874595f,0.00000332599484f,0.00000827665099f,0.00000114875093f,0.00000469958013f,0.00000483908752f,-0.0000154759709f},
        {-79.0455322f,2.40054584f,36.6700096f,-0.428377837f,-0.0853575096f,-0.0612328164f,0.897472560f,0.000109442677f,-0.00000947432090f,0.0000486161771f,-0.0000123063801f,-0.0000242106398f,-0.0000194032891f},
        {-79.1051559f,1.64552307f,36.8175201f,0.240893304f,-0.104889482f,0.00685285684f,0.964842856f,0.0000620562278f,-0.00000572053295f,0.0000421307413f,0.0000154876670f,0.0000121045596f,0.0000482286450f},
        {-79.0416336f,0.761466205f,36.3542633f,0.240807071f,-0.104949355f,0.00661835866f,0.964859486f,0.0000836707186f,0.00000263405309f,0.0000291652414f,0.0000111002119f,0.0000261956466f,0.0000207573157f},
        {-78.0637589f,0.723457515f,36.5599747f,0.240815714f,-0.104970776f,0.00653193798f,0.964855552f,0.000110207940f,8.91255468e-7f,-0.0000308226699f,0.00000804925730f,0.0000563991198f,0.00000440456097f},
        {-80.1685638f,2.49081087f,32.3464432f,-0.360070974f,-0.0973979458f,-0.0353636928f,0.927152634f,-0.0000353202631f,0.00000336327935f,0.0000709565502f,0.0000203236323f,0.0000446447812f,0.0000247179196f},
        {-80.1729050f,1.72018802f,32.3852425f,0.312415004f,-0.0975331366f,0.0349999480f,0.944277048f,0.00000566175640f,-5.16622322e-7f,0.0000647258275f,0.0000119334645f,-0.0000101086243f,-0.00000678699143f},
        {-80.0457230f,0.917561233f,31.8023224f,0.312255710f,-0.0974626839f,0.0352112278f,0.944329262f,0.0000126951199f,0.00000509926485f,0.0000585336711f,0.00000800992166f,-0.0000183270076f,0.00000365671076f},
        {-81.0242462f,0.911690056f,31.5962601f,0.312246859f,-0.0974345505f,0.0352959521f,0.944331884f,0.0000135500741f,0.00000320793333f,0.0000234553117f,0.00000156523674f,-0.0000308688032f,-0.00000138655992f},
        {-78.2112274f,2.49899912f,32.7578468f,0.173643753f,-0.101133756f,0.0191839151f,0.979414046f,0.00000477738695f,0.00000832901605f,-0.00000915370947f,-0.0000318743114f,0.0000258348082f,-0.00000894657933f},
        {-78.1388321f,1.56042111f,32.4212189f,0.173694074f,-0.100825585f,0.0186816845f,0.979446590f,0.00000452786253f,-0.00000283490863f,0.0000138823443f,0.0000127696085f,0.00000118397134f,1.52112079e-7f},
        {-78.0676804f,0.621809244f,32.0845795f,0.173525929f,-0.100547776f,0.0180550180f,0.979516745f,0.00000216127296f,0.00000147247783f,0.00000379075937f,0.00000694322716f,0.00000149972641f,-0.00000355885572f},
        {-77.0885010f,0.622214973f,32.2876205f,0.173552856f,-0.100454360f,0.0179813020f,0.979522884f,0.00000474151739f,-0.00000448612536f,0.00000159537240f,0.00000298918030f,-4.49466114e-7f,-0.00000893539527f},
        {-79.5855789f,3.46505737f,34.5277939f,0.00837455317f,-0.103756920f,-0.0115716495f,0.994500160f,0.0000680260782f,0.00000208426195f,0.0000308172494f,0.00000290933167f,-0.00000566770768f,0.0000294444999f},
        {-79.5642929f,4.46459293f,34.5468559f,0.00837610196f,-0.103756994f,-0.0115740821f,0.994500101f,0.00000798410019f,0.00000268687722f,0.0000391031936f,-0.00000478281527f,-0.00000402786509f,0.0000763084463f},
        {-79.7910767f,3.45104051f,35.5064201f,0.00854492001f,-0.103461109f,-0.0129314866f,0.994512737f,0.0000261040477f,-0.00000362929723f,0.0000226693901f,-0.00000142730221f,-0.0000142928257f,0.0000414608876f},
        {-79.9960556f,3.43672299f,36.4852409f,0.00885528140f,-0.103246428f,-0.0142341601f,0.994514585f,0.0000493217667f,-0.00000375712443f,0.0000191165509f,-0.00000704564354f,0.00000712117662f,0.0000512845654f},
    };
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        if(name&&!strncmp(name,"Marrowstep /",11))JS_SetPropertyUint32(ctx,selected,0,JS_DupValue(ctx,item));
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==1);
    Creature *c=&world.creatures[0];assert(c->design.count==sizeof(poses)/sizeof(*poses));int id=c->id;
    for(int i=0;i<c->design.count;i++){const float *p=poses[i];b3BodyId body=c->physics.parts[i].body;b3Body_SetTransform(body,(b3Pos){p[0],p[1],p[2]},(b3Quat){{p[3],p[4],p[5]},p[6]});b3Body_SetLinearVelocity(body,(b3Vec3){p[7],p[8],p[9]});b3Body_SetAngularVelocity(body,(b3Vec3){p[10],p[11],p[12]});}
    physics_refresh(&c->physics,&c->design);world.age=c->physics.time=1200;c->physics.steps=72000;c->controller->last_step=71999;
    c->controls['D']=0.00000229876673f;c->controls['H']=0.00000728595069f;c->controls['L']=0.00000563381627f;c->controls['O']=0.00000312659586f;c->controls['R']=0.00000867479321f;c->controls['W']=6.18295317e-8f;
    Controller *controller=c->controller;const char *state="{\"p\":0,\"a\":1,\"t\":830.0666666666667,\"hit\":0,\"st\":[-0.23466332992500433,0.17115926170718462,0.32450784143164163,-0.2696625503237696],\"x\":-75,\"z\":35,\"d\":1,\"turn\":827.7833333333333,\"reach\":0.28004066032939595}";
    JS_FreeValue(controller->ctx,controller->memory);controller->memory=JS_ParseJSON(controller->ctx,state,strlen(state),"stalled-lift");
    b3Pos start=b3Body_GetPosition(c->physics.parts[0].body);float low=1,moved=0;
    for(int tick=0;tick<15*60&&world.count;tick++){
        world_step();c=world_find(id);if(!c)break;b3Pos p=b3Body_GetPosition(c->physics.parts[0].body);
        low=fminf(low,b3RotateVector(b3Body_GetRotation(c->physics.parts[0].body),b3Vec3_axisY).y);moved=fmaxf(moved,hypotf(p.x-start.x,p.z-start.z));
    }
    printf("WALKER RECOVERY: %d survived, up %.5f, movement %.3f m\n",world.count,low,moved);fflush(stdout);
    assert(world.count==1&&world.deaths==0&&low>.95f&&moved>4);world_close();
}
static void check_air_clearance(JSContext *ctx){
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        if(name&&!strncmp(name,"Skybarge /",10)){put_number(ctx,item,"x",58);put_number(ctx,item,"z",35);JS_SetPropertyUint32(ctx,selected,0,JS_DupValue(ctx,item));}
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==1);int id=world.creatures[0].id;
    Controller *controller=world.creatures[0].controller;
    const char *state="{\"nav\":{\"goal\":[58,72],\"next\":1000,\"visits\":0,\"choices\":1,\"meetings\":0,\"yieldTime\":0,\"path\":0,\"previous\":[58,35],\"goals\":[],\"visiting\":0}}";
    JS_FreeValue(controller->ctx,controller->memory);controller->memory=JS_ParseJSON(controller->ctx,state,strlen(state),"quarry-approach");
    int contacts=0;float low=1,peak=0,furthest=35;
    for(int tick=0;tick<45*60&&world.count;tick++){
        world_step();Creature *c=world_find(id);if(!c)break;
        b3Pos root=b3Body_GetPosition(c->physics.parts[0].body);b3Quat rotation=b3Body_GetRotation(c->physics.parts[0].body);low=fminf(low,b3RotateVector(rotation,b3Vec3_axisY).y);peak=fmaxf(peak,root.y);furthest=fmaxf(furthest,root.z);
        for(int part=0;part<c->design.count;part++){
            b3BodyId body=c->physics.parts[part].body;int capacity=b3Body_GetContactCapacity(body);if(!capacity)continue;
            b3ContactData *data=array_resize(NULL,capacity,sizeof(*data));int count=b3Body_GetContactData(body,data,capacity);
            for(int k=0;k<count;k++){
                b3BodyId a=b3Shape_GetBody(data[k].shapeIdA),b=b3Shape_GetBody(data[k].shapeIdB),other=B3_ID_EQUALS(a,body)?b:a;
                if(body_owner(other)||b3Body_GetPosition(other).y<=0)continue;
                float force=0;for(int m=0;m<data[k].manifoldCount;m++)for(int n=0;n<data[k].manifolds[m].pointCount;n++)force+=480*data[k].manifolds[m].points[n].normalImpulse;
                contacts+=force>.01f;
            }free(data);
        }
    }
    printf("QUARRY: %d survived, %d contacts, up %.5f, peak %.3f, furthest z %.3f\n",world.count,contacts,low,peak,furthest);
    assert(world.count==1&&world.deaths==0&&contacts==0&&low>.9f&&peak>12&&furthest>62);
    world_close();
}
static void check_courier(JSContext *ctx){
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        if(name&&!strncmp(name,"Postbird /",10))JS_SetPropertyUint32(ctx,selected,0,JS_DupValue(ctx,item));
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==1);
    int carrier=world.creatures[0].id;Vector3 home=world.creatures[0].physics.start;
    int first=world_drop_cargo(home.x,NAN,home.z,MATERIAL_ALLOY),second=0;
    for(int i=0;i<180*60;i++){
        if(i==60*60){world_save(ctx);world_close();world_load(ctx);}
        if(i==90*60)second=world_drop_cargo(home.x,NAN,home.z,MATERIAL_ALLOY);
        world_step();
    }
    assert(world.count==3&&world.deaths==0&&world.delivery_count==2&&world_cargo_score(carrier)==2);
    Creature *a=world_find(first),*b=world_find(second);assert(a->delivered&&b->delivered&&!a->held_by&&!b->held_by);
    b3Pos pa=b3Body_GetPosition(a->physics.parts[0].body),pb=b3Body_GetPosition(b->physics.parts[0].body);
    assert(pb.y-pa.y>.8f&&hypotf(pa.x-pb.x,pa.z-pb.z)<.9f);
    printf("COURIER: two physical deliveries, stacked height difference %.3f m, score %d after controller restart\n",pb.y-pa.y,world_cargo_score(carrier));
    world_save(ctx);world_close();world_load(ctx);ticks(120);assert(world.delivery_count==2&&world_cargo_score(carrier)==2);world_close();
}
static void check_gantry(JSContext *ctx){
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        if(name&&!strncmp(name,"Northline /",11)){
            JS_SetPropertyUint32(ctx,selected,0,JS_DupValue(ctx,item));JS_SetPropertyUint32(ctx,selected,1,JS_GetPropertyUint32(ctx,catalog,i+1));
        }
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==2);
    int id=world.creatures[0].id,previous=-1,releases=0,airborne=0,supported=0;double last=0;
    for(int tick=0;tick<600*60;tick++){
        if(tick==311*60){world_save(ctx);world_close();world_load(ctx);}
        world_step();assert(world.count==2&&world.deaths==0);Creature *c=world_find(id);
        int phase=get_number(c->controller->ctx,c->controller->memory,"p",-1);
        if(phase==4&&previous==3){releases++;last=world.age;}
        if(tick%6==0){
            JSValue sensors=physics_sensors(ctx,&c->physics,&c->design,.1),state=JS_GetPropertyStr(ctx,sensors,"magnets"),head=JS_GetPropertyUint32(ctx,state,22);
            double force=get_number(ctx,head,"targetSupportForce",-1);assert(isfinite(force)&&force>=0);
            if(phase==2&&b3Body_IsValid(c->physics.parts[22].magnet_target)&&force==0)airborne++;
            if(phase==3&&force>1)supported++;
            JS_FreeValue(ctx,head);JS_FreeValue(ctx,state);JS_FreeValue(ctx,sensors);
        }
        previous=phase;
    }
    printf("GANTRY: %d set-downs, %d airborne / %d supported samples, last release %.3f seconds before end, across restart\n",releases,airborne,supported,world.age-last);
    assert(releases>15&&airborne>100&&supported>40&&world.age-last<40);world_close();
}
static void check_harbor_tug(JSContext *ctx){
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        if(name&&!strncmp(name,"Harbor Atlas /",14))JS_SetPropertyUint32(ctx,selected,0,JS_DupValue(ctx,item));
        if(name&&!strncmp(name,"Tsubame /",9))JS_SetPropertyUint32(ctx,selected,1,JS_DupValue(ctx,item));
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==2);
    int crane=world.creatures[0].id,tug=world.creatures[1].id,cargo=world_drop_cargo(121,-1,53,MATERIAL_HULL),towed=0,lifted=0;
    for(int tick=0;tick<140*60&&!world.delivery_count;tick++){
        if(tick==30*60){assert(world_find(cargo)->held_by==tug);world_save(ctx);world_close();world_load(ctx);assert(world_find(cargo)->held_by==tug);}
        world_step();assert(world.count==3&&world.deaths==0);Creature *box=world_find(cargo);
        if(box->held_by==tug)towed=1;if(box->held_by==crane){assert(towed);lifted=1;}
    }
    assert(towed&&lifted&&world.delivery_count==1&&world_find(cargo)->delivered&&world_cargo_score(crane)==1);
    assert(world.deliveries[0].cargo==cargo&&world.deliveries[0].depot==1);
    printf("HARBOR: tug carried cargo across restart, crane accepted and delivered it at %.3f s\n",world.age);world_close();
}
static void check_lookout_cargo(JSContext *ctx){
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        if(name&&!strncmp(name,"Komame /",8)){put_number(ctx,item,"x",0);put_number(ctx,item,"z",20);JS_SetPropertyUint32(ctx,selected,0,JS_DupValue(ctx,item));}
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==1);
    int id=world.creatures[0].id;Controller *c=world.creatures[0].controller;
    const char *memory="{\"home\":[0,20],\"goal\":[0,44],\"arrivals\":0,\"visits\":0,\"choices\":0,\"wait\":0,\"stuck\":0,\"back\":0,\"next\":1000,\"tracked\":0,\"yielded\":0}";
    JS_FreeValue(c->ctx,c->memory);c->memory=JS_ParseJSON(c->ctx,memory,strlen(memory),"memory");
    for(int i=-1;i<=1;i++)world_drop_cargo(i,0.485f,34,MATERIAL_ALLOY);
    float upright=1,farthest=20;int collisions=0;
    for(int tick=0;tick<35*60;tick++){
        world_step();Creature *scout=world_find(id);if(!scout)break;
        b3Quat q=b3Body_GetRotation(scout->physics.parts[0].body);upright=fminf(upright,b3RotateVector(q,b3Vec3_axisY).y);
        farthest=fmaxf(farthest,b3Body_GetPosition(scout->physics.parts[0].body).z);
        for(int part=0;part<scout->design.count;part++){
            b3BodyId body=scout->physics.parts[part].body;int capacity=b3Body_GetContactCapacity(body);if(!capacity)continue;
            b3ContactData *data=array_resize(NULL,capacity,sizeof(*data));int count=b3Body_GetContactData(body,data,capacity);
            for(int k=0;k<count;k++){b3BodyId a=b3Shape_GetBody(data[k].shapeIdA),b=b3Shape_GetBody(data[k].shapeIdB);Creature *other=body_owner(B3_ID_EQUALS(a,body)?b:a);if(other&&other->cargo)collisions++;}free(data);
        }
    }
    printf("LOOKOUT: cargo contacts %d, minimum up %.5f, farthest z %.3f, objects %d\n",collisions,upright,farthest,world.count);fflush(stdout);
    assert(world.count==4&&world.deaths==0&&collisions==0&&upright>.95f&&farthest>40);world_close();
}
static void check_dock_courier(JSContext *ctx){
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        if(name&&!strncmp(name,"Brinehook /",11)){JS_SetPropertyUint32(ctx,selected,0,JS_DupValue(ctx,item));JS_SetPropertyUint32(ctx,selected,1,JS_GetPropertyUint32(ctx,catalog,i+1));}
        if(name&&!strncmp(name,"Kawasemi /",10))JS_SetPropertyUint32(ctx,selected,2,JS_DupValue(ctx,item));
        if(name&&!strcmp(name,"Cargo")&&fabs(get_number(ctx,item,"x",0)-209.6)<.01)JS_SetPropertyUint32(ctx,selected,3,JS_DupValue(ctx,item));
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==4);
    int crane=world.creatures[0].id,courier=world.creatures[2].id,cargo[]={world.creatures[1].id,world.creatures[3].id},stages[2]={0};float upright=1;
    for(int tick=0;tick<300*60&&world.delivery_count<2;tick++){
        if(tick&&tick%(67*60)==0){world_save(ctx);world_close();world_load(ctx);}
        world_step();assert(world.count==4&&world.deaths==0);Creature *gantry=world_find(crane),*aircraft=world_find(courier);
        b3Quat q=b3Body_GetRotation(aircraft->physics.parts[0].body);upright=fminf(upright,b3RotateVector(q,b3Vec3_axisY).y);
        for(int i=0;i<2;i++){
            Creature *box=world_find(cargo[i]);int lifting=magnet_holds(gantry,box),flying=magnet_holds(aircraft,box);assert(!lifting||!flying);
            if(lifting)stages[i]|=1;
            if(box->held_by==crane&&!lifting)stages[i]|=2;
            if(flying){assert((stages[i]&3)==3);stages[i]|=4;}
        }
    }
    assert(world.delivery_count==2&&world_cargo_score(courier)==2&&upright>.95f);
    for(int i=0;i<2;i++)assert(stages[i]==7&&world_find(cargo[i])->delivered);
    printf("DOCK: two gantry / tray / courier / depot deliveries across reloads, minimum up %.5f, completed %.3f s\n",upright,world.age);world_close();
}
int main(void){
    JSRuntime *rt=JS_NewRuntime();JSContext *ctx=JS_NewContext(rt);Character car={0};character_car(&car);
    Creature *driver=spawn(&car,"function(){return ''}","Your character",1,60,0,12);int id=driver->id;world.player=id;
    int cargo=world_drop_cargo(0,NAN,16.5f,MATERIAL_ALLOY),unearned=world_drop_cargo(2,NAN,34,MATERIAL_ALLOY);
    ticks(90);assert(world.delivery_count==0&&!world_find(unearned)->carrier);
    magnet(id,1);motor(id,1);
    int steps=0;while(cargo_z(cargo)<30&&steps++<1200)world_step();motor(id,0);ticks(120);
    printf("DELIVERY APPROACH: steps %d, cargo z %.3f, carrier %d, grip %d\n",steps,cargo_z(cargo),world_find(cargo)->carrier,b3Body_IsValid(world_find(id)->physics.parts[8].magnet_target));
    assert(steps<1200&&world_find(cargo)->carrier==-1&&world.delivery_count==0&&b3Body_IsValid(world_find(id)->physics.parts[8].magnet_target));
    world_save(ctx);world_close();world_load(ctx);
    assert(world.player==id&&world_find(cargo)->carrier==-1&&world.delivery_count==0&&b3Body_IsValid(world_find(id)->physics.parts[8].magnet_target));
    for(int i=0;i<world.design_count;i++)assert(strcmp(world.designs[i].name,"Your character"));
    JSValue sensors=physics_sensors(ctx,&world_find(id)->physics,&car,1./60),nearby=JS_GetPropertyStr(ctx,sensors,"nearby"),sample=JS_GetPropertyUint32(ctx,nearby,0),ground=JS_GetPropertyStr(ctx,sensors,"groundSamples");
    assert(get_number(ctx,sensors,"id",0)==id&&get_number(ctx,ground,"length",0)==16&&get_number(ctx,sample,"id",0)==cargo&&get_number(ctx,sample,"carriedBy",0)==id&&get_number(ctx,sample,"magnetHeld",0)==1);
    JSValue magnets=JS_GetPropertyStr(ctx,sensors,"magnets"),head=JS_GetPropertyUint32(ctx,magnets,8);
    assert(fabs(get_number(ctx,head,"targetMass",0)-b3Body_GetMass(world_find(cargo)->physics.parts[0].body))<1e-6);JS_FreeValue(ctx,head);JS_FreeValue(ctx,magnets);
    double sensed=get_number(ctx,sample,"z",0);assert(fabs(sensed-cargo_z(cargo))<.001);
    JS_FreeValue(ctx,ground);JS_FreeValue(ctx,sample);JS_FreeValue(ctx,nearby);JS_FreeValue(ctx,sensors);
    motor(id,.65f);steps=0;while(cargo_z(cargo)<33.7f&&steps++<600)world_step();motor(id,0);ticks(120);
    assert(steps<600&&world.delivery_count==0);magnet(id,0);ticks(180);
    printf("DELIVERY RELEASE: cargo %.3f, settled %.3f, delivered %d, score %d\n",cargo_z(cargo),world_find(cargo)->settled,world_find(cargo)->delivered,world_cargo_score(-1));
    assert(world.delivery_count==1&&world_find(cargo)->delivered&&world_cargo_score(id)==1&&world_cargo_score(-1)==1);
    Delivery first=world.deliveries[0];assert(first.cargo==cargo&&first.carrier==-1&&first.depot==0&&!strcmp(first.name,"You"));
    magnet(id,1);ticks(60);assert(world_find(cargo)->held_by==id);magnet(id,0);ticks(180);assert(world.delivery_count==1);
    world_save(ctx);world_close();world_load(ctx);assert(world.delivery_count==1&&world_find(cargo)->delivered&&world_cargo_score(-1)==1);
    assert(!memcmp(&first,&world.deliveries[0],sizeof(first)));assert(!world_find(unearned)->delivered);ticks(120);assert(world.delivery_count==1);
    int next=world_enter(&car,0);assert(next!=id&&world_cargo_score(next)==1&&world.delivery_count==1);
    world_save(ctx);puts("DELIVERY: physical pickup, loaded restart, transport, release, one-time score and persistent player attribution passed");
    world_close();
    character_remove(&car,7);character_remove(&car,7);assert(car.count==7);
    driver=spawn(&car,"function(){return ''}","Deck carrier",1,60,0,12);id=driver->id;world.player=id;ticks(60);
    b3Pos p=b3Body_GetPosition(world_find(id)->physics.parts[0].body);cargo=world_drop_cargo(p.x,p.y+1,p.z,MATERIAL_ALLOY);ticks(90);
    assert(world_find(cargo)->carrier==-1);float start=cargo_z(cargo);motor(id,.5f);ticks(300);motor(id,0);ticks(60);
    printf("DECK CARGO: transported %.3f m, carrier %d\n",cargo_z(cargo)-start,world_find(cargo)->carrier);
    assert(cargo_z(cargo)>start+4&&world_find(cargo)->carrier==-1&&world.delivery_count==0);
    assert(world_find(cargo)->held_by==id);world_save(ctx);world_close();world_load(ctx);
    assert(world_find(cargo)->held_by==id&&world_find(cargo)->carrier==-1);ticks(30);assert(world_find(cargo)->held_by==id);
    sensors=physics_sensors(ctx,&world_find(id)->physics,&car,1./60);nearby=JS_GetPropertyStr(ctx,sensors,"nearby");sample=JS_GetPropertyUint32(ctx,nearby,0);
    assert(get_number(ctx,sample,"id",0)==cargo&&get_number(ctx,sample,"carriedBy",0)==id&&get_number(ctx,sample,"magnetHeld",-1)==0);
    JS_FreeValue(ctx,sample);JS_FreeValue(ctx,nearby);JS_FreeValue(ctx,sensors);
    world_close();character_clear(&car);check_pier_water(ctx);check_resume(ctx);check_courier(ctx);check_air_traffic(ctx);check_air_clearance(ctx);check_walker_recovery(ctx);check_gantry(ctx);check_harbor_tug(ctx);check_dock_courier(ctx);check_lookout_cargo(ctx);JS_FreeContext(ctx);JS_FreeRuntime(rt);return 0;
}
