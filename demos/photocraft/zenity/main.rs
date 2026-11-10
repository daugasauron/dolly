//! zenity for Dolly: the dialogs a program asks for by running `zenity`, as rfd does, drawn on the
//! page with egui. Run by a program that holds the page, it takes the page and gives it back when
//! it exits. Prints what GNOME's zenity prints: the chosen paths, `|` between them, or an extra
//! button's label; exits 0 for OK and 1 for Cancel.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use eframe::egui;

#[derive(Default)]
struct Options {
    title: Option<String>,
    text: String,
    message: Option<&'static str>,
    file_selection: bool,
    multiple: bool,
    directory: bool,
    save: bool,
    confirm_overwrite: bool,
    filename: Option<String>,
    filters: Vec<(String, Vec<String>)>,
    ok_label: Option<String>,
    cancel_label: Option<String>,
    extra_buttons: Vec<String>,
}

fn options() -> Result<Options, String> {
    let mut options = Options::default();
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let mut value = || args.next().ok_or_else(|| format!("{arg} needs a value"));
        match arg.as_str() {
            "--no-markup" => {},
            "--file-selection" => options.file_selection = true,
            "--multiple" => options.multiple = true,
            "--directory" => options.directory = true,
            "--save" => options.save = true,
            "--confirm-overwrite" => options.confirm_overwrite = true,
            "--filename" => options.filename = Some(value()?),
            "--file-filter" => options.filters.push(filter(&value()?)),
            "--title" => options.title = Some(value()?),
            "--text" => options.text = value()?,
            "--ok-label" => options.ok_label = Some(value()?),
            "--cancel-label" => options.cancel_label = Some(value()?),
            "--extra-button" => options.extra_buttons.push(value()?),
            "--info" => options.message = Some("info"),
            "--warning" => options.message = Some("warning"),
            "--error" => options.message = Some("error"),
            "--question" => options.message = Some("question"),
            other => return Err(format!("zenity: {other} is not one of Dolly's dialogs")),
        }
    }
    if !options.file_selection && options.message.is_none() {
        return Err("zenity: no dialog named (--file-selection, --info, --warning, --error, --question)".into());
    }
    Ok(options)
}

/// `NAME | *.png *.jpg`, or the patterns alone.
fn filter(text: &str) -> (String, Vec<String>) {
    let (name, patterns) = text.split_once('|').unwrap_or((text, text));
    (name.trim().to_owned(), patterns.split_whitespace().map(str::to_owned).collect())
}

fn matches(patterns: &[String], name: &str) -> bool {
    let name = name.to_lowercase();
    patterns.iter().any(|pattern| match pattern.as_str() {
        "*" | "*.*" => true,
        pattern => match pattern.strip_prefix('*') {
            Some(suffix) => name.ends_with(&suffix.to_lowercase()),
            None => name == pattern.to_lowercase(),
        },
    })
}

struct Entry {
    name: String,
    directory: bool,
}

/// What the dialog answers when it closes.
#[derive(Default)]
struct Answer {
    output: String,
    accepted: bool,
}

struct Dialog {
    options: Options,
    directory: PathBuf,
    entries: Vec<Entry>,
    error: Option<String>,
    selected: Vec<String>,
    name: String,
    filter: usize,
    replacing: Option<PathBuf>,
    answer: Arc<Mutex<Answer>>,
}

impl Dialog {
    fn new(options: Options, answer: Arc<Mutex<Answer>>) -> Self {
        let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));
        let (directory, name) = match options.filename.as_deref().map(Path::new) {
            Some(path) if path.is_dir() => (path.to_path_buf(), String::new()),
            Some(path) => (
                path.parent().filter(|parent| parent.is_dir()).map_or(home, Path::to_path_buf),
                path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default(),
            ),
            None => (std::env::current_dir().unwrap_or(home), String::new()),
        };
        let mut dialog = Self {
            options,
            directory,
            entries: Vec::new(),
            error: None,
            selected: Vec::new(),
            name,
            filter: 0,
            replacing: None,
            answer,
        };
        dialog.read_directory();
        dialog
    }

    fn read_directory(&mut self) {
        self.selected.clear();
        self.entries.clear();
        self.error = None;
        match std::fs::read_dir(&self.directory) {
            Ok(entries) => {
                let patterns = self.options.filters.get(self.filter).map(|(_, patterns)| patterns.clone());
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let directory = entry.path().is_dir();
                    let shown = directory
                        || (!self.options.directory && patterns.as_ref().is_none_or(|p| matches(p, &name)));
                    if shown && !name.starts_with('.') {
                        self.entries.push(Entry { name, directory });
                    }
                }
                self.entries.sort_by(|a, b| b.directory.cmp(&a.directory).then_with(|| a.name.cmp(&b.name)));
            },
            Err(error) => self.error = Some(format!("{}: {error}", self.directory.display())),
        }
    }

    fn enter(&mut self, directory: PathBuf) {
        self.directory = directory;
        self.read_directory();
    }

    fn finish(&mut self, ui: &egui::Ui, accepted: bool, output: String) {
        *self.answer.lock().unwrap() = Answer { output, accepted };
        ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
    }

    /// The paths an OK would answer, if it can.
    fn chosen(&self) -> Option<Vec<PathBuf>> {
        if self.options.save {
            let name = self.name.trim();
            return (!name.is_empty()).then(|| vec![self.directory.join(name)]);
        }
        if self.selected.is_empty() {
            return self.options.directory.then(|| vec![self.directory.clone()]);
        }
        Some(self.selected.iter().map(|name| self.directory.join(name)).collect())
    }

    fn accept(&mut self, ui: &egui::Ui) {
        let Some(paths) = self.chosen() else { return };
        if self.options.confirm_overwrite && self.replacing.is_none() && paths[0].exists() {
            self.replacing = Some(paths[0].clone());
            return;
        }
        let output = paths.iter().map(|path| path.to_string_lossy()).collect::<Vec<_>>().join("|");
        self.finish(ui, true, output);
    }

    fn file_selection(&mut self, ui: &mut egui::Ui) {
        let ok = self.options.ok_label.clone().unwrap_or_else(|| if self.options.save { "Save".into() } else { "Open".into() });
        egui::Panel::bottom("buttons").show(ui, |ui| {
            ui.add_space(6.0);
            if let Some(path) = self.replacing.clone() {
                ui.label(format!("{} exists. Replace it?", path.display()));
            }
            if self.options.save {
                ui.horizontal(|ui| {
                    ui.label("Name:");
                    let edit = ui.add(egui::TextEdit::singleline(&mut self.name).desired_width(f32::INFINITY));
                    if edit.changed() {
                        self.replacing = None;
                    }
                    edit.request_focus();
                });
            }
            ui.horizontal(|ui| {
                if !self.options.filters.is_empty() {
                    let before = self.filter;
                    egui::ComboBox::from_id_salt("filter")
                        .selected_text(self.options.filters[self.filter].0.clone())
                        .show_ui(ui, |ui| {
                            for (index, (name, _)) in self.options.filters.iter().enumerate() {
                                ui.selectable_value(&mut self.filter, index, name);
                            }
                        });
                    if self.filter != before {
                        self.read_directory();
                    }
                }
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let label = if self.replacing.is_some() { "Replace".to_owned() } else { ok };
                    if ui.add_enabled(self.chosen().is_some(), egui::Button::new(label)).clicked() {
                        self.accept(ui);
                    }
                    if ui.button(self.options.cancel_label.as_deref().unwrap_or("Cancel")).clicked() {
                        self.finish(ui, false, String::new());
                    }
                });
            });
            ui.add_space(6.0);
        });
        egui::CentralPanel::default().show(ui, |ui| {
            ui.horizontal(|ui| {
                if ui.button("Up").on_hover_text("The folder above").clicked() {
                    if let Some(parent) = self.directory.parent() {
                        self.enter(parent.to_path_buf());
                    }
                }
                if ui.button("Home").clicked() {
                    if let Some(home) = std::env::var_os("HOME") {
                        self.enter(PathBuf::from(home));
                    }
                }
                ui.label(self.directory.display().to_string());
            });
            ui.separator();
            if let Some(error) = &self.error {
                ui.colored_label(ui.visuals().error_fg_color, error);
            }
            let mut entered = None;
            let mut accepted = false;
            egui::ScrollArea::vertical().auto_shrink(false).show(ui, |ui| {
                for entry in &self.entries {
                    let selected = self.selected.contains(&entry.name);
                    let label = if entry.directory { format!("{}/", entry.name) } else { entry.name.clone() };
                    let response = ui.selectable_label(selected, label);
                    if response.double_clicked() {
                        if entry.directory {
                            entered = Some(self.directory.join(&entry.name));
                        } else {
                            self.selected = vec![entry.name.clone()];
                            accepted = true;
                        }
                    } else if response.clicked() && (!entry.directory || self.options.directory) {
                        let multiple = self.options.multiple && ui.input(|input| input.modifiers.command);
                        if !multiple {
                            self.selected.clear();
                        }
                        if selected && multiple {
                            self.selected.retain(|name| name != &entry.name);
                        } else {
                            self.selected.push(entry.name.clone());
                        }
                        if self.options.save {
                            self.name = entry.name.clone();
                            self.replacing = None;
                        }
                    }
                }
            });
            if let Some(directory) = entered {
                self.enter(directory);
            }
            if accepted {
                if self.options.save {
                    self.name = self.selected[0].clone();
                }
                self.accept(ui);
            }
        });
    }

    fn message(&mut self, ui: &mut egui::Ui, kind: &str) {
        egui::Panel::bottom("buttons").show(ui, |ui| {
            ui.add_space(6.0);
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                let ok = self.options.ok_label.clone().unwrap_or_else(|| if kind == "question" { "Yes".into() } else { "OK".into() });
                if ui.button(ok).clicked() {
                    self.finish(ui, true, String::new());
                }
                for extra in self.options.extra_buttons.clone() {
                    if ui.button(&extra).clicked() {
                        self.finish(ui, false, extra);
                    }
                }
                if kind == "question" && ui.button(self.options.cancel_label.as_deref().unwrap_or("No")).clicked() {
                    self.finish(ui, false, String::new());
                }
            });
            ui.add_space(6.0);
        });
        egui::CentralPanel::default().show(ui, |ui| {
            if let Some(title) = &self.options.title {
                ui.heading(title);
            }
            ui.label(&self.options.text);
        });
    }
}

impl eframe::App for Dialog {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        if ui.input(|input| input.key_pressed(egui::Key::Escape)) {
            self.finish(ui, false, String::new());
            return;
        }
        match self.options.message {
            Some(kind) => self.message(ui, kind),
            None => {
                if ui.input(|input| input.key_pressed(egui::Key::Enter)) {
                    self.accept(ui);
                }
                self.file_selection(ui);
            },
        }
    }
}

fn main() {
    let options = match options() {
        Ok(options) => options,
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        },
    };
    let title = options.title.clone().unwrap_or_else(|| "zenity".into());
    let answer = Arc::new(Mutex::new(Answer::default()));
    let dialog = Dialog::new(options, answer.clone());
    let native = eframe::NativeOptions { renderer: eframe::Renderer::Wgpu, ..Default::default() };
    if let Err(error) = eframe::run_native(&title, native, Box::new(|_| Ok(Box::new(dialog)))) {
        eprintln!("zenity: {error}");
        std::process::exit(2);
    }
    let answer = answer.lock().unwrap();
    if !answer.output.is_empty() {
        println!("{}", answer.output);
    }
    std::process::exit(if answer.accepted { 0 } else { 1 });
}
