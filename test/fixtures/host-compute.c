#include <dolly/gpu.h>
#include <errno.h>

int main(void) {
  static dolly_gpu g;
  if (dolly_gpu_open(&g, 0, 0) < 0) return 1;
  dolly_gpu_begin(&g);
  dolly_gpu_buffer(&g, 1, 16, 140); /* STORAGE | COPY_SRC | COPY_DST */
  dolly_gpu_buffer(&g, 2, 16, 9);   /* MAP_READ | COPY_DST */
  dolly_gpu_shader(&g, 3,
      "@group(0) @binding(0) var<storage,read_write> out:array<f32>;"
      "@compute @workgroup_size(1) fn main(@builtin(global_invocation_id)i:vec3u){"
      "out[i.x]=f32(i.x)*3.0+1.0;}");
  dolly_gpu_compute_pipeline(&g, 4, 3, "main");
  const uint64_t buffers[] = {1}, sizes[] = {16};
  dolly_gpu_group(&g, 5, 4, 1, buffers, sizes);
  dolly_gpu_dispatch(&g, 4, 5, 4);
  dolly_gpu_copy(&g, 1, 2, 16);
  dolly_gpu_submit(&g);
  dolly_gpu_map(&g, 2, 16);
  if (dolly_gpu_batch(&g) < 0 || dolly_gpu_read(&g, 2, 0, 16) != 16) return 2;
  const float *result = (const float *)g.reply;
  for (unsigned i = 0; i < 4; i++) if (result[i] != i * 3.0f + 1.0f) return 3;
  if (dolly_gpu_close(&g) < 0) return 4;
  /* This embedding provides compute with no presentation surface. */
  if (dolly_gpu_open(&g, 64, 64) >= 0 || errno != ENOSYS) return 5;
  return 0;
}
