/*
 * stack-wrap IN -o OUT: makes a Dolly executable record stack@0 and continue
 * deep recursion on fresh browser stacks (dolly-stack-0.wat).
 *
 * Each function that makes calls begins by charging an estimate of its frame
 * against dolly_stack_room and restores the room when it returns: its body is
 * wrapped in a block, so a branch to the function's end passes the restore,
 * and each return restores first. Where an exception lands in it, its frame is
 * charged again: the frames the exception unwound gave none of theirs back. A
 * function that finds too little room stashes its arguments and itself in
 * globals and a table of its own and calls DOLLY_STACK_CONTINUE: the provider
 * runs dolly_stack_continue on a fresh stack, which unpacks the stash and calls
 * the function again. A function that makes no calls is left as it is: every
 * check keeps room for the largest of them.
 */
#include <errno.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <dolly/stack-abi.h>

/* A frame's slots of 8 bytes beyond its parameters and locals: Chrome 151 and
 * Firefox 155 measured 56 to 64 bytes of their own, and values a call keeps on
 * the operand stack take a slot each. host/stack/process.mjs measures stacks
 * in the same slots. */
#define FRAME_SLOTS 16u
/* A function that makes no calls but has a frame larger than this is charged
 * as if it did, so that no check needs to keep more room than this. */
#define LEAF_SLOTS 1024u
/* The room before the provider sets it: what a start function has. */
#define ROOM_AT_START 2048

static const uint8_t stack_digest[32] = { DOLLY_STACK_ABI_DIGEST };

static void fail(const char *format, ...) {
  va_list arguments;
  va_start(arguments, format);
  fputs("stack-wrap: ", stderr);
  vfprintf(stderr, format, arguments);
  fputc('\n', stderr);
  va_end(arguments);
  exit(1);
}

static void *allocate(size_t count, size_t size) {
  void *memory = calloc(count ? count : 1, size);
  if (!memory) fail("out of memory");
  return memory;
}

typedef struct { uint8_t *data; size_t size, capacity; } buffer;

static void put(buffer *out, const void *bytes, size_t size) {
  if (out->size + size > out->capacity) {
    size_t capacity = out->capacity ? out->capacity : 4096;
    while (capacity < out->size + size) capacity *= 2;
    if (!(out->data = realloc(out->data, capacity))) fail("out of memory");
    out->capacity = capacity;
  }
  if (size) memcpy(out->data + out->size, bytes, size);
  out->size += size;
}

static void byte(buffer *out, uint8_t value) { put(out, &value, 1); }

static void uleb(buffer *out, uint64_t value) {
  do {
    uint8_t next = value & 0x7f;
    value >>= 7;
    byte(out, next | (value ? 0x80 : 0));
  } while (value);
}

static void sleb(buffer *out, int64_t value) {
  for (;;) {
    uint8_t next = value & 0x7f;
    value >>= 7;
    if ((value == 0 && !(next & 0x40)) || (value == -1 && (next & 0x40))) { byte(out, next); return; }
    byte(out, next | 0x80);
  }
}

static void text(buffer *out, const char *string) { uleb(out, strlen(string)); put(out, string, strlen(string)); }

/* An instruction with one index. */
static void op(buffer *out, uint8_t code, uint64_t index) { byte(out, code); uleb(out, index); }
static void i32_const(buffer *out, int64_t value) { byte(out, 0x41); sleb(out, value); }

static void section(buffer *out, uint8_t id, buffer *payload) {
  byte(out, id);
  uleb(out, payload->size);
  put(out, payload->data, payload->size);
  free(payload->data);
  *payload = (buffer){ 0 };
}

typedef struct { const uint8_t *at, *end; } reader;

static size_t left(const reader *in) { return (size_t)(in->end - in->at); }

static uint64_t read_uleb(reader *in) {
  uint64_t value = 0;
  for (unsigned shift = 0; shift < 64; shift += 7) {
    if (in->at >= in->end) fail("truncated module");
    uint8_t next = *in->at++;
    value |= (uint64_t)(next & 0x7f) << shift;
    if (!(next & 0x80)) return value;
  }
  fail("malformed integer");
  return 0;
}

static uint32_t read_u32(reader *in) {
  uint64_t value = read_uleb(in);
  if (value > UINT32_MAX) fail("malformed count");
  return (uint32_t)value;
}

static uint8_t read_byte(reader *in) {
  if (in->at >= in->end) fail("truncated module");
  return *in->at++;
}

static reader read_bytes(reader *in, size_t size) {
  if (left(in) < size) fail("truncated module");
  reader part = { in->at, in->at + size };
  in->at += size;
  return part;
}

static reader read_name(reader *in) { return read_bytes(in, read_u32(in)); }

/* A signed integer of any width, skipped. */
static void skip_sleb(reader *in) { while (read_byte(in) & 0x80) continue; }

static int is(reader name, const char *string) {
  return left(&name) == strlen(string) && !memcmp(name.at, string, left(&name));
}

static void skip_limits(reader *in) {
  uint8_t flags = read_byte(in);
  if (flags > 7) fail("unsupported limits");
  read_uleb(in);
  if (flags & 1) read_uleb(in);
}

/* A value type: one byte, or a typed reference and its heap type. */
static void skip_value_type(reader *in) {
  uint8_t code = read_byte(in);
  if (code == 0x63 || code == 0x64) skip_sleb(in);
}

/* What a stash global can hold: numbers, vectors, funcref, externref, exnref. */
enum { I32, I64, F32, F64, V128, FUNCREF, EXTERNREF, EXNREF, KINDS, UNSTASHED = 0xff };
static const uint8_t kind_code[KINDS] = { 0x7f, 0x7e, 0x7d, 0x7c, 0x7b, 0x70, 0x6f, 0x69 };

static int kind_of(uint8_t code) {
  for (int kind = 0; kind < KINDS; ++kind) if (kind_code[kind] == code) return kind;
  return -1;
}

/* A type's values by kind; stashable is 0 when one has none. */
typedef struct { uint32_t params, results; uint8_t *kinds; int stashable; } signature;

/* The module, as read. */
static signature *types;
static uint32_t type_count, imported_functions, imported_tables, imported_globals, call = UINT32_MAX;
static uint32_t defined, defined_tables, defined_globals, *function_types;
/* What the tool adds: types of () -> () and of each body block of several
 * results, the room and pending globals, the stash, the table, the continue
 * function, and which functions are charged. */
static uint32_t added_types, *added_type_results, *result_block_type, empty_type;
static uint32_t room, pending, stash_first[KINDS], stash_count[KINDS], table, resume;
static int64_t *dispatch_of;
static uint32_t *dispatch_type, dispatches;
static uint8_t *charged;
static uint64_t *frame, leaf_slots;

static void read_types(reader in) {
  type_count = read_u32(&in);
  types = allocate(type_count, sizeof *types);
  for (uint32_t index = 0; index < type_count; ++index) {
    if (read_byte(&in) != 0x60) fail("type %u is not a plain function type", index);
    signature *type = &types[index];
    type->params = read_u32(&in);
    reader params = read_bytes(&in, type->params);
    type->results = read_u32(&in);
    reader results = read_bytes(&in, type->results);
    type->kinds = allocate(type->params + type->results, 1);
    memcpy(type->kinds, params.at, type->params);
    memcpy(type->kinds + type->params, results.at, type->results);
    type->stashable = 1;
    for (uint32_t value = 0; value < type->params + type->results; ++value) {
      int kind = kind_of(type->kinds[value]);
      type->stashable &= kind >= 0;
      type->kinds[value] = kind < 0 ? UNSTASHED : (uint8_t)kind;
    }
  }
}

static void read_imports(reader in) {
  for (uint32_t count = read_u32(&in); count; --count) {
    reader module = read_name(&in), field = read_name(&in);
    uint8_t kind = read_byte(&in);
    if (kind == 0) {
      if (read_u32(&in) >= type_count) fail("import of unknown type");
      if (is(module, "dolly_process_0") && is(field, "call")) call = imported_functions;
      ++imported_functions;
    } else if (kind == 1) {
      skip_value_type(&in);
      skip_limits(&in);
      ++imported_tables;
    } else if (kind == 2) {
      skip_limits(&in);
    } else if (kind == 3) {
      skip_value_type(&in);
      read_byte(&in);
      ++imported_globals;
    } else if (kind == 4) {
      read_byte(&in);
      read_u32(&in);
    } else {
      fail("unknown import kind %u", kind);
    }
  }
}

static void skip_block_type(reader *in) {
  uint8_t code = *in->at;
  if (code == 0x63 || code == 0x64) { read_byte(in); skip_sleb(in); }
  else if (code == 0x40 || (code >= 0x69 && code <= 0x7f)) read_byte(in);
  else skip_sleb(in);
}

static void skip_memory_argument(reader *in) {
  if (read_u32(in) & 0x40) read_u32(in);
  read_uleb(in);
}

/* One instruction: its opcode is returned, its immediates skipped. */
static uint32_t instruction(reader *in, uint32_t function) {
  uint8_t code = read_byte(in);
  switch (code) {
  case 0x02: case 0x03: case 0x04: case 0x06: skip_block_type(in); break;
  case 0x07: case 0x08: case 0x09: case 0x0c: case 0x0d: case 0x10: case 0x14: case 0x18:
  case 0x20: case 0x21: case 0x22: case 0x23: case 0x24: case 0x25: case 0x26:
  case 0xd2: case 0xd4: case 0xd6:
    read_u32(in);
    break;
  case 0x0e:
    for (uint32_t labels = read_u32(in); labels; --labels) read_u32(in);
    read_u32(in);
    break;
  case 0x11: read_u32(in); read_u32(in); break;
  case 0x12: case 0x13: case 0x15:
    fail("function %u makes a tail call, which would grow the stack under its check", function);
    break;
  case 0x1c:
    for (uint32_t values = read_u32(in); values; --values) skip_value_type(in);
    break;
  case 0x1f:
    skip_block_type(in);
    for (uint32_t catches = read_u32(in); catches; --catches) {
      if (read_byte(in) < 2) read_u32(in);
      read_u32(in);
    }
    break;
  case 0x3f: case 0x40: read_u32(in); break;
  case 0x41: case 0x42: skip_sleb(in); break;
  case 0x43: read_bytes(in, 4); break;
  case 0x44: read_bytes(in, 8); break;
  case 0xd0: skip_sleb(in); break;
  case 0xfb: fail("function %u uses garbage-collected types", function); break;
  case 0xfc: {
    uint32_t sub = read_u32(in);
    if (sub <= 7 || (sub >= 19 && sub <= 22)) break;
    if (sub == 8 || sub == 10 || sub == 12 || sub == 14) { read_u32(in); read_u32(in); break; }
    if (sub == 9 || sub == 11 || sub == 13 || (sub >= 15 && sub <= 17)) { read_u32(in); break; }
    fail("function %u uses unknown instruction 0xfc %u", function, sub);
    break;
  }
  case 0xfd: {
    uint32_t sub = read_u32(in);
    if (sub <= 11 || sub == 92 || sub == 93) skip_memory_argument(in);
    else if (sub == 12 || sub == 13) read_bytes(in, 16);
    else if (sub >= 21 && sub <= 34) read_byte(in);
    else if (sub >= 84 && sub <= 91) { skip_memory_argument(in); read_byte(in); }
    else if (sub > 0x113) fail("function %u uses unknown instruction 0xfd %u", function, sub);
    break;
  }
  case 0xfe: {
    uint32_t sub = read_u32(in);
    if (sub == 3) read_byte(in);
    else skip_memory_argument(in);
    break;
  }
  default:
    if (code >= 0x28 && code <= 0x3e) skip_memory_argument(in);
    else if (!(code <= 0x01 || code == 0x05 || code == 0x0a || code == 0x0b || code == 0x0f ||
               code == 0x19 || code == 0x1a || code == 0x1b || (code >= 0x45 && code <= 0xc4) ||
               code == 0xd1 || code == 0xd3 || code == 0xd5)) {
      fail("function %u uses unknown instruction 0x%02x", function, code);
    }
    break;
  }
  return code;
}

static uint64_t locals_slots(reader *body) {
  uint64_t slots = 0;
  for (uint32_t groups = read_u32(body); groups; --groups) {
    uint32_t locals = read_u32(body);
    uint8_t code = read_byte(body);
    if (code == 0x63 || code == 0x64) skip_sleb(body);
    slots += (uint64_t)locals * (code == 0x7b ? 2 : 1);
  }
  return slots;
}

/* Reads a body once: its frame's slots, and whether it calls. */
static void survey(uint32_t function, reader body) {
  const signature *type = &types[function_types[function]];
  uint64_t slots = FRAME_SLOTS + 1 + locals_slots(&body);
  for (uint32_t value = 0; value < type->params; ++value) slots += type->kinds[value] == V128 ? 2 : 1;
  frame[function] = slots > (1u << 24) ? 1u << 24 : slots;
  int calls = 0;
  while (body.at < body.end) {
    uint32_t code = instruction(&body, function);
    calls |= code == 0x10 || code == 0x11 || code == 0x14;
  }
  charged[function] = calls || frame[function] > LEAF_SLOTS;
  if (charged[function] && !type->stashable) {
    fail("function %u has a parameter or result of a type a global cannot hold", function);
  }
  if (!charged[function] && frame[function] > leaf_slots) leaf_slots = frame[function];
}

static void restore(buffer *out, uint32_t saved) { op(out, 0x20, saved); op(out, 0x24, room); }

/* The room while the function runs: set on entry and where an exception lands
 * in it, as LLVM sets __stack_pointer at a landing pad. */
static void charge(buffer *out, uint32_t saved, int64_t slots) {
  op(out, 0x20, saved); i32_const(out, slots); byte(out, 0x6b); op(out, 0x24, room);
}

/* The body's open blocks, one byte each; the first is the function's own. */
enum { LOOP = 1, LANDING = 2 };

/* A try_table's catches land after the blocks they name. */
static void mark_landings(buffer *blocks, reader catches, uint32_t function) {
  skip_block_type(&catches);
  for (uint32_t count = read_u32(&catches); count; --count) {
    if (read_byte(&catches) < 2) read_u32(&catches);
    uint32_t label = read_u32(&catches);
    if (label >= blocks->size) fail("function %u catches to no block", function);
    uint8_t *block = &blocks->data[blocks->size - 1 - label];
    if (*block & LOOP) fail("function %u catches into a loop", function);
    *block |= LANDING;
  }
}

static void instrument(buffer *code, uint32_t function, reader body) {
  const signature *type = &types[function_types[function]];
  buffer out = { 0 };
  if (!charged[function]) {
    uleb(code, left(&body));
    put(code, body.at, left(&body));
    return;
  }
  /* The locals, and one more for the room on entry. */
  reader locals = body;
  uint32_t groups = read_u32(&locals), saved = type->params;
  for (uint32_t group = 0; group < groups; ++group) {
    saved += read_u32(&locals);
    skip_value_type(&locals);
  }
  uleb(&out, (uint64_t)groups + 1);
  reader groups_bytes = body;
  read_u32(&groups_bytes);
  put(&out, groups_bytes.at, (size_t)(locals.at - groups_bytes.at));
  uleb(&out, 1); byte(&out, 0x7f);

  int64_t slots = (int64_t)frame[function], check = slots + (int64_t)leaf_slots;
  if (check > DOLLY_STACK_CHECK_SLOTS) check = DOLLY_STACK_CHECK_SLOTS;
  op(&out, 0x23, room); op(&out, 0x22, saved); i32_const(&out, check); byte(&out, 0x48);
  byte(&out, 0x04); byte(&out, 0x40);
  uint32_t used[KINDS] = { 0 };
  for (uint32_t value = 0; value < type->params; ++value) {
    op(&out, 0x20, value);
    op(&out, 0x24, stash_first[type->kinds[value]] + used[type->kinds[value]]++);
  }
  i32_const(&out, 0); op(&out, 0xd2, imported_functions + function); op(&out, 0x26, table);
  i32_const(&out, dispatch_of[function_types[function]]); op(&out, 0x24, pending);
  i32_const(&out, DOLLY_STACK_CONTINUE);
  for (int argument = 0; argument < 4; ++argument) { byte(&out, 0x42); sleb(&out, 0); }
  op(&out, 0x10, call);
  /* Anything but 0: stack@0 is not served, and the call cannot be made. */
  byte(&out, 0x50); byte(&out, 0x45); byte(&out, 0x04); byte(&out, 0x40); byte(&out, 0x00); byte(&out, 0x0b);
  memset(used, 0, sizeof used);
  for (uint32_t value = type->params; value < type->params + type->results; ++value) {
    op(&out, 0x23, stash_first[type->kinds[value]] + used[type->kinds[value]]++);
  }
  byte(&out, 0x0f);
  byte(&out, 0x0b);
  charge(&out, saved, slots);

  /* The body in a block of the function's results; the body's own end closes it. */
  byte(&out, 0x02);
  if (type->results == 0) byte(&out, 0x40);
  else if (type->results == 1) byte(&out, kind_code[type->kinds[type->params]]);
  else sleb(&out, result_block_type[function_types[function]]);
  buffer blocks = { 0 };
  byte(&blocks, 0);
  while (locals.at < locals.end) {
    const uint8_t *start = locals.at;
    uint32_t next = instruction(&locals, function);
    if (next == 0x0f) restore(&out, saved);
    put(&out, start, (size_t)(locals.at - start));
    if (next == 0x1f) mark_landings(&blocks, (reader){ start + 1, locals.at }, function);
    if (next == 0x02 || next == 0x03 || next == 0x04 || next == 0x06 || next == 0x1f) byte(&blocks, next == 0x03 ? LOOP : 0);
    /* A legacy handler begins at its catch; a try_table's after the block its catch names. */
    if (next == 0x07 || next == 0x19) charge(&out, saved, slots);
    if ((next == 0x0b || next == 0x18) && blocks.size && --blocks.size && blocks.data[blocks.size] & LANDING) charge(&out, saved, slots);
  }
  free(blocks.data);
  restore(&out, saved);
  byte(&out, 0x0b);
  uleb(code, out.size);
  put(code, out.data, out.size);
  free(out.data);
}

/* dolly_stack_continue: the pending signature selects how the stash is
 * unpacked for the call, through the table, of the function that stashed it. */
static void continuation(buffer *code) {
  buffer out = { 0 };
  uleb(&out, 0);
  for (uint32_t block = 0; block <= dispatches; ++block) { byte(&out, 0x02); byte(&out, 0x40); }
  op(&out, 0x23, pending);
  op(&out, 0x0e, dispatches);
  for (uint32_t label = 0; label <= dispatches; ++label) uleb(&out, label);
  for (uint32_t index = 0; index < dispatches; ++index) {
    byte(&out, 0x0b);
    const signature *type = &types[dispatch_type[index]];
    uint32_t used[KINDS] = { 0 };
    for (uint32_t value = 0; value < type->params; ++value) {
      op(&out, 0x23, stash_first[type->kinds[value]] + used[type->kinds[value]]++);
    }
    i32_const(&out, 0);
    op(&out, 0x11, dispatch_type[index]); uleb(&out, table);
    memset(used, 0, sizeof used);
    for (uint32_t value = type->params; value < type->params + type->results; ++value) used[type->kinds[value]]++;
    for (uint32_t value = type->params + type->results; value-- > type->params;) {
      op(&out, 0x24, stash_first[type->kinds[value]] + --used[type->kinds[value]]);
    }
    byte(&out, 0x0f);
  }
  byte(&out, 0x0b);
  byte(&out, 0x00);
  byte(&out, 0x0b);
  uleb(code, out.size);
  put(code, out.data, out.size);
  free(out.data);
}

/* A vector section: the original entries, then the added ones. */
static void vector(buffer *out, const reader *original, uint64_t added) {
  reader in = original ? *original : (reader){ 0 };
  uint32_t count = original ? read_u32(&in) : 0;
  uleb(out, count + added);
  put(out, in.at, left(&in));
}

static void zero(buffer *out, int kind) {
  static const uint8_t f32[] = { 0x43, 0, 0, 0, 0 }, f64[] = { 0x44, 0, 0, 0, 0, 0, 0, 0, 0 };
  static const uint8_t v128[18] = { 0xfd, 0x0c };
  switch (kind) {
  case I32: i32_const(out, 0); break;
  case I64: byte(out, 0x42); byte(out, 0); break;
  case F32: put(out, f32, sizeof f32); break;
  case F64: put(out, f64, sizeof f64); break;
  case V128: put(out, v128, sizeof v128); break;
  default: byte(out, 0xd0); byte(out, kind_code[kind]); break;
  }
}

/* Section id rewritten; original is NULL where the module has none. */
static void rewrite(buffer *out, uint8_t id, const reader *original, const char *path) {
  buffer payload = { 0 };
  reader in = original ? *original : (reader){ 0 };
  switch (id) {
  case 1: /* () -> (), when the module has none, and () -> (results) for blocks of several. */
    vector(&payload, original, added_types);
    for (uint32_t added = 0; added < added_types; ++added) {
      const signature *type = added_type_results[added] == UINT32_MAX ? NULL : &types[added_type_results[added]];
      byte(&payload, 0x60); byte(&payload, 0); uleb(&payload, type ? type->results : 0);
      for (uint32_t value = 0; type && value < type->results; ++value) byte(&payload, kind_code[type->kinds[type->params + value]]);
    }
    break;
  case 3:
    vector(&payload, original, 1);
    uleb(&payload, empty_type);
    break;
  case 4: /* The table that holds the stashed function. */
    vector(&payload, original, 1);
    byte(&payload, 0x70); byte(&payload, 1); uleb(&payload, 1); uleb(&payload, 1);
    break;
  case 6: { /* The room, the pending signature, the stash. */
    uint64_t added = 2;
    for (int kind = 0; kind < KINDS; ++kind) added += stash_count[kind];
    vector(&payload, original, added);
    byte(&payload, 0x7f); byte(&payload, 1); i32_const(&payload, ROOM_AT_START); byte(&payload, 0x0b);
    byte(&payload, 0x7f); byte(&payload, 1); i32_const(&payload, 0); byte(&payload, 0x0b);
    for (int kind = 0; kind < KINDS; ++kind) {
      for (uint32_t global = 0; global < stash_count[kind]; ++global) {
        byte(&payload, kind_code[kind]); byte(&payload, 1); zero(&payload, kind); byte(&payload, 0x0b);
      }
    }
    break;
  }
  case 7: { /* The provider's two entries. */
    reader check = in;
    for (uint32_t count = original ? read_u32(&check) : 0; count; --count) {
      if (is(read_name(&check), "dolly_stack_continue")) fail("%s already records stack@0", path);
      read_byte(&check);
      read_u32(&check);
    }
    vector(&payload, original, 2);
    text(&payload, "dolly_stack_continue"); byte(&payload, 0); uleb(&payload, resume);
    text(&payload, "dolly_stack_room"); byte(&payload, 3); uleb(&payload, room);
    break;
  }
  case 9: { /* A declarative segment, so that a function may take ref.func of itself. */
    uint32_t count = 0;
    for (uint32_t function = 0; function < defined; ++function) count += charged[function];
    vector(&payload, original, 1);
    byte(&payload, 3); byte(&payload, 0); uleb(&payload, count);
    for (uint32_t function = 0; function < defined; ++function) {
      if (charged[function]) uleb(&payload, imported_functions + function);
    }
    break;
  }
  case 10: /* The charged functions instrumented, then dolly_stack_continue. */
    if (read_u32(&in) != defined) fail("function and code sections disagree");
    uleb(&payload, (uint64_t)defined + 1);
    for (uint32_t function = 0; function < defined; ++function) instrument(&payload, function, read_name(&in));
    continuation(&payload);
    break;
  default:
    put(&payload, in.at, left(&in));
    break;
  }
  section(out, id, &payload);
}

/* The names section names dolly_stack_continue; label names, whose numbering
 * the added blocks shift, are left out. */
static void rename_functions(buffer *payload, reader names) {
  while (names.at < names.end) {
    uint8_t id = read_byte(&names);
    reader sub = read_name(&names);
    if (id == 3) continue;
    buffer rewritten = { 0 };
    if (id == 1) {
      uleb(&rewritten, (uint64_t)read_u32(&sub) + 1);
      put(&rewritten, sub.at, left(&sub));
      uleb(&rewritten, resume);
      text(&rewritten, "dolly_stack_continue");
    } else {
      put(&rewritten, sub.at, left(&sub));
    }
    byte(payload, id);
    uleb(payload, rewritten.size);
    put(payload, rewritten.data, rewritten.size);
    free(rewritten.data);
  }
}

static uint8_t *read_file(const char *path, size_t *size) {
  FILE *file = fopen(path, "rb");
  if (!file) fail("%s: %s", path, strerror(errno));
  buffer contents = { 0 };
  uint8_t chunk[65536];
  for (size_t got; (got = fread(chunk, 1, sizeof chunk, file)) > 0;) put(&contents, chunk, got);
  if (ferror(file)) fail("%s: %s", path, strerror(errno));
  fclose(file);
  *size = contents.size;
  return contents.data;
}

/* Sections in the order a module keeps them. */
static const uint8_t order[] = { 1, 2, 3, 4, 5, 13, 6, 7, 8, 9, 12, 10, 11 };

static int rank(uint8_t id) {
  for (int index = 0; index < (int)sizeof order; ++index) if (order[index] == id) return index;
  fail("unknown section %u", id);
  return 0;
}

typedef struct { uint8_t id; reader name, payload; } part;

int main(int argc, char **argv) {
  if (argc != 4 || strcmp(argv[2], "-o") != 0) {
    fputs("usage: stack-wrap IN -o OUT\n", stderr);
    return 2;
  }
  const char *path = argv[1];
  size_t size;
  uint8_t *bytes = read_file(path, &size);
  static const uint8_t header[8] = { 0, 'a', 's', 'm', 1, 0, 0, 0 };
  if (size < 8 || memcmp(bytes, header, 8) != 0) fail("%s is not a WebAssembly module", path);

  reader module = { bytes + 8, bytes + size };
  part *parts = NULL, *found[14] = { 0 };
  size_t count = 0;
  while (module.at < module.end) {
    if (!(parts = realloc(parts, (count + 1) * sizeof *parts))) fail("out of memory");
    part *next = &parts[count++];
    next->id = read_byte(&module);
    next->payload = read_name(&module);
    if (next->id == 0) {
      next->name = read_name(&next->payload);
      if (is(next->name, "linking") || is(next->name, "dylink.0") ||
          (left(&next->name) > 6 && !memcmp(next->name.at, "reloc.", 6))) {
        fail("%s is not a linked executable", path);
      }
      if ((left(&next->name) > 7 && !memcmp(next->name.at, ".debug_", 7)) ||
          is(next->name, "sourceMappingURL") || is(next->name, "external_debug_info")) {
        fail("its debug information would point at the wrong code; link %s without it", path);
      }
      continue;
    }
    if (next->id > 13) fail("unknown section %u", next->id);
    if (found[next->id]) fail("duplicate section %u", next->id);
    found[next->id] = next;
  }
  if (!found[10]) fail("%s has no code", path);

  if (found[1]) read_types(found[1]->payload);
  if (found[2]) read_imports(found[2]->payload);
  if (call == UINT32_MAX) fail("%s does not import dolly_process_0.call", path);
  if (found[3]) {
    reader in = found[3]->payload;
    defined = read_u32(&in);
    function_types = allocate(defined, sizeof *function_types);
    for (uint32_t function = 0; function < defined; ++function) {
      if ((function_types[function] = read_u32(&in)) >= type_count) fail("function of unknown type");
    }
  }
  if (found[4]) { reader in = found[4]->payload; defined_tables = read_u32(&in); }
  if (found[6]) { reader in = found[6]->payload; defined_globals = read_u32(&in); }

  frame = allocate(defined, sizeof *frame);
  charged = allocate(defined, 1);
  {
    reader in = found[10]->payload;
    if (read_u32(&in) != defined) fail("function and code sections disagree");
    for (uint32_t function = 0; function < defined; ++function) survey(function, read_name(&in));
  }

  /* Types: () -> () and the result types of bodies of several results. */
  empty_type = UINT32_MAX;
  for (uint32_t index = 0; index < type_count; ++index) {
    if (!types[index].params && !types[index].results) { empty_type = index; break; }
  }
  added_type_results = allocate((size_t)type_count + 1, sizeof *added_type_results);
  if (empty_type == UINT32_MAX) {
    added_type_results[added_types] = UINT32_MAX;
    empty_type = type_count + added_types++;
  }
  result_block_type = allocate(type_count, sizeof *result_block_type);
  for (uint32_t index = 0; index < type_count; ++index) result_block_type[index] = UINT32_MAX;
  for (uint32_t function = 0; function < defined; ++function) {
    const signature *type = &types[function_types[function]];
    uint32_t *block = &result_block_type[function_types[function]];
    if (!charged[function] || type->results < 2 || *block != UINT32_MAX) continue;
    for (uint32_t index = 0; index < type_count && *block == UINT32_MAX; ++index) {
      if (!types[index].params && types[index].results == type->results &&
          !memcmp(types[index].kinds, type->kinds + type->params, type->results)) *block = index;
    }
    if (*block == UINT32_MAX) {
      added_type_results[added_types] = function_types[function];
      *block = type_count + added_types++;
    }
  }

  /* The stash: per value kind, as many globals as one signature needs. */
  dispatch_of = allocate(type_count, sizeof *dispatch_of);
  dispatch_type = allocate(type_count, sizeof *dispatch_type);
  for (uint32_t index = 0; index < type_count; ++index) dispatch_of[index] = -1;
  for (uint32_t function = 0; function < defined; ++function) {
    if (!charged[function]) continue;
    const signature *type = &types[function_types[function]];
    uint32_t used[2][KINDS] = { { 0 } };
    for (uint32_t value = 0; value < type->params + type->results; ++value) {
      uint32_t *seen = &used[value >= type->params][type->kinds[value]];
      if (++*seen > stash_count[type->kinds[value]]) stash_count[type->kinds[value]] = *seen;
    }
    if (dispatch_of[function_types[function]] < 0) {
      dispatch_of[function_types[function]] = dispatches;
      dispatch_type[dispatches++] = function_types[function];
    }
  }
  room = imported_globals + defined_globals;
  pending = room + 1;
  uint32_t global = room + 2;
  for (int kind = 0; kind < KINDS; ++kind) { stash_first[kind] = global; global += stash_count[kind]; }
  table = imported_tables + defined_tables;
  resume = imported_functions + defined;

  buffer out = { 0 };
  put(&out, header, 8);
  /* Sections the tool adds where the module has none go in their place in the order. */
  static const uint8_t added[] = { 1, 3, 4, 6, 7, 9 };
  int written = -1;
  for (size_t index = 0; index <= count; ++index) {
    const part *in = index < count ? &parts[index] : NULL;
    if (in && in->id == 0) {
      buffer payload = { 0 };
      uleb(&payload, left(&in->name));
      put(&payload, in->name.at, left(&in->name));
      if (is(in->name, "name")) rename_functions(&payload, in->payload);
      else put(&payload, in->payload.at, left(&in->payload));
      section(&out, 0, &payload);
      continue;
    }
    int next = in ? rank(in->id) : (int)sizeof order;
    for (size_t add = 0; add < sizeof added; ++add) {
      int at = rank(added[add]);
      if (!found[added[add]] && at > written && at < next) rewrite(&out, added[add], NULL, path);
    }
    if (!in) break;
    written = next;
    rewrite(&out, in->id, &in->payload, path);
  }

  /* The executable records stack@0 (abi/dolly-host-0.wat). */
  buffer record = { 0 };
  text(&record, "dolly.host");
  uint8_t entry[72] = { 's', 't', 'a', 'c', 'k' };
  memcpy(entry + 40, stack_digest, sizeof stack_digest);
  put(&record, entry, sizeof entry);
  section(&out, 0, &record);

  FILE *file = fopen(argv[3], "wb");
  if (!file || fwrite(out.data, 1, out.size, file) != out.size || fclose(file) != 0) {
    fail("%s: %s", argv[3], strerror(errno));
  }
  return 0;
}
