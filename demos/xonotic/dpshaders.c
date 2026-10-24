// SPDX-License-Identifier: GPL-2.0-or-later
// Writes DarkPlaces' one GLSL source as naga's GLSL front end reads it, for
// dpgpurast.c: per MODE:PERMUTATION a vertex and a fragment shader and the
// list of uniform slots they read.
//   dpshaders ENGINE OUTPUT MODE:PERMUTATION...
// Each stage is the engine's own prelude (gl_rmain.c's R_GLSL_CompilePermutation:
// GLSL140, the stage, the mode's and each permutation bit's #define, and
// USEEXACTSPECULARMATH, as Xonotic sets r_shadow_glossexact) over
// shader_glsl.h, run through cc -E. The preprocessed text is then rewritten
// line by line, mechanically:
// - a loose uniform becomes a macro over the draw's slots in one read-only
//   storage buffer of vec4s, indexed by the draw (the instance index, passed
//   to the fragment stage as a flat varying); a mat4 takes four slots. The
//   slots hold dpsoftrast.h's DPSOFTRAST_UNIFORM values, listed in M-P.uniforms;
//   uniforms and attributes that neither stage reads are dropped;
// - a sampler becomes a texture at binding 2u and a sampler at 2u+1 of group 1,
//   u being the GL20TU_ unit of its name, and a macro combining them;
// - attributes take locations 0 (position), 1 (colour), 2+n (texcoord n),
//   varyings the order in which the vertex stage declares them, dp_FragColor 0;
// - invariant and precision statements go, main becomes dp_main, and the new
//   vertex main maps OpenGL's clip depth (-w to w) onto WebGPU's (0 to w).
#define _GNU_SOURCE
#include <ctype.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>

extern char **environ;

static const char *const glsl[] = {
#include "shader_glsl.h"
	0
};

#define MAX_NAMES 512
typedef struct { int count; char *name[MAX_NAMES]; } names_t;

static void fail(const char *what, const char *detail)
{
	fprintf(stderr, "dpshaders: %s: %s\n", what, detail);
	exit(1);
}

static char *slurp(const char *path)
{
	FILE *f = fopen(path, "rb");
	if (!f) fail("cannot read", path);
	fseek(f, 0, SEEK_END);
	long n = ftell(f);
	fseek(f, 0, SEEK_SET);
	char *text = malloc(n + 1);
	if (fread(text, 1, n, f) != (size_t)n) fail("short read", path);
	text[n] = 0;
	fclose(f);
	return text;
}

static void add(names_t *list, const char *name, size_t length)
{
	if (list->count == MAX_NAMES) fail("too many names", name);
	list->name[list->count++] = strndup(name, length);
}

static int find(const names_t *list, const char *name)
{
	for (int i = 0; i < list->count; i++)
		if (!strcmp(list->name[i], name)) return i;
	return -1;
}

// Each identifier that follows PREFIX in TEXT, in order (optionally only on lines holding NEEDLE).
static void scan(names_t *list, const char *text, const char *prefix, const char *needle)
{
	for (const char *p = text; (p = strstr(p, prefix)); p += strlen(prefix)) {
		const char *line = p, *end = strchr(p, '\n');
		while (line > text && line[-1] != '\n') line--;
		if (needle && !(end ? memmem(line, end - line, needle, strlen(needle)) : strstr(line, needle))) continue;
		const char *name = p + strlen(prefix);
		size_t n = 0;
		while (isalnum((unsigned char)name[n]) || name[n] == '_') n++;
		add(list, name, n);
	}
}

static names_t modes, permutations, uniforms, units;
static int unit_number[MAX_NAMES];

static void load_tables(const char *engine)
{
	char path[4096];
	snprintf(path, sizeof(path), "%s/gl_rmain.c", engine);
	char *rmain = slurp(path);
	scan(&modes, rmain, "\"#define MODE_", "\"glsl\"");
	scan(&permutations, rmain, "{\"#define USE", 0);
	snprintf(path, sizeof(path), "%s/dpsoftrast.h", engine);
	char *header = slurp(path);
	scan(&uniforms, header, "\tDPSOFTRAST_UNIFORM_", 0);
	for (const char *p = header; (p = strstr(p, "\tGL20TU_")); p++) {
		char name[64];
		int unit;
		if (sscanf(p, "\tGL20TU_%63[A-Z0-9_] = %d", name, &unit) != 2) continue;
		char *d = name;
		for (const char *s = name; *s; s++) if (*s != '_') *d++ = *s;
		*d = 0;
		unit_number[units.count] = unit;
		add(&units, name, strlen(name));
	}
	if (modes.count != 17 || permutations.count != 32 || uniforms.count < 100)
		fail("unexpected engine tables in", engine);
}

static void run_preprocessor(const char *input, const char *output)
{
	char *const arguments[] = {"cc", "-E", "-P", "-x", "c", (char *)input, "-o", (char *)output, 0};
	pid_t pid;
	int status;
	if (posix_spawnp(&pid, "cc", 0, 0, arguments, environ) || waitpid(pid, &status, 0) != pid ||
	    !WIFEXITED(status) || WEXITSTATUS(status))
		fail("cc -E failed on", input);
}

static char *preprocess(const char *output, const char *pair, const char *stage, int mode, unsigned long long permutation)
{
	char in[4096], out[4096];
	snprintf(in, sizeof(in), "%s/%s.%s.in", output, pair, stage);
	snprintf(out, sizeof(out), "%s/%s.%s.i", output, pair, stage);
	FILE *f = fopen(in, "w");
	if (!f) fail("cannot write", in);
	fprintf(f, "#define GLSL140\n#define USEEXACTSPECULARMATH\n#define %s_SHADER\n#define MODE_%s\n", stage[0] == 'v' ? "VERTEX" : "FRAGMENT", modes.name[mode]);
	for (int i = 0; i < 32; i++)
		if (permutation >> i & 1) fprintf(f, "#define USE%s\n", permutations.name[i]);
	for (const char *const *s = glsl; *s; s++) fputs(*s, f);
	fclose(f);
	run_preprocessor(in, out);
	char *text = slurp(out);
	remove(in);
	remove(out);
	return text;
}

// A declaration line "QUALIFIER... TYPE NAME;": its words, at most eight.
static int words(const char *line, char word[8][64])
{
	int n = 0;
	const char *p = line;
	for (;;) {
		while (*p == ' ' || *p == '\t') p++;
		if (*p == ';' && !p[1 + strspn(p + 1, " \t")]) return n;
		size_t len = 0;
		while (isalnum((unsigned char)p[len]) || p[len] == '_') len++;
		if (!len || len >= 64 || n == 8) return 0;
		memcpy(word[n], p, len);
		word[n++][len] = 0;
		p += len;
	}
}

static int is_sampler(const char *type) { return !strncmp(type, "sampler", 7); }

static int unit_of(const char *texture)
{
	char name[64];
	int n = 0;
	for (const char *s = texture + strlen("Texture_"); *s && n < 63; s++) name[n++] = toupper((unsigned char)*s);
	name[n] = 0;
	int i = find(&units, name);
	if (strncmp(texture, "Texture_", 8) || i < 0) fail("no texture unit for", texture);
	return unit_number[i];
}

// Whether NAME occurs in TEXT beyond its one declaration.
static int used(const char *text, const char *name)
{
	int count = 0;
	size_t n = strlen(name);
	for (const char *p = text; (p = strstr(p, name)); p += n)
		if ((p == text || !(isalnum((unsigned char)p[-1]) || p[-1] == '_')) && !(isalnum((unsigned char)p[n]) || p[n] == '_'))
			count++;
	return count > 1;
}

// The uniforms either stage reads and the vertex stage's varyings, in declaration order.
static void collect(const char *text, const char *other, int vertex, names_t *declared, names_t *varyings)
{
	for (const char *line = text; *line; line = strchr(line, '\n') ? strchr(line, '\n') + 1 : line + strlen(line)) {
		char copy[512], word[8][64];
		size_t n = strcspn(line, "\n");
		if (n >= sizeof(copy)) continue;
		memcpy(copy, line, n);
		copy[n] = 0;
		int count = words(copy, word);
		if (count < 3) continue;
		const char *name = word[count - 1];
		if (!strcmp(word[0], "uniform") && !is_sampler(word[count - 2]) && find(declared, name) < 0 &&
		    (used(text, name) || used(other, name)))
			add(declared, name, strlen(name));
		if (!strcmp(word[0], vertex ? "out" : "in") && strncmp(name, "Attrib_", 7) && strcmp(name, "dp_FragColor") &&
		    find(varyings, name) < 0)
			add(varyings, name, strlen(name));
	}
}

static const char *swizzle(const char *type)
{
	if (!strcmp(type, "float")) return ".x";
	if (!strcmp(type, "vec2")) return ".xy";
	if (!strcmp(type, "vec3")) return ".xyz";
	if (!strcmp(type, "vec4")) return "";
	fail("unsupported uniform type", type);
	return 0;
}

static void rewrite(const char *path, const char *text, int vertex, const names_t *declared, const int *slot, int slots,
                    const names_t *varyings)
{
	FILE *f = fopen(path, "w");
	if (!f) fail("cannot write", path);
	fprintf(f, "#version 450\n"
	           "layout(std430, set=0, binding=0) readonly buffer DPUniforms { vec4 dp_uniforms[]; };\n"
	           "#define DPU(i) dp_uniforms[dp_draw * %du + (i)]\n", slots);
	if (vertex) fprintf(f, "uint dp_draw;\nlayout(location=%d) flat out uint dp_draw_out;\n", varyings->count);
	else fprintf(f, "layout(location=%d) flat in uint dp_draw;\n", varyings->count);
	for (const char *line = text; *line; line = strchr(line, '\n') ? strchr(line, '\n') + 1 : line + strlen(line)) {
		char copy[512], word[8][64];
		size_t n = strcspn(line, "\n");
		if (n >= sizeof(copy)) fail("line too long in", path);
		memcpy(copy, line, n);
		copy[n] = 0;
		int count = words(copy, word);
		const char *name = count ? word[count - 1] : "", *type = count > 1 ? word[count - 2] : "";
		if ((count == 2 && !strcmp(word[0], "invariant")) || (count == 3 && !strcmp(word[0], "precision")))
			continue;
		if (count >= 3 && !strcmp(word[0], "uniform") && is_sampler(type)) {
			int unit = unit_of(name);
			int cube = !strcmp(type, "samplerCube"), shadow = !strcmp(type, "sampler2DShadow");
			fprintf(f, "layout(set=1, binding=%d) uniform %s %s_t;\n", 2 * unit, cube ? "textureCube" : "texture2D", name);
			fprintf(f, "layout(set=1, binding=%d) uniform %s %s_s;\n", 2 * unit + 1, shadow ? "samplerShadow" : "sampler", name);
			fprintf(f, "#define %s %s(%s_t, %s_s)\n", name, type, name, name);
		} else if (count >= 3 && !strcmp(word[0], "uniform")) {
			if (find(declared, name) < 0) continue;
			int k = slot[find(declared, name)];
			if (!strcmp(type, "mat4"))
				fprintf(f, "#define %s mat4(DPU(%d), DPU(%d), DPU(%d), DPU(%d))\n", name, k, k + 1, k + 2, k + 3);
			else
				fprintf(f, "#define %s (%s(DPU(%d)%s))\n", name, type, k, swizzle(type));
		} else if (count >= 3 && vertex && !strcmp(word[0], "in") && !strncmp(name, "Attrib_", 7)) {
			if (!used(text, name)) continue;
			const char *what = name + 7;
			int location = !strcmp(what, "Position") ? 0 : !strcmp(what, "Color") ? 1 :
			               !strncmp(what, "TexCoord", 8) ? 2 + atoi(what + 8) : -1;
			if (location < 0) fail("unknown attribute", name);
			fprintf(f, "layout(location=%d) in %s %s;\n", location, type, name);
		} else if (count >= 3 && (!strcmp(word[0], "in") || !strcmp(word[0], "out")) && find(varyings, name) >= 0) {
			fprintf(f, "layout(location=%d) %s %s %s;\n", find(varyings, name), word[0], type, name);
		} else if (count == 3 && !strcmp(word[0], "out") && !strcmp(name, "dp_FragColor")) {
			fputs("layout(location=0) out vec4 dp_FragColor;\n", f);
		} else if (strstr(copy, "void main(void)")) {
			fputs("void dp_main(void)\n", f);
		} else {
			fprintf(f, "%s\n", copy);
		}
	}
	if (vertex)
		fputs("void main(void)\n{\n\tdp_draw = uint(gl_InstanceIndex);\n\tdp_draw_out = dp_draw;\n\tdp_main();\n"
		      "\tgl_Position.z = (gl_Position.z + gl_Position.w) * 0.5;\n}\n", f);
	else
		fputs("void main(void)\n{\n\tdp_main();\n}\n", f);
	fclose(f);
}

static void pair(const char *output, const char *spec)
{
	char *end;
	int mode = (int)strtol(spec, &end, 10);
	if (*end != ':' || mode < 0 || mode >= modes.count) fail("not MODE:PERMUTATION", spec);
	unsigned long long permutation = strtoull(end + 1, &end, 10);
	if (*end) fail("not MODE:PERMUTATION", spec);
	char name[64], path[4096];
	snprintf(name, sizeof(name), "%d-%llu", mode, permutation);
	char *vertex = preprocess(output, name, "vert", mode, permutation);
	char *fragment = preprocess(output, name, "frag", mode, permutation);
	names_t declared = {0}, varyings = {0}, unused = {0};
	collect(vertex, fragment, 1, &declared, &varyings);
	collect(fragment, vertex, 0, &declared, &unused);
	int slot[MAX_NAMES], slots = 0;
	snprintf(path, sizeof(path), "%s/%s.uniforms", output, name);
	FILE *f = fopen(path, "w");
	if (!f) fail("cannot write", path);
	for (int i = 0; i < declared.count; i++) {
		// A mat4 is declared without the M1..M4 suffix of its four DPSOFTRAST_UNIFORM rows.
		char rows[80];
		snprintf(rows, sizeof(rows), "%sM1", declared.name[i]);
		int index = find(&uniforms, declared.name[i]), matrix = find(&uniforms, rows);
		if (index < 0 && matrix < 0) fail("no DPSOFTRAST_UNIFORM for", declared.name[i]);
		slot[i] = slots;
		for (int row = 0; row < (index < 0 ? 4 : 1); row++, slots++)
			fprintf(f, "%s%d", slots ? " " : "", (index < 0 ? matrix : index) + row);
	}
	fputc('\n', f);
	fclose(f);
	snprintf(path, sizeof(path), "%s/%s.vert", output, name);
	rewrite(path, vertex, 1, &declared, slot, slots ? slots : 1, &varyings);
	snprintf(path, sizeof(path), "%s/%s.frag", output, name);
	rewrite(path, fragment, 0, &declared, slot, slots ? slots : 1, &varyings);
	free(vertex);
	free(fragment);
}

int main(int argc, char **argv)
{
	if (argc < 4) fail("usage", "dpshaders ENGINE OUTPUT MODE:PERMUTATION...");
	load_tables(argv[1]);
	for (int i = 3; i < argc; i++) pair(argv[2], argv[i]);
	return 0;
}
