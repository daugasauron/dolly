/* SPDX-License-Identifier: MIT
 * FreeType as gdi32 looks it up (dlls/gdi32/freetype.c loads it by name and
 * takes each function with dlsym): the library is linked in, and these are
 * the functions gdi32 asks for. Compiled into gdi32. */
#include <stddef.h>
#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_GLYPH_H
#include FT_LCD_FILTER_H
#include FT_MODULE_H
#include FT_OUTLINE_H
#include FT_SFNT_NAMES_H
#include FT_TRIGONOMETRY_H
#include FT_TRUETYPE_TABLES_H
#include FT_WINFONTS_H

#include "linked-library.h"

#define SYMBOL(name) { #name, (void *)name }

static const struct linked_symbol symbols[] =
{
    SYMBOL(FT_Done_Face), SYMBOL(FT_Get_Char_Index), SYMBOL(FT_Get_First_Char), SYMBOL(FT_Get_Next_Char),
    SYMBOL(FT_Get_Sfnt_Name), SYMBOL(FT_Get_Sfnt_Name_Count), SYMBOL(FT_Get_Sfnt_Table), SYMBOL(FT_Get_WinFNT_Header),
    SYMBOL(FT_Init_FreeType), SYMBOL(FT_Library_Version), SYMBOL(FT_Load_Glyph), SYMBOL(FT_Load_Sfnt_Table),
    SYMBOL(FT_Matrix_Multiply), SYMBOL(FT_MulFix), SYMBOL(FT_New_Face), SYMBOL(FT_New_Memory_Face),
    SYMBOL(FT_Outline_Get_Bitmap), SYMBOL(FT_Outline_Get_CBox), SYMBOL(FT_Outline_Transform),
    SYMBOL(FT_Outline_Translate), SYMBOL(FT_Render_Glyph), SYMBOL(FT_Set_Charmap), SYMBOL(FT_Set_Pixel_Sizes),
    SYMBOL(FT_Vector_Length), SYMBOL(FT_Vector_Transform), SYMBOL(FT_Vector_Unit), SYMBOL(FT_Outline_Embolden),
    SYMBOL(FT_Get_TrueType_Engine_Type), SYMBOL(FT_Library_SetLcdFilter), SYMBOL(FT_Property_Set),
    { NULL }
};

static const struct linked_library freetype = { "libfreetype", symbols };

const struct linked_library *const wine_dolly_libraries[] = { &freetype, NULL };
