#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rodio::{Decoder, OutputStream, Sink};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::State;
use uuid::Uuid;

enum AudioCmd {
    Play(String, PathBuf),
    Stop(Option<String>),
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleTask {
    id: String,
    name: String,
    audio_file: String,
    start_time: String,
    end_time: Option<String>,
    duration: Option<u32>,
    weekdays: Vec<u8>,
    volume: u8,
    enabled: bool,
}

struct AppState {
    tasks: Mutex<HashMap<String, ScheduleTask>>,
    audio_dir: PathBuf,
    data_dir: PathBuf,
    #[allow(dead_code)]
    audio_tx: Sender<AudioCmd>,
}

impl AppState {
    fn new() -> Self {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_else(|| PathBuf::from("."));

        let audio_dir = exe_dir.join("audio");
        let data_dir = exe_dir.join("data");

        fs::create_dir_all(&audio_dir).ok();
        fs::create_dir_all(&data_dir).ok();

        let (tx, rx) = mpsc::channel::<AudioCmd>();
        thread::spawn(move || {
            let Some((_stream, stream_handle)) = OutputStream::try_default().ok() else { return; };
            let mut sinks: HashMap<String, Sink> = HashMap::new();

            loop {
                match rx.recv() {
                    Ok(AudioCmd::Play(filename, path)) => {
                        if let Ok(file) = File::open(&path) {
                            let reader = BufReader::new(file);
                            if let Ok(source) = Decoder::new(reader) {
                                sinks.remove(&filename);
                                if let Ok(sink) = Sink::try_new(&stream_handle) {
                                    sink.append(source);
                                    sink.play();
                                    sinks.insert(filename.clone(), sink);
                                }
                            }
                        }
                    }
                    Ok(AudioCmd::Stop(Some(filename))) => {
                        sinks.remove(&filename);
                    }
                    Ok(AudioCmd::Stop(None)) => {
                        sinks.clear();
                    }
                    Ok(AudioCmd::Shutdown) | Err(_) => {
                        sinks.clear();
                        break;
                    }
                }
            }
        });

        AppState {
            tasks: Mutex::new(HashMap::new()),
            audio_dir,
            data_dir,
            audio_tx: tx,
        }
    }

    fn save_tasks(&self) {
        let tasks: Vec<ScheduleTask> = self.tasks.lock().unwrap().values().cloned().collect();
        let json = serde_json::to_string_pretty(&tasks).unwrap_or_default();
        fs::write(self.data_dir.join("tasks.json"), json).ok();
    }

    fn load_tasks(&self) {
        if let Ok(content) = fs::read_to_string(self.data_dir.join("tasks.json")) {
            if let Ok(tasks) = serde_json::from_str::<Vec<ScheduleTask>>(&content) {
                let mut t = self.tasks.lock().unwrap();
                for task in tasks {
                    t.insert(task.id.clone(), task);
                }
            }
        }
    }
}

#[tauri::command]
fn get_local_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

#[tauri::command]
fn get_audio_files(state: State<'_, Arc<AppState>>) -> Vec<String> {
    let mut files = Vec::new();
    let audio_dir = state.audio_dir.clone();
    drop(state);
    if let Ok(entries) = fs::read_dir(&audio_dir) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                if ext == "mp3" || ext == "wav" || ext == "m4a" || ext == "ogg" || ext == "flac" {
                    if let Some(name) = entry.file_name().into_string().ok() {
                        files.push(name);
                    }
                }
            }
        }
    }
    files.sort();
    files
}

#[tauri::command]
fn get_tasks(state: State<'_, Arc<AppState>>) -> Vec<ScheduleTask> {
    state.tasks.lock().unwrap().values().cloned().collect()
}

#[tauri::command]
fn add_task(state: State<'_, Arc<AppState>>, task: ScheduleTask) -> ScheduleTask {
    let mut task = task;
    task.id = Uuid::new_v4().to_string();
    state.tasks.lock().unwrap().insert(task.id.clone(), task.clone());
    state.save_tasks();
    task
}

#[tauri::command]
fn update_task(state: State<'_, Arc<AppState>>, task: ScheduleTask) -> Result<ScheduleTask, String> {
    let mut tasks = state.tasks.lock().unwrap();
    if tasks.contains_key(&task.id) {
        tasks.insert(task.id.clone(), task.clone());
        drop(tasks);
        state.save_tasks();
        Ok(task)
    } else {
        Err("任务不存在".to_string())
    }
}

#[tauri::command]
fn delete_task(state: State<'_, Arc<AppState>>, task_id: String) -> Result<(), String> {
    state.tasks.lock().unwrap().remove(&task_id);
    state.save_tasks();
    Ok(())
}

#[tauri::command]
fn play_audio(state: State<'_, Arc<AppState>>, filename: String) -> Result<(), String> {
    let audio_path = state.audio_dir.join(&filename);
    if !audio_path.exists() {
        return Err(format!("音频文件不存在: {}", filename));
    }
    state.audio_tx.send(AudioCmd::Play(filename, audio_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn stop_audio(state: State<'_, Arc<AppState>>, filename: Option<String>) -> Result<(), String> {
    state.audio_tx.send(AudioCmd::Stop(filename)).map_err(|e| e.to_string())
}

fn main() {
    let app_state = Arc::new(AppState::new());
    app_state.load_tasks();

    // Start web server in a separate thread
    let web_state = app_state.clone();
    thread::spawn(move || {
        start_web_server(web_state);
    });

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_local_ip,
            get_audio_files,
            get_tasks,
            add_task,
            update_task,
            delete_task,
            play_audio,
            stop_audio
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn start_web_server(state: Arc<AppState>) {
    use std::net::TcpListener;
    use std::io::{Read, Write};

    let port = 8765;
    if let Ok(listener) = TcpListener::bind(format!("0.0.0.0:{}", port)) {
        println!("Web 服务器启动: http://0.0.0.0:{}", port);
        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                let mut buffer = [0; 8192];
                if let Ok(_) = stream.read(&mut buffer) {
                    let request = String::from_utf8_lossy(&buffer);
                    let path = request.lines().next().unwrap_or("");
                    let path = path.split_whitespace().nth(1).unwrap_or("/");

                    let (status, content) = if path == "/api/tasks" {
                        let tasks: Vec<ScheduleTask> = state.tasks.lock().unwrap().values().cloned().collect();
                        let json = serde_json::to_string(&tasks).unwrap_or_default();
                        ("HTTP/1.1 200 OK", json)
                    } else if path == "/api/audio" {
                        let mut files = Vec::new();
                        if let Ok(entries) = fs::read_dir(&state.audio_dir) {
                            for entry in entries.flatten() {
                                if let Some(ext) = entry.path().extension() {
                                    if ext == "mp3" || ext == "wav" || ext == "m4a" {
                                        if let Some(name) = entry.file_name().into_string().ok() {
                                            files.push(name);
                                        }
                                    }
                                }
                            }
                        }
                        files.sort();
                        let json = serde_json::to_string(&files).unwrap_or_default();
                        ("HTTP/1.1 200 OK", json)
                    } else {
                        ("HTTP/1.1 404 Not Found", "Not Found".to_string())
                    };

                    let response = format!(
                        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                        status,
                        content.len(),
                        content
                    );
                    let _ = stream.write_all(response.as_bytes());
                }
            }
        }
    }
}