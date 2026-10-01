#include "world.c"
#include <assert.h>

typedef struct { b3Pos center; float low, support; } Sole;
typedef struct { b3Pos start, stance; bool active, supported; float airborne, advance, slip, bad, stable; } Stride;

static Sole sole(Creature *c, int leg, const ContactForces *forces) {
    Sole result = {.low = INFINITY};
    int first = leg ? 23 : 10;
    for (int i = first; i < first + 6; i++) {
        b3WorldTransform pose = physics_transform(&c->physics.parts[i]);
        Vector3 half = block_half(c->design.blocks[i]);
        result.center.x += pose.p.x / 6; result.center.y += pose.p.y / 6; result.center.z += pose.p.z / 6;
        result.support += forces[i].support;
        for (int corner = 0; corner < 8; corner++) {
            b3Vec3 local = {(corner & 1 ? 1 : -1) * half.x, (corner & 2 ? 1 : -1) * half.y, (corner & 4 ? 1 : -1) * half.z};
            b3Pos p = b3TransformWorldPoint(pose, local);
            result.low = fminf(result.low, p.y - terrain_floor((Vector3){p.x, p.y, p.z}));
        }
    }
    return result;
}

static void walk(Data *ctx, Value catalog, int index) {
    Value item = value_at(ctx, catalog, index), blocks = value_get(ctx, item, "blueprint"), code = value_get(ctx, item, "source");
    Character design = {0}; assert(read_character(ctx, blocks, &design));
    const char *source = value_text(ctx, code);
    float x = get_number(ctx, item, "x", 0), z = get_number(ctx, item, "z", 0);
    terrain_select(8);
    Creature *c = spawn(&design, source, "Biped physical regression", index + 1, 20, x, z); assert(c);
    set_spawn_height(c, 7.65);
    character_clear(&design); value_text_free(ctx, source); value_free(ctx, code); value_free(ctx, blocks); value_free(ctx, item);

    Stride strides[2] = {0}; Sole previous[2] = {0};
    int steps[2] = {0}, alternations = 0, last_leg = -1;
    float last_support[2] = {-10, -10}, low_z = z, high_z = z, minimum_up = 1;
    double previous_time = 0;
    for (int tick = 0; tick < 180 * 60; tick++) {
        world_step(); assert(!world.deaths && !c->error[0]);
        if (tick % 3 != 2) continue;
        b3WorldTransform pose = physics_transform(&c->physics.parts[0]);
        float up = b3RotateVector(pose.q, b3Vec3_axisY).y;
        minimum_up = fminf(minimum_up, up); low_z = fminf(low_z, pose.p.z); high_z = fmaxf(high_z, pose.p.z);
        ContactForces *forces = part_contacts(&c->physics);
        Sole feet[2] = {sole(c, 0, forces), sole(c, 1, forces)}; free(forces);
        float dt = world.age - previous_time, weight = creature_mass(c) * b3Length(b3World_GetGravity(world.physics));
        previous_time = world.age;
        bool supported[2];
        for (int leg = 0; leg < 2; leg++) {
            if (feet[leg].support > weight * .1f) last_support[leg] = world.age;
            supported[leg] = feet[leg].low < .08f && world.age - last_support[leg] < .15f;
        }
        bool settled = up > .985f && supported[0] && supported[1];
        for (int leg = 0; leg < 2; leg++) settled &= hypot(feet[leg].center.x - previous[leg].center.x, feet[leg].center.z - previous[leg].center.z) / dt < .15f;
        for (int leg = 0; leg < 2; leg++) {
            Stride *s = &strides[leg];
            if (!s->active && supported[leg]) { s->start = feet[leg].center; s->stance = feet[1-leg].center; s->supported = true; }
            if (!s->active && s->supported && feet[leg].low > .12f && supported[1-leg]) s->active = true;
            if (!s->active) continue;
            if (feet[leg].low > .08f) {
                s->airborne += dt; s->advance = fmaxf(s->advance, fabs(feet[leg].center.z - s->start.z));
                if (!supported[1-leg] || up < .97f) s->bad += dt;
            }
            s->slip = fmaxf(s->slip, hypot(feet[1-leg].center.x - s->stance.x, feet[1-leg].center.z - s->stance.z));
            s->stable = settled ? s->stable + dt : 0;
            if (s->stable <= .5f) continue;
            if (s->airborne > .1f && s->advance > .25f && fabs(feet[leg].center.z - s->start.z) > .25f && s->slip < .25f && s->bad < .2f) {
                steps[leg]++; if (last_leg >= 0 && last_leg != leg) alternations++; last_leg = leg;
            }
            *s = (Stride){0};
        }
        previous[0] = feet[0]; previous[1] = feet[1];
    }
    printf("Biped %d: supported steps %d/%d, alternations %d, range %.3fm, minimum up %.6f\n", index + 1, steps[0], steps[1], alternations, high_z - low_z, minimum_up);
    assert(steps[0] >= 3 && steps[1] >= 3 && alternations >= 5 && high_z - low_z > 4 && minimum_up > .95f);
    world_close();
}

int main(void) {
    Data *ctx = data_new(256 * 1024 * 1024); assert(ctx);
    Value catalog = read_catalog(ctx);
    walk(ctx, catalog, 0); walk(ctx, catalog, 38);
    value_free(ctx, catalog); data_close(ctx);
    return 0;
}
