/*
 * Xsdl: the kdrive X server in an SDL window. Revived from xorg-server's
 * hw/kdrive/sdl/sdl.c, removed by commit 52bc6d94 ("kdrive: Purge Xsdl",
 * 2009), and ported to SDL 2 and today's kdrive: the screen is the window's
 * surface, damage is copied to the window at most once a frame, and SDL's
 * scancodes are the evdev keycodes the default keymap expects.
 *
 * Copyright © 2004 PillowElephantBadgerBankPond
 *
 * Permission to use, copy, modify, distribute, and sell this software and its
 * documentation for any purpose is hereby granted without fee, provided that
 * the above copyright notice appear in all copies and that both that
 * copyright notice and this permission notice appear in supporting
 * documentation, and that the name of PillowElephantBadgerBankPond not be used in
 * advertising or publicity pertaining to distribution of the software without
 * specific, written prior permission.  PillowElephantBadgerBankPond makes no
 * representations about the suitability of this software for any purpose.  It
 * is provided "as is" without express or implied warranty.
 *
 * PillowElephantBadgerBankPond DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE,
 * INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS, IN NO
 * EVENT SHALL PillowElephantBadgerBankPond BE LIABLE FOR ANY SPECIAL, INDIRECT OR
 * CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE,
 * DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
 * TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */
#ifdef HAVE_DIX_CONFIG_H
#include <dix-config.h>
#endif
#include "kdrive.h"
#include "damage.h"
#include <SDL.h>
#include <unistd.h>

int dix_main(int argc, char *argv[], char *envp[]);

/* How often an idle server looks for SDL events, and the least time between
 * two copies to the window, in milliseconds. */
#define POLL_INTERVAL 8
#define FRAME_INTERVAL 16

static SDL_Window *window;
static DamagePtr damage;
static ScreenBlockHandlerProcPtr screenBlockHandler;
static ScreenWakeupHandlerProcPtr screenWakeupHandler;
static CARD32 lastCopy;
static KdKeyboardInfo *sdlKeyboard;
static KdPointerInfo *sdlPointer;
static unsigned long buttonState;

static Bool
sdlScreenInit(KdScreenInfo *screen)
{
    SDL_Surface *surface;

    if (!screen->width || !screen->height) {
        screen->width = 1024;
        screen->height = 768;
    }
    window = SDL_CreateWindow("Xsdl", SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
                              screen->width, screen->height, 0);
    surface = window ? SDL_GetWindowSurface(window) : NULL;
    if (!surface) {
        ErrorF("Xsdl: %s\n", SDL_GetError());
        return FALSE;
    }
    if (surface->format->BitsPerPixel != 32) {
        ErrorF("Xsdl: the window surface has %d bits per pixel, not 32\n",
               surface->format->BitsPerPixel);
        return FALSE;
    }
    screen->width = surface->w;
    screen->height = surface->h;
    screen->rate = 60;
    screen->fb.depth = 24;
    screen->fb.bitsPerPixel = 32;
    screen->fb.visuals = 1 << TrueColor;
    screen->fb.redMask = surface->format->Rmask;
    screen->fb.greenMask = surface->format->Gmask;
    screen->fb.blueMask = surface->format->Bmask;
    screen->fb.byteStride = surface->pitch;
    screen->fb.pixelStride = surface->pitch / 4;
    screen->fb.frameBuffer = surface->pixels;
    return TRUE;
}

/* Copies what was drawn since the last copy to the window. */
static void
sdlCopyDamage(void)
{
    RegionPtr region = DamageRegion(damage);
    int count = RegionNumRects(region);
    BoxPtr box = RegionRects(region);
    SDL_Rect *rects = calloc(count, sizeof(SDL_Rect));

    if (!rects)
        return;
    for (int i = 0; i < count; i++)
        rects[i] = (SDL_Rect) { box[i].x1, box[i].y1, box[i].x2 - box[i].x1, box[i].y2 - box[i].y1 };
    if (SDL_UpdateWindowSurfaceRects(window, rects, count) < 0)
        ErrorF("Xsdl: %s\n", SDL_GetError());
    free(rects);
    DamageEmpty(damage);
    lastCopy = GetTimeInMillis();
}

/* Before the server waits: copy damage once its frame is due, and wake in
 * time for the next copy and to look for input. */
static void
sdlBlockHandler(ScreenPtr pScreen, void *timeout)
{
    pScreen->BlockHandler = screenBlockHandler;
    (*pScreen->BlockHandler) (pScreen, timeout);
    screenBlockHandler = pScreen->BlockHandler;
    pScreen->BlockHandler = sdlBlockHandler;

    if (damage && RegionNotEmpty(DamageRegion(damage))) {
        CARD32 since = GetTimeInMillis() - lastCopy;

        if (since >= FRAME_INTERVAL)
            sdlCopyDamage();
        else
            AdjustWaitForDelay(timeout, FRAME_INTERVAL - since);
    }
    AdjustWaitForDelay(timeout, POLL_INTERVAL);
}

/* SDL's scancodes are USB usages; X's keymap is evdev's, Linux key codes
 * plus 8. */
static const unsigned char evdevKeycodes[SDL_NUM_SCANCODES] = {
    [SDL_SCANCODE_A] = 30, [SDL_SCANCODE_B] = 48, [SDL_SCANCODE_C] = 46, [SDL_SCANCODE_D] = 32,
    [SDL_SCANCODE_E] = 18, [SDL_SCANCODE_F] = 33, [SDL_SCANCODE_G] = 34, [SDL_SCANCODE_H] = 35,
    [SDL_SCANCODE_I] = 23, [SDL_SCANCODE_J] = 36, [SDL_SCANCODE_K] = 37, [SDL_SCANCODE_L] = 38,
    [SDL_SCANCODE_M] = 50, [SDL_SCANCODE_N] = 49, [SDL_SCANCODE_O] = 24, [SDL_SCANCODE_P] = 25,
    [SDL_SCANCODE_Q] = 16, [SDL_SCANCODE_R] = 19, [SDL_SCANCODE_S] = 31, [SDL_SCANCODE_T] = 20,
    [SDL_SCANCODE_U] = 22, [SDL_SCANCODE_V] = 47, [SDL_SCANCODE_W] = 17, [SDL_SCANCODE_X] = 45,
    [SDL_SCANCODE_Y] = 21, [SDL_SCANCODE_Z] = 44,
    [SDL_SCANCODE_1] = 2, [SDL_SCANCODE_2] = 3, [SDL_SCANCODE_3] = 4, [SDL_SCANCODE_4] = 5,
    [SDL_SCANCODE_5] = 6, [SDL_SCANCODE_6] = 7, [SDL_SCANCODE_7] = 8, [SDL_SCANCODE_8] = 9,
    [SDL_SCANCODE_9] = 10, [SDL_SCANCODE_0] = 11,
    [SDL_SCANCODE_RETURN] = 28, [SDL_SCANCODE_ESCAPE] = 1, [SDL_SCANCODE_BACKSPACE] = 14,
    [SDL_SCANCODE_TAB] = 15, [SDL_SCANCODE_SPACE] = 57, [SDL_SCANCODE_MINUS] = 12,
    [SDL_SCANCODE_EQUALS] = 13, [SDL_SCANCODE_LEFTBRACKET] = 26, [SDL_SCANCODE_RIGHTBRACKET] = 27,
    [SDL_SCANCODE_BACKSLASH] = 43, [SDL_SCANCODE_NONUSHASH] = 43, [SDL_SCANCODE_SEMICOLON] = 39,
    [SDL_SCANCODE_APOSTROPHE] = 40, [SDL_SCANCODE_GRAVE] = 41, [SDL_SCANCODE_COMMA] = 51,
    [SDL_SCANCODE_PERIOD] = 52, [SDL_SCANCODE_SLASH] = 53, [SDL_SCANCODE_CAPSLOCK] = 58,
    [SDL_SCANCODE_F1] = 59, [SDL_SCANCODE_F2] = 60, [SDL_SCANCODE_F3] = 61, [SDL_SCANCODE_F4] = 62,
    [SDL_SCANCODE_F5] = 63, [SDL_SCANCODE_F6] = 64, [SDL_SCANCODE_F7] = 65, [SDL_SCANCODE_F8] = 66,
    [SDL_SCANCODE_F9] = 67, [SDL_SCANCODE_F10] = 68, [SDL_SCANCODE_F11] = 87, [SDL_SCANCODE_F12] = 88,
    [SDL_SCANCODE_PRINTSCREEN] = 99, [SDL_SCANCODE_SCROLLLOCK] = 70, [SDL_SCANCODE_PAUSE] = 119,
    [SDL_SCANCODE_INSERT] = 110, [SDL_SCANCODE_HOME] = 102, [SDL_SCANCODE_PAGEUP] = 104,
    [SDL_SCANCODE_DELETE] = 111, [SDL_SCANCODE_END] = 107, [SDL_SCANCODE_PAGEDOWN] = 109,
    [SDL_SCANCODE_RIGHT] = 106, [SDL_SCANCODE_LEFT] = 105, [SDL_SCANCODE_DOWN] = 108,
    [SDL_SCANCODE_UP] = 103, [SDL_SCANCODE_NUMLOCKCLEAR] = 69, [SDL_SCANCODE_KP_DIVIDE] = 98,
    [SDL_SCANCODE_KP_MULTIPLY] = 55, [SDL_SCANCODE_KP_MINUS] = 74, [SDL_SCANCODE_KP_PLUS] = 78,
    [SDL_SCANCODE_KP_ENTER] = 96, [SDL_SCANCODE_KP_1] = 79, [SDL_SCANCODE_KP_2] = 80,
    [SDL_SCANCODE_KP_3] = 81, [SDL_SCANCODE_KP_4] = 75, [SDL_SCANCODE_KP_5] = 76,
    [SDL_SCANCODE_KP_6] = 77, [SDL_SCANCODE_KP_7] = 71, [SDL_SCANCODE_KP_8] = 72,
    [SDL_SCANCODE_KP_9] = 73, [SDL_SCANCODE_KP_0] = 82, [SDL_SCANCODE_KP_PERIOD] = 83,
    [SDL_SCANCODE_NONUSBACKSLASH] = 86, [SDL_SCANCODE_APPLICATION] = 127,
    [SDL_SCANCODE_LCTRL] = 29, [SDL_SCANCODE_LSHIFT] = 42, [SDL_SCANCODE_LALT] = 56,
    [SDL_SCANCODE_LGUI] = 125, [SDL_SCANCODE_RCTRL] = 97, [SDL_SCANCODE_RSHIFT] = 54,
    [SDL_SCANCODE_RALT] = 100, [SDL_SCANCODE_RGUI] = 126,
};

static void
sdlButton(unsigned long button, Bool pressed)
{
    if (pressed)
        buttonState |= button;
    else
        buttonState &= ~button;
    KdEnqueuePointerEvent(sdlPointer, buttonState | KD_MOUSE_DELTA, 0, 0, 0);
}

static unsigned long
sdlButtonBit(Uint8 button)
{
    switch (button) {
    case SDL_BUTTON_LEFT: return KD_BUTTON_1;
    case SDL_BUTTON_MIDDLE: return KD_BUTTON_2;
    case SDL_BUTTON_RIGHT: return KD_BUTTON_3;
    default: return 0;
    }
}

/* After the server waited: SDL's events become the server's. */
static void
sdlWakeupHandler(ScreenPtr pScreen, int result)
{
    SDL_Event event;

    pScreen->WakeupHandler = screenWakeupHandler;
    (*pScreen->WakeupHandler) (pScreen, result);
    screenWakeupHandler = pScreen->WakeupHandler;
    pScreen->WakeupHandler = sdlWakeupHandler;

    while (SDL_PollEvent(&event)) {
        switch (event.type) {
        case SDL_MOUSEMOTION:
            if (sdlPointer)
                KdEnqueuePointerEvent(sdlPointer, buttonState, event.motion.x, event.motion.y, 0);
            break;
        case SDL_MOUSEBUTTONDOWN:
        case SDL_MOUSEBUTTONUP:
            if (sdlPointer && sdlButtonBit(event.button.button))
                sdlButton(sdlButtonBit(event.button.button), event.type == SDL_MOUSEBUTTONDOWN);
            break;
        case SDL_MOUSEWHEEL:
            if (sdlPointer && event.wheel.y) {
                unsigned long button = event.wheel.y > 0 ? KD_BUTTON_4 : KD_BUTTON_5;

                sdlButton(button, TRUE);
                sdlButton(button, FALSE);
            }
            break;
        case SDL_KEYDOWN:
        case SDL_KEYUP:
            if (sdlKeyboard && evdevKeycodes[event.key.keysym.scancode])
                KdEnqueueKeyboardEvent(sdlKeyboard, evdevKeycodes[event.key.keysym.scancode] + 8,
                                       event.type == SDL_KEYUP);
            break;
        }
    }
}

static Bool
sdlCreateResources(ScreenPtr pScreen)
{
    PixmapPtr pixmap = (*pScreen->GetScreenPixmap) (pScreen);

    damage = DamageCreate(NULL, NULL, DamageReportNone, TRUE, pScreen, pScreen);
    if (!damage)
        return FALSE;
    DamageRegister(&pixmap->drawable, damage);
    return TRUE;
}

static Bool
sdlFinishInitScreen(ScreenPtr pScreen)
{
    screenBlockHandler = pScreen->BlockHandler;
    pScreen->BlockHandler = sdlBlockHandler;
    screenWakeupHandler = pScreen->WakeupHandler;
    pScreen->WakeupHandler = sdlWakeupHandler;
    /* The server draws its own cursor into the screen. */
    SDL_ShowCursor(SDL_DISABLE);
    return TRUE;
}

static void
sdlCloseScreen(ScreenPtr pScreen)
{
    if (damage)
        DamageDestroy(damage);
    damage = NULL;
}

static void
sdlScreenFini(KdScreenInfo *screen)
{
    SDL_DestroyWindow(window);
    window = NULL;
}

static KdCardFuncs sdlFuncs = {
    .scrinit = sdlScreenInit,
    .finishInitScreen = sdlFinishInitScreen,
    .createRes = sdlCreateResources,
    .scrfini = sdlScreenFini,
    .closeScreen = sdlCloseScreen,
};

static Status
sdlKeyboardInit(KdKeyboardInfo *ki)
{
    ki->minScanCode = 8;
    ki->maxScanCode = 255;
    free(ki->name);
    ki->name = strdup("Xsdl keyboard");
    sdlKeyboard = ki;
    return Success;
}

static void
sdlKeyboardFini(KdKeyboardInfo *ki)
{
    sdlKeyboard = NULL;
}

static KdKeyboardDriver sdlKeyboardDriver = {
    .name = "sdl",
    .Init = sdlKeyboardInit,
    .Fini = sdlKeyboardFini,
};

static Status
sdlMouseInit(KdPointerInfo *pi)
{
    pi->nButtons = 7;
    pi->nAxes = 3;
    free(pi->name);
    pi->name = strdup("Xsdl pointer");
    sdlPointer = pi;
    return Success;
}

static void
sdlMouseFini(KdPointerInfo *pi)
{
    sdlPointer = NULL;
}

static KdPointerDriver sdlMouseDriver = {
    .name = "sdl",
    .Init = sdlMouseInit,
    .Fini = sdlMouseFini,
};

/* The server's own main takes envp, which WebAssembly's C has no entry for:
 * main(argc, argv) is the one it calls. */
int
main(int argc, char *argv[])
{
    return dix_main(argc, argv, environ);
}

void
InitCard(char *name)
{
    KdCardInfoAdd(&sdlFuncs, 0);
}

void
InitOutput(ScreenInfo *pScreenInfo, int argc, char **argv)
{
    KdInitOutput(pScreenInfo, argc, argv);
}

void
InitInput(int argc, char **argv)
{
    KdKeyboardInfo *ki;
    KdPointerInfo *pi;

    KdAddKeyboardDriver(&sdlKeyboardDriver);
    KdAddPointerDriver(&sdlMouseDriver);
    if (!(ki = KdNewKeyboard()) || !(pi = KdNewPointer()))
        FatalError("Xsdl: no memory for the input devices\n");
    ki->driver = &sdlKeyboardDriver;
    KdAddKeyboard(ki);
    pi->driver = &sdlMouseDriver;
    KdAddPointer(pi);
    KdInitInput();
}

void
CloseInput(void)
{
    KdCloseInput();
}

#ifdef DDXBEFORERESET
void
ddxBeforeReset(void)
{
}
#endif

void
ddxUseMsg(void)
{
    KdUseMsg();
}

int
ddxProcessArgument(int argc, char **argv, int i)
{
    return KdProcessArgument(argc, argv, i);
}

void
OsVendorInit(void)
{
    if (serverGeneration == 1 && SDL_Init(SDL_INIT_VIDEO) < 0)
        FatalError("Xsdl: %s\n", SDL_GetError());
}
