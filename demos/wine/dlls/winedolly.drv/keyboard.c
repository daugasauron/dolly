/*
 * winedolly.drv: the keyboard.
 *
 * A Dolly key record names the physical key (code) and what it types (key),
 * as a browser KeyboardEvent does. The code gives the virtual key and scan
 * code; what the key typed is remembered per scan code and is the answer to
 * ToUnicodeEx, so the user's own layout is what Windows programs see.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 */

#include "config.h"
#include "wine/port.h"

#include <string.h>

#define NONAMELESSUNION
#define NONAMELESSSTRUCT
#include "dolly.h"
#include "winnls.h"

#define EXTENDED 0x100

static const struct key
{
    const char *code;
    WORD        vkey;
    WORD        scan;   /* set 1, EXTENDED for the keys sent with an E0 prefix */
} keys[] =
{
    { "Escape", VK_ESCAPE, 0x01 }, { "Digit1", '1', 0x02 }, { "Digit2", '2', 0x03 }, { "Digit3", '3', 0x04 },
    { "Digit4", '4', 0x05 }, { "Digit5", '5', 0x06 }, { "Digit6", '6', 0x07 }, { "Digit7", '7', 0x08 },
    { "Digit8", '8', 0x09 }, { "Digit9", '9', 0x0a }, { "Digit0", '0', 0x0b }, { "Minus", VK_OEM_MINUS, 0x0c },
    { "Equal", VK_OEM_PLUS, 0x0d }, { "Backspace", VK_BACK, 0x0e }, { "Tab", VK_TAB, 0x0f },
    { "KeyQ", 'Q', 0x10 }, { "KeyW", 'W', 0x11 }, { "KeyE", 'E', 0x12 }, { "KeyR", 'R', 0x13 }, { "KeyT", 'T', 0x14 },
    { "KeyY", 'Y', 0x15 }, { "KeyU", 'U', 0x16 }, { "KeyI", 'I', 0x17 }, { "KeyO", 'O', 0x18 }, { "KeyP", 'P', 0x19 },
    { "BracketLeft", VK_OEM_4, 0x1a }, { "BracketRight", VK_OEM_6, 0x1b }, { "Enter", VK_RETURN, 0x1c },
    { "ControlLeft", VK_LCONTROL, 0x1d }, { "KeyA", 'A', 0x1e }, { "KeyS", 'S', 0x1f }, { "KeyD", 'D', 0x20 },
    { "KeyF", 'F', 0x21 }, { "KeyG", 'G', 0x22 }, { "KeyH", 'H', 0x23 }, { "KeyJ", 'J', 0x24 }, { "KeyK", 'K', 0x25 },
    { "KeyL", 'L', 0x26 }, { "Semicolon", VK_OEM_1, 0x27 }, { "Quote", VK_OEM_7, 0x28 }, { "Backquote", VK_OEM_3, 0x29 },
    { "ShiftLeft", VK_LSHIFT, 0x2a }, { "Backslash", VK_OEM_5, 0x2b }, { "KeyZ", 'Z', 0x2c }, { "KeyX", 'X', 0x2d },
    { "KeyC", 'C', 0x2e }, { "KeyV", 'V', 0x2f }, { "KeyB", 'B', 0x30 }, { "KeyN", 'N', 0x31 }, { "KeyM", 'M', 0x32 },
    { "Comma", VK_OEM_COMMA, 0x33 }, { "Period", VK_OEM_PERIOD, 0x34 }, { "Slash", VK_OEM_2, 0x35 },
    { "ShiftRight", VK_RSHIFT, 0x36 }, { "NumpadMultiply", VK_MULTIPLY, 0x37 }, { "AltLeft", VK_LMENU, 0x38 },
    { "Space", VK_SPACE, 0x39 }, { "CapsLock", VK_CAPITAL, 0x3a }, { "F1", VK_F1, 0x3b }, { "F2", VK_F2, 0x3c },
    { "F3", VK_F3, 0x3d }, { "F4", VK_F4, 0x3e }, { "F5", VK_F5, 0x3f }, { "F6", VK_F6, 0x40 }, { "F7", VK_F7, 0x41 },
    { "F8", VK_F8, 0x42 }, { "F9", VK_F9, 0x43 }, { "F10", VK_F10, 0x44 }, { "NumLock", VK_NUMLOCK, 0x45 | EXTENDED },
    { "ScrollLock", VK_SCROLL, 0x46 }, { "Numpad7", VK_NUMPAD7, 0x47 }, { "Numpad8", VK_NUMPAD8, 0x48 },
    { "Numpad9", VK_NUMPAD9, 0x49 }, { "NumpadSubtract", VK_SUBTRACT, 0x4a }, { "Numpad4", VK_NUMPAD4, 0x4b },
    { "Numpad5", VK_NUMPAD5, 0x4c }, { "Numpad6", VK_NUMPAD6, 0x4d }, { "NumpadAdd", VK_ADD, 0x4e },
    { "Numpad1", VK_NUMPAD1, 0x4f }, { "Numpad2", VK_NUMPAD2, 0x50 }, { "Numpad3", VK_NUMPAD3, 0x51 },
    { "Numpad0", VK_NUMPAD0, 0x52 }, { "NumpadDecimal", VK_DECIMAL, 0x53 }, { "IntlBackslash", VK_OEM_102, 0x56 },
    { "F11", VK_F11, 0x57 }, { "F12", VK_F12, 0x58 },
    { "NumpadEnter", VK_RETURN, 0x1c | EXTENDED }, { "ControlRight", VK_RCONTROL, 0x1d | EXTENDED },
    { "NumpadDivide", VK_DIVIDE, 0x35 | EXTENDED }, { "AltRight", VK_RMENU, 0x38 | EXTENDED },
    { "Home", VK_HOME, 0x47 | EXTENDED }, { "ArrowUp", VK_UP, 0x48 | EXTENDED }, { "PageUp", VK_PRIOR, 0x49 | EXTENDED },
    { "ArrowLeft", VK_LEFT, 0x4b | EXTENDED }, { "ArrowRight", VK_RIGHT, 0x4d | EXTENDED },
    { "End", VK_END, 0x4f | EXTENDED }, { "ArrowDown", VK_DOWN, 0x50 | EXTENDED }, { "PageDown", VK_NEXT, 0x51 | EXTENDED },
    { "Insert", VK_INSERT, 0x52 | EXTENDED }, { "Delete", VK_DELETE, 0x53 | EXTENDED },
    { "MetaLeft", VK_LWIN, 0x5b | EXTENDED }, { "MetaRight", VK_RWIN, 0x5c | EXTENDED },
    { "ContextMenu", VK_APPS, 0x5d | EXTENDED },
};

/* what each key typed when it was last pressed, by scan code */
static WCHAR typed[0x200];

BOOL dolly_key_input( const dolly_input_event *event, INPUT *input )
{
    const char *code = (const char *)event->data + event->key_length;
    WCHAR text[4];
    unsigned i;

    for (i = 0; i < ARRAY_SIZE(keys); i++)
        if (strlen( keys[i].code ) == event->code_length && !memcmp( keys[i].code, code, event->code_length )) break;
    if (i == ARRAY_SIZE(keys)) return FALSE;

    memset( input, 0, sizeof(*input) );
    input->type = INPUT_KEYBOARD;
    input->u.ki.wVk = keys[i].vkey;
    input->u.ki.wScan = keys[i].scan & 0xff;
    if (keys[i].scan & EXTENDED) input->u.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
    if (event->action == DOLLY_KEY_ACTION_RELEASE) input->u.ki.dwFlags |= KEYEVENTF_KEYUP;
    else
    {
        /* a key that types has one character for its name; the others have a word */
        int len = MultiByteToWideChar( CP_UTF8, 0, (const char *)event->data, event->key_length, text, ARRAY_SIZE(text) );
        typed[keys[i].scan] = len == 1 ? text[0] : 0;
    }
    return TRUE;
}

INT CDECL DOLLY_ToUnicodeEx( UINT virt, UINT scan, const BYTE *state, LPWSTR buffer, int size, UINT flags, HKL hkl )
{
    WCHAR ch;

    if ((scan & 0x8000) || size < 1) return 0;  /* key up */
    switch (virt)
    {
    case VK_RETURN: ch = '\r'; break;
    case VK_TAB:    ch = '\t'; break;
    case VK_BACK:   ch = '\b'; break;
    case VK_ESCAPE: ch = 0x1b; break;
    default:
        ch = typed[scan & 0x1ff];
        if ((state[VK_CONTROL] & 0x80) && !(state[VK_MENU] & 0x80))
            ch = virt >= 'A' && virt <= 'Z' ? virt - 'A' + 1 : 0;
        break;
    }
    if (!ch) return 0;
    buffer[0] = ch;
    return 1;
}

UINT CDECL DOLLY_MapVirtualKeyEx( UINT code, UINT type, HKL hkl )
{
    unsigned i;

    switch (type)
    {
    case MAPVK_VK_TO_VSC:
    case MAPVK_VK_TO_VSC_EX:
        if (code == VK_SHIFT) code = VK_LSHIFT;
        if (code == VK_CONTROL) code = VK_LCONTROL;
        if (code == VK_MENU) code = VK_LMENU;
        for (i = 0; i < ARRAY_SIZE(keys); i++) if (keys[i].vkey == code) return keys[i].scan & 0xff;
        break;
    case MAPVK_VSC_TO_VK:
    case MAPVK_VSC_TO_VK_EX:
        for (i = 0; i < ARRAY_SIZE(keys); i++)
        {
            if (keys[i].scan != code) continue;
            if (type == MAPVK_VSC_TO_VK_EX) return keys[i].vkey;
            switch (keys[i].vkey)
            {
            case VK_LSHIFT: case VK_RSHIFT: return VK_SHIFT;
            case VK_LCONTROL: case VK_RCONTROL: return VK_CONTROL;
            case VK_LMENU: case VK_RMENU: return VK_MENU;
            default: return keys[i].vkey;
            }
        }
        break;
    case MAPVK_VK_TO_CHAR:
        /* the unshifted character of a letter or digit key; the layout of the other keys is the browser's secret */
        if ((code >= 'A' && code <= 'Z') || (code >= '0' && code <= '9')) return code;
        break;
    }
    return 0;
}

SHORT CDECL DOLLY_VkKeyScanEx( WCHAR ch, HKL hkl )
{
    if (ch >= 'a' && ch <= 'z') return ch - 'a' + 'A';
    if (ch >= 'A' && ch <= 'Z') return ch | 0x100;  /* with shift */
    if (ch >= '0' && ch <= '9') return ch;
    if (ch == ' ') return VK_SPACE;
    return -1;
}
