#ifndef DOLLY_SHA256_H
#define DOLLY_SHA256_H

#include <stdint.h>
#include <string.h>

typedef struct {
  uint32_t state[8];
  uint64_t bits;
  unsigned char block[64];
  size_t used;
} Sha256;

static uint32_t rotate_right(uint32_t value, unsigned amount) {
  return (value >> amount) | (value << (32 - amount));
}

static void sha256_transform(Sha256 *sha, const unsigned char block[64]) {
  static const uint32_t constants[64] = {
      0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u,
      0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
      0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
      0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
      0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu,
      0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
      0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u,
      0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
      0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
      0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
      0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u,
      0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
      0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u,
      0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
      0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
      0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u,
  };
  uint32_t words[64];
  for (size_t index = 0; index < 16; ++index) {
    words[index] = ((uint32_t)block[index * 4] << 24) |
                   ((uint32_t)block[index * 4 + 1] << 16) |
                   ((uint32_t)block[index * 4 + 2] << 8) |
                   block[index * 4 + 3];
  }
  for (size_t index = 16; index < 64; ++index) {
    const uint32_t left = words[index - 15];
    const uint32_t right = words[index - 2];
    const uint32_t small0 = rotate_right(left, 7) ^ rotate_right(left, 18) ^
                            (left >> 3);
    const uint32_t small1 = rotate_right(right, 17) ^ rotate_right(right, 19) ^
                            (right >> 10);
    words[index] = words[index - 16] + small0 + words[index - 7] + small1;
  }
  uint32_t a = sha->state[0];
  uint32_t b = sha->state[1];
  uint32_t c = sha->state[2];
  uint32_t d = sha->state[3];
  uint32_t e = sha->state[4];
  uint32_t f = sha->state[5];
  uint32_t g = sha->state[6];
  uint32_t h = sha->state[7];
  for (size_t index = 0; index < 64; ++index) {
    const uint32_t big1 = rotate_right(e, 6) ^ rotate_right(e, 11) ^
                          rotate_right(e, 25);
    const uint32_t choose = (e & f) ^ ((~e) & g);
    const uint32_t first = h + big1 + choose + constants[index] + words[index];
    const uint32_t big0 = rotate_right(a, 2) ^ rotate_right(a, 13) ^
                          rotate_right(a, 22);
    const uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
    const uint32_t second = big0 + majority;
    h = g;
    g = f;
    f = e;
    e = d + first;
    d = c;
    c = b;
    b = a;
    a = first + second;
  }
  sha->state[0] += a;
  sha->state[1] += b;
  sha->state[2] += c;
  sha->state[3] += d;
  sha->state[4] += e;
  sha->state[5] += f;
  sha->state[6] += g;
  sha->state[7] += h;
}

static void sha256_init(Sha256 *sha) {
  static const uint32_t initial[8] = {
      0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
      0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u,
  };
  memcpy(sha->state, initial, sizeof(initial));
  sha->bits = 0;
  sha->used = 0;
}

static void sha256_update(Sha256 *sha, const void *data_value, size_t length) {
  const unsigned char *data = data_value;
  sha->bits += (uint64_t)length * 8;
  while (length != 0) {
    const size_t available = sizeof(sha->block) - sha->used;
    const size_t count = length < available ? length : available;
    memcpy(sha->block + sha->used, data, count);
    sha->used += count;
    data += count;
    length -= count;
    if (sha->used == sizeof(sha->block)) {
      sha256_transform(sha, sha->block);
      sha->used = 0;
    }
  }
}

static void sha256_finish(Sha256 *sha, unsigned char digest[32]) {
  sha->block[sha->used++] = 0x80;
  if (sha->used > 56) {
    memset(sha->block + sha->used, 0, sizeof(sha->block) - sha->used);
    sha256_transform(sha, sha->block);
    sha->used = 0;
  }
  memset(sha->block + sha->used, 0, 56 - sha->used);
  for (size_t index = 0; index < 8; ++index) {
    sha->block[63 - index] = (unsigned char)(sha->bits >> (index * 8));
  }
  sha256_transform(sha, sha->block);
  for (size_t index = 0; index < 8; ++index) {
    digest[index * 4] = (unsigned char)(sha->state[index] >> 24);
    digest[index * 4 + 1] = (unsigned char)(sha->state[index] >> 16);
    digest[index * 4 + 2] = (unsigned char)(sha->state[index] >> 8);
    digest[index * 4 + 3] = (unsigned char)sha->state[index];
  }
}

#endif
