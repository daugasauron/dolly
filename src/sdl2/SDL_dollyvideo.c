/* Dolly platform backend for upstream SDL2. SPDX-License-Identifier: MIT */
#include "../../SDL_internal.h"
#include "../SDL_sysvideo.h"
#include "../../events/SDL_events_c.h"
#include "../../events/SDL_keyboard_c.h"
#include "../../events/SDL_mouse_c.h"
#include "SDL_hints.h"
#include <dolly/display.h>

typedef struct {
    dolly_display_surface display;
    SDL_Window *window;
    SDL_Surface *pixels;
    SDL_bool relative;
} DollyVideo;

static int DollyError(const char *operation, int error)
{
    return SDL_SetError("Dolly display %s: %d", operation, error);
}

static int DollyVideoInit(_THIS)
{
    DollyVideo *video = _this->driverdata;
    int error = dolly_display_acquire(&video->display);
    if (error) return DollyError("acquire", error);
    SDL_DisplayMode mode = { SDL_PIXELFORMAT_RGBA32, 800, 600, 60, NULL };
    if (SDL_AddBasicVideoDisplay(&mode) < 0) {
        dolly_display_release(video->display.generation);
        SDL_zero(video->display);
        return -1;
    }
    SDL_AddDisplayMode(&_this->displays[0], &mode);
    return 0;
}

static void DollyVideoQuit(_THIS)
{
    DollyVideo *video = _this->driverdata;
    if (video->display.generation) dolly_display_release(video->display.generation);
    SDL_zero(video->display);
}

static int DollyCreateWindow(_THIS, SDL_Window *window)
{
    DollyVideo *video = _this->driverdata;
    if (video->window) return SDL_SetError("Dolly supports one SDL window");
    int error = dolly_display_set_size(video->display.generation, window->w, window->h, &video->display);
    if (error) return DollyError("size", error);
    video->window = window;
    SDL_SetKeyboardFocus(window);
    SDL_SetMouseFocus(window);
    return 0;
}

static void DollyDestroyFramebuffer(_THIS, SDL_Window *window)
{
    DollyVideo *video = _this->driverdata;
    SDL_FreeSurface(video->pixels);
    video->pixels = NULL;
    (void)window;
}

static void DollyDestroyWindow(_THIS, SDL_Window *window)
{
    DollyVideo *video = _this->driverdata;
    DollyDestroyFramebuffer(_this, window);
    if (video->window == window) video->window = NULL;
}

static int DollyCreateFramebuffer(_THIS, SDL_Window *window, Uint32 *format, void **pixels, int *pitch)
{
    DollyVideo *video = _this->driverdata;
    DollyDestroyFramebuffer(_this, window);
    int error = dolly_display_set_size(video->display.generation, window->w, window->h, &video->display);
    if (error) return DollyError("size", error);
    video->pixels = SDL_CreateRGBSurfaceWithFormat(0, window->w, window->h, 32, SDL_PIXELFORMAT_RGBA32);
    if (!video->pixels) return -1;
    *format = video->pixels->format->format;
    *pixels = video->pixels->pixels;
    *pitch = video->pixels->pitch;
    return 0;
}

static int DollyUpdateFramebuffer(_THIS, SDL_Window *window, const SDL_Rect *rects, int count)
{
    DollyVideo *video = _this->driverdata;
    dolly_display_frame frame;
    if (!video->pixels) return SDL_SetError("Dolly framebuffer is missing");
    int error = dolly_display_begin_frame(video->display.generation, &frame);
    if (error) return DollyError("begin", error);
    if (frame.pixel_format != DOLLY_DISPLAY_PIXEL_RGBA8 || frame.width != (Uint32)window->w ||
        frame.height != (Uint32)window->h || frame.stride < frame.width * 4 ||
        (size_t)frame.stride * frame.height > frame.capacity)
        return SDL_SetError("Dolly framebuffer geometry changed");
    for (Uint32 y = 0; y < frame.height; ++y) {
        Uint8 *row = frame.pixels + (size_t)y * frame.stride;
        SDL_memcpy(row, (Uint8 *)video->pixels->pixels + (size_t)y * video->pixels->pitch, frame.width * 4);
        for (Uint32 x = 0; x < frame.width; ++x) row[x * 4 + 3] = 255;
    }
    error = dolly_display_present(video->display.generation, frame.buffer_index);
    (void)rects;
    (void)count;
    return error ? DollyError("present", error) : 0;
}

static SDL_Scancode DollyScancode(const dolly_input_event *event)
{
    char code[89];
    if ((size_t)event->key_length + event->code_length > sizeof(event->data)) return SDL_SCANCODE_UNKNOWN;
    SDL_memcpy(code, event->data + event->key_length, event->code_length);
    code[event->code_length] = 0;
    if (event->code_length == 4 && !SDL_memcmp(code, "Key", 3) && code[3] >= 'A' && code[3] <= 'Z')
        return SDL_SCANCODE_A + code[3] - 'A';
    if (event->code_length == 6 && !SDL_memcmp(code, "Digit", 5)) {
        if (code[5] == '0') return SDL_SCANCODE_0;
        if (code[5] >= '1' && code[5] <= '9') return SDL_SCANCODE_1 + code[5] - '1';
    }
    static const struct { const char *code; SDL_Scancode scan; } keys[] = {
        {"ArrowLeft", SDL_SCANCODE_LEFT}, {"ArrowRight", SDL_SCANCODE_RIGHT},
        {"ArrowUp", SDL_SCANCODE_UP}, {"ArrowDown", SDL_SCANCODE_DOWN},
        {"ShiftLeft", SDL_SCANCODE_LSHIFT}, {"ShiftRight", SDL_SCANCODE_RSHIFT},
        {"ControlLeft", SDL_SCANCODE_LCTRL}, {"ControlRight", SDL_SCANCODE_RCTRL},
        {"AltLeft", SDL_SCANCODE_LALT}, {"AltRight", SDL_SCANCODE_RALT},
        {"MetaLeft", SDL_SCANCODE_LGUI}, {"MetaRight", SDL_SCANCODE_RGUI},
        {"Backquote", SDL_SCANCODE_GRAVE}, {"Minus", SDL_SCANCODE_MINUS},
        {"Equal", SDL_SCANCODE_EQUALS}, {"BracketLeft", SDL_SCANCODE_LEFTBRACKET},
        {"BracketRight", SDL_SCANCODE_RIGHTBRACKET}, {"Backslash", SDL_SCANCODE_BACKSLASH},
        {"Semicolon", SDL_SCANCODE_SEMICOLON}, {"Quote", SDL_SCANCODE_APOSTROPHE},
        {"Comma", SDL_SCANCODE_COMMA}, {"Period", SDL_SCANCODE_PERIOD},
        {"Slash", SDL_SCANCODE_SLASH}, {"Enter", SDL_SCANCODE_RETURN},
        {"NumpadEnter", SDL_SCANCODE_KP_ENTER},
    };
    for (size_t i = 0; i < SDL_arraysize(keys); ++i)
        if (!SDL_strcmp(code, keys[i].code)) return keys[i].scan;
    return SDL_GetScancodeFromName(code);
}

static void DollyPumpEvents(_THIS)
{
    DollyVideo *video = _this->driverdata;
    if (!video->window) return;
    dolly_input_event event;
    for (int n = 0; n < DOLLY_DISPLAY_EVENT_CAPACITY; ++n) {
        int result = dolly_display_next_event(video->display.generation, &event, 0);
        if (result <= 0) {
            if (result < 0) SDL_SendQuit();
            break;
        }
        switch (event.type) {
        case DOLLY_INPUT_EVENT_KEY:
            if (event.action != DOLLY_KEY_ACTION_RELEASE) SDL_SetKeyboardFocus(video->window);
            SDL_SendKeyboardKey(event.action == DOLLY_KEY_ACTION_RELEASE ? SDL_RELEASED : SDL_PRESSED,
                                DollyScancode(&event));
            if (event.action != DOLLY_KEY_ACTION_RELEASE && !(event.flags & DOLLY_INPUT_FLAG_COMPOSING) &&
                !(event.modifiers & (DOLLY_INPUT_MOD_CONTROL | DOLLY_INPUT_MOD_META))) {
                char text[SDL_TEXTINPUTEVENT_TEXT_SIZE];
                if (event.key_length < sizeof(text)) {
                    SDL_memcpy(text, event.data, event.key_length);
                    text[event.key_length] = 0;
                    if (SDL_utf8strlen(text) == 1) SDL_SendKeyboardText(text);
                }
            }
            break;
        case DOLLY_INPUT_EVENT_TEXT: {
            size_t offset = (size_t)event.key_length + event.code_length;
            if (offset + event.text_length <= sizeof(event.data)) {
                char text[SDL_TEXTINPUTEVENT_TEXT_SIZE];
                const size_t end = offset + event.text_length;
                while (offset < end) {
                    size_t count = SDL_min(end - offset, sizeof(text) - 1);
                    while (count && offset + count < end && (event.data[offset + count] & 0xc0) == 0x80) --count;
                    if (!count) break;
                    SDL_memcpy(text, event.data + offset, count);
                    text[count] = 0;
                    SDL_SendKeyboardText(text);
                    offset += count;
                }
            }
            break;
        }
        case DOLLY_INPUT_EVENT_POINTER: {
            static const Uint8 buttons[] = { SDL_BUTTON_LEFT, SDL_BUTTON_MIDDLE,
                SDL_BUTTON_RIGHT, SDL_BUTTON_X1, SDL_BUTTON_X2 };
            unsigned button = (event.flags >> 8) & 7;
            if (button >= SDL_arraysize(buttons)) break;
            if (event.action == DOLLY_POINTER_ACTION_PRESS) SDL_SetKeyboardFocus(video->window);
            if (!video->relative)
                SDL_SendMouseMotion(video->window, 0, SDL_FALSE, event.width_css_px, event.height_css_px);
            if (event.action != DOLLY_POINTER_ACTION_DRAG)
                SDL_SendMouseButton(video->window, 0,
                    event.action == DOLLY_POINTER_ACTION_PRESS ? SDL_PRESSED : SDL_RELEASED, buttons[button]);
            break;
        }
        case DOLLY_INPUT_EVENT_POINTER_MOTION:
            if (video->relative)
                SDL_SendMouseMotion(video->window, 0, SDL_TRUE,
                    (Sint32)event.width_css_px / 1000, (Sint32)event.height_css_px / 1000);
            break;
        case DOLLY_INPUT_EVENT_POINTER_CAPTURE:
            if (!event.action && video->relative) {
                SDL_SetKeyboardFocus(NULL);
                SDL_ResetKeyboard();
                for (Uint8 button = SDL_BUTTON_LEFT; button <= SDL_BUTTON_X2; ++button)
                    SDL_SendMouseButton(video->window, 0, SDL_RELEASED, button);
            }
            break;
        case DOLLY_INPUT_EVENT_SCROLL:
            SDL_SendMouseWheel(video->window, 0, 0, -(Sint32)event.action / 1000.0f, SDL_MOUSEWHEEL_NORMAL);
            break;
        case DOLLY_INPUT_EVENT_FOCUS:
            SDL_SetKeyboardFocus(event.action ? video->window : NULL);
            if (!event.action) SDL_ResetKeyboard();
            break;
        default:
            break;
        }
    }
}

static int DollyShowCursor(SDL_Cursor *cursor)
{
    SDL_VideoDevice *device = SDL_GetVideoDevice();
    DollyVideo *video = device->driverdata;
    int error = dolly_display_set_cursor(video->display.generation,
        video->relative ? DOLLY_DISPLAY_CURSOR_CAPTURED :
        SDL_GetMouse()->cursor_shown ? DOLLY_DISPLAY_CURSOR_DEFAULT : DOLLY_DISPLAY_CURSOR_HIDDEN);
    (void)cursor;
    return error ? DollyError("cursor", error) : 0;
}

static int DollySetRelativeMouseMode(SDL_bool enabled)
{
    SDL_VideoDevice *device = SDL_GetVideoDevice();
    DollyVideo *video = device->driverdata;
    int error = dolly_display_set_cursor(video->display.generation,
        enabled ? DOLLY_DISPLAY_CURSOR_CAPTURED : DOLLY_DISPLAY_CURSOR_DEFAULT);
    if (error) return DollyError("relative mouse", error);
    video->relative = enabled;
    return 0;
}

static void DollyWarpMouse(SDL_Window *window, int x, int y)
{
    SDL_VideoDevice *device = SDL_GetVideoDevice();
    DollyVideo *video = device->driverdata;
    if (!video->relative) SDL_SendMouseMotion(window, 0, SDL_FALSE, x, y);
}

static void DollyDeleteDevice(SDL_VideoDevice *device)
{
    SDL_free(device->driverdata);
    SDL_free(device);
}

static SDL_VideoDevice *DollyCreateDevice(void)
{
    SDL_VideoDevice *device = SDL_calloc(1, sizeof(*device));
    DollyVideo *video = SDL_calloc(1, sizeof(*video));
    if (!device || !video) {
        SDL_free(device);
        SDL_free(video);
        SDL_OutOfMemory();
        return NULL;
    }
    device->driverdata = video;
    device->VideoInit = DollyVideoInit;
    device->VideoQuit = DollyVideoQuit;
    device->CreateSDLWindow = DollyCreateWindow;
    device->DestroyWindow = DollyDestroyWindow;
    device->CreateWindowFramebuffer = DollyCreateFramebuffer;
    device->UpdateWindowFramebuffer = DollyUpdateFramebuffer;
    device->DestroyWindowFramebuffer = DollyDestroyFramebuffer;
    device->PumpEvents = DollyPumpEvents;
    device->free = DollyDeleteDevice;
    SDL_GetMouse()->ShowCursor = DollyShowCursor;
    SDL_GetMouse()->SetRelativeMouseMode = DollySetRelativeMouseMode;
    SDL_GetMouse()->WarpMouse = DollyWarpMouse;
    return device;
}

VideoBootStrap DOLLY_bootstrap = { "dolly", "Dolly in-Wasm framebuffer", DollyCreateDevice, NULL };
