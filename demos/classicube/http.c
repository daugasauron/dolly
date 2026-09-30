/* Skins and web services are outside the local Classic room. SPDX-License-Identifier: MIT */
#undef CC_BUILD_NETWORKING
#define Http_CheckProgress Dolly_Unused_Http_CheckProgress
#include "Http_Worker.c"
#undef Http_CheckProgress
int Http_CheckProgress(int reqID) { return HTTP_PROGRESS_NOT_WORKING_ON; }
