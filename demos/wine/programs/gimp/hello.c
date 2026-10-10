/* SPDX-License-Identifier: MIT */
/* A window with a menu, a label, a button and a coloured area: what shows that GTK+ draws on the Wine
 * desktop and takes its mouse. The button and the menu's first item each give the area another colour. */
#include <gtk/gtk.h>

static GtkWidget *area, *label;

static void
paint (GtkWidget *widget, gpointer name)
{
  GdkColor colour;

  gdk_color_parse (name, &colour);
  gtk_widget_modify_bg (area, GTK_STATE_NORMAL, &colour);
  gtk_label_set_text (GTK_LABEL (label), name);
}

int
main (int argc, char **argv)
{
  GtkWidget *window, *box, *bar, *file, *menu, *item, *button;

  gtk_init (&argc, &argv);
  window = gtk_window_new (GTK_WINDOW_TOPLEVEL);
  gtk_window_set_title (GTK_WINDOW (window), "GTK+ hello");
  g_signal_connect (window, "destroy", G_CALLBACK (gtk_main_quit), NULL);

  box = gtk_vbox_new (FALSE, 0);
  gtk_container_add (GTK_CONTAINER (window), box);
  bar = gtk_menu_bar_new ();
  file = gtk_menu_item_new_with_mnemonic ("_File");
  menu = gtk_menu_new ();
  item = gtk_menu_item_new_with_mnemonic ("_Cyan");
  g_signal_connect (item, "activate", G_CALLBACK (paint), "cyan");
  gtk_menu_shell_append (GTK_MENU_SHELL (menu), item);
  item = gtk_menu_item_new_with_mnemonic ("_Quit");
  g_signal_connect_swapped (item, "activate", G_CALLBACK (gtk_widget_destroy), window);
  gtk_menu_shell_append (GTK_MENU_SHELL (menu), item);
  gtk_menu_item_set_submenu (GTK_MENU_ITEM (file), menu);
  gtk_menu_shell_append (GTK_MENU_SHELL (bar), file);
  gtk_box_pack_start (GTK_BOX (box), bar, FALSE, FALSE, 0);

  label = gtk_label_new ("yellow");
  gtk_box_pack_start (GTK_BOX (box), label, FALSE, FALSE, 4);
  area = gtk_event_box_new ();
  gtk_widget_set_size_request (area, 240, 80);
  gtk_box_pack_start (GTK_BOX (box), area, TRUE, TRUE, 0);
  button = gtk_button_new_with_label ("Magenta");
  g_signal_connect (button, "clicked", G_CALLBACK (paint), "magenta");
  gtk_box_pack_start (GTK_BOX (box), button, FALSE, FALSE, 4);
  paint (NULL, "yellow");

  gtk_widget_show_all (window);
  gtk_main ();
  return 0;
}
