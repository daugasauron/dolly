/* lean and lake recurse deeper than a Chrome Worker's stack holds: as the compiler
 * does, they ask to be entered on the larger stack a browser may have
 * (docs/browser-stack.md). */
__asm__(".section .custom_section.dolly.process.stack,\"\",@\n.byte 1\n");
