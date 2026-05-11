#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rodio::{Decoder, OutputStream, Sink};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_cron_scheduler::{Job, JobScheduler};
use uuid::Uuid;
use warp::Filter;

// 定时任务结构
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ScheduleTask {
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

// 应用状态
struct AppState {
    tasks: HashMap<String, ScheduleTask>,
    audio_dir: PathBuf,
    data_dir: PathBuf,
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

        AppState {
            tasks: HashMap::new(),
            audio_dir,
            data_dir,
        }
    }

    fn save_tasks(&self) {
        let tasks: Vec<&ScheduleTask> = self.tasks.values().collect();
        let json = serde_json::to_string_pretty(&tasks).unwrap_or_default();
        fs::write(self.data_dir.join("tasks.json"), json).ok();
    }

    fn load_tasks(&mut self) {
        if let Ok(content) = fs::read_to_string(self.data_dir.join("tasks.json")) {
            if let Ok(tasks) = serde_json::from_str::<Vec<ScheduleTask>>(&content) {
                for task in tasks {
                    self.tasks.insert(task.id.clone(), task);
                }
            }
        }
    }
}

// 获取本地 IP 地址
#[tauri::command]
fn get_local_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

// 获取音频文件列表
#[tauri::command]
async fn get_audio_files(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> Result<Vec<String>, String> {
    let state = state.lock().await;
    let mut files = Vec::new();

    if let Ok(entries) = fs::read_dir(&state.audio_dir) {
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
    Ok(files)
}

// 获取所有任务
#[tauri::command]
async fn get_tasks(state: tauri::State<'_, Arc<Mutex<AppState>>>) -> Result<Vec<ScheduleTask>, String> {
    let state = state.lock().await;
    Ok(state.tasks.values().cloned().collect())
}

// 添加任务
#[tauri::command]
async fn add_task(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    task: ScheduleTask,
) -> Result<ScheduleTask, String> {
    let mut state = state.lock().await;
    let id = Uuid::new_v4().to_string();
    let mut task = task;
    task.id = id.clone();
    state.tasks.insert(id, task.clone());
    state.save_tasks();
    Ok(task)
}

// 更新任务
#[tauri::command]
async fn update_task(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    task: ScheduleTask,
) -> Result<ScheduleTask, String> {
    let mut state = state.lock().await;
    if state.tasks.contains_key(&task.id) {
        state.tasks.insert(task.id.clone(), task.clone());
        state.save_tasks();
        Ok(task)
    } else {
        Err("任务不存在".to_string())
    }
}

// 删除任务
#[tauri::command]
async fn delete_task(
    state: tauri::State<'_, Arc<Mutex<AppState>>>,
    task_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.tasks.remove(&task_id);
    state.save_tasks();
    Ok(())
}

// 播放音频
#[tauri::command]
fn play_audio(audio_dir: String, filename: String) -> Result<(), String> {
    let audio_path = PathBuf::from(&audio_dir).join(&filename);

    if !audio_path.exists() {
        return Err(format!("音频文件不存在: {}", filename));
    }

    std::thread::spawn(move || {
        if let Ok(file) = File::open(&audio_path) {
            let reader = BufReader::new(file);
            if let Ok(source) = Decoder::new(BufReader::new(File::open(&audio_path).unwrap())) {
                if let Ok((_stream, stream_handle)) = OutputStream::try_default() {
                    if let Ok(sink) = Sink::try_new(&stream_handle) {
                        sink.append(source);
                        sink.play();
                        sink.sleep_until_end();
                    }
                }
            }
        }
    });

    Ok(())
}

// 停止播放
#[tauri::command]
fn stop_audio() -> Result<(), String> {
    Ok(())
}

// 启动 Web 服务器
async fn start_web_server(state: Arc<Mutex<AppState>>) {
    let port = 8765;

    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["Content-Type"])
        .allow_methods(vec!["GET", "POST", "DELETE", "PUT"]);

    let get_tasks_route = warp::path("api")
        .and(warp::path("tasks"))
        .and(warp::get())
        .and_then({
            let state = state.clone();
            move || {
                let state = state.clone();
                async move {
                    let state = state.lock().await;
                    let tasks: Vec<&ScheduleTask> = state.tasks.values().collect();
                    Ok::<_, warp::Rejection>(warp::reply::json(&tasks))
                }
            }
        });

    let get_audio_route = warp::path("api")
        .and(warp::path("audio"))
        .and(warp::get())
        .and_then({
            let state = state.clone();
            move || {
                let state = state.clone();
                async move {
                    let state = state.lock().await;
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
                    Ok::<_, warp::Rejection>(warp::reply::json(&files))
                }
            }
        });

    let routes = get_tasks_route.or(get_audio_route).with(cors);

    println!("Web 服务器启动: http://0.0.0.0:{}", port);
    warp::serve(routes).run(([0, 0, 0, 0], port)).await;
}

#[tokio::main]
async fn main() {
    let app_state = Arc::new(Mutex::new(AppState::new()));

    {
        let mut state = app_state.lock().await;
        state.load_tasks();
    }

    // 启动 Web 服务器
    let web_state = app_state.clone();
    tokio::spawn(async move {
        start_web_server(web_state).await;
    });

    // 启动定时调度器 - 使用正确的异步API
    let scheduler_state = app_state.clone();
    tokio::spawn(async move {
        match JobScheduler::new().await {
            Ok(sched) => {
                let job = Job::new("0 * * * * *", |_uuid, _l| {
                    println!("定时任务检查运行中...");
                }).unwrap();

                if let Err(e) = sched.add(job).await {
                    eprintln!("Failed to add job: {}", e);
                    return;
                }

                if let Err(e) = sched.start().await {
                    eprintln!("Failed to start scheduler: {}", e);
                }
            }
            Err(e) => {
                eprintln!("Failed to create scheduler: {}", e);
            }
        }
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
