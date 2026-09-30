#pragma once
/* The upstream ImGui panel is replaced by the Dolly controls in app.c. */
#define imgui_overlay_init(...) ((void)0)
#define imgui_overlay_shutdown(...) ((void)0)
#define imgui_overlay_handle_input(...) ((void)0)
#define imgui_overlay_new_frame(...) ((void)0)
#define imgui_overlay_render(...) ((void)0)
#define igSetNextWindowPos(...) ((void)0)
#define igBegin(...) ((void)0)
#define igEnd(...) ((void)0)
#define igCollapsingHeader_TreeNodeFlags(...) false
#define igSliderInt(...) false
#define igSliderFloat(...) false
#define igCombo_Str_arr(...) false
#define igButton(...) false
#define igCheckbox(...) false
