#pragma once

// Desktop OpenGL through Godot's GLAD loader, which takes Mesa's functions
// from eglGetProcAddress.
#ifndef GL_API_ENABLED
#define GL_API_ENABLED
#endif
#ifndef GLES_API_ENABLED
#define GLES_API_ENABLED
#endif

#include <thirdparty/glad/glad/gl.h>
