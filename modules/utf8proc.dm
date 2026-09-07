DOLLY 3
MODULE utf8proc

REQUIRES HEADER libc
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL make
REQUIRES TOOL tar
REQUIRES TOOL cp
REQUIRES TOOL rm
REQUIRES TOOL uname

SOURCE HOST /static/neovim/utf8proc.tar /tmp/utf8proc/source.tar c9fdc1bf18b4d5ceb006b2847f6ead4642bfd82a7f102652cac4c13105b0e12a
SLOP tar -xf /tmp/utf8proc/source.tar -C /
SLOP make -C /tmp/utf8proc/source CC=cc CFLAGS=-O0 libutf8proc.a
SLOP cp /tmp/utf8proc/source/libutf8proc.a /usr/lib/libutf8proc.a
SLOP cp /tmp/utf8proc/source/utf8proc.h /usr/include/utf8proc.h

FILE /tmp/utf8proc/check.c
    #include <utf8proc.h>
    #include <assert.h>
    #include <stdlib.h>
    #include <string.h>
    int main(void) {
      assert(utf8proc_charwidth(0x65e5) == 2);
      unsigned char *text = utf8proc_NFC((const unsigned char *)"e\xcc\x81");
      assert(text && strcmp((const char *)text, "\xc3\xa9") == 0);
      free(text);
      return 0;
    }
SLOP cc -O0 /tmp/utf8proc/check.c -lutf8proc -o /tmp/utf8proc/check
SLOP /tmp/utf8proc/check

EXPORTS HEADER utf8proc /usr/include/utf8proc.h
EXPORTS LIB utf8proc /usr/lib/libutf8proc.a
FILE /usr/share/licenses/utf8proc/LICENSE
SLOP rm -rf /tmp/utf8proc
