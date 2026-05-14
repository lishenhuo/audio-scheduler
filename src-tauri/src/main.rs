#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::self;
use std::path::PathBuf;
use std::sync::Mutex;

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
    tasks: Mutex<HashMap<String, ScheduleTask>>,
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
            tasks: Mutex::new(HashMap::new()),
            audio_dir,
            data_dir,
        }
    }

    fn save_tasks(&self) {
        if let Ok(tasks) = self.tasks.lock() {
            let tasks_vec: Vec<&ScheduleTask> = tasks.values().collect();
            let json = serde_json::to_string_pretty(&tasks_vec).unwrap_or_default();
            fs::write(self.data_dir.join("tasks.json"), json).ok();
        }
    }

    fn load_tasks(&self) {
        if let Ok(mut tasks) = self.tasks.lock() {
            if let Ok(content) = fs::read_to_string(self.data_dir.join("tasks.json")) {
                if let Ok(loaded_tasks) = serde_json::from_str::<Vec<ScheduleTask>>(&content) {
                    for task in loaded_tasks {
                        tasks.insert(task.id.clone(), task);
                    }
                }
            }
        }
    }
}

// 获取本地 IP 地址
#[tauri::command]
fn get_local_ip() -> String {
    // 简化版，直接返回本机地址
    "127.0.0.1".to_string()
}

// 获取音频文件列表
#[tauri::command]
fn get_audio_files(state: tauri::State<AppState>) -> Result<Vec<String>, String> {
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
fn get_tasks(state: tauri::State<AppState>) -> Result<Vec<ScheduleTask>, String> {
    if let Ok(tasks) = state.tasks.lock() {
        Ok(tasks.values().cloned().collect())
    } else {
        Ok(Vec::new())
    }
}

// 添加任务
#[tauri::command]
fn add_task(state: tauri::State<AppState>, task: ScheduleTask) -> Result<ScheduleTask, String> {
    if let Ok(mut tasks) = state.tasks.lock() {
        let id = format!("task_{}", chrono::Utc::now().timestamp_millis());
        let mut task = task;
        task.id = id.clone();
        tasks.insert(id, task.clone());
        drop(tasks);
        state.save_tasks();
        Ok(task)
    } else {
        Err("无法获取锁".to_string())
    }
}

// 更新任务
#[tauri::command]
fn update_task(state: tauri::State<AppState>, task: ScheduleTask) -> Result<ScheduleTask, String> {
    if let Ok(mut tasks) = state.tasks.lock() {
        if tasks.contains_key(&task.id) {
            tasks.insert(task.id.clone(), task.clone());
            drop(tasks);
            state.save_tasks();
            Ok(task)
        } else {
            Err("任务不存在".to_string())
        }
    } else {
        Err("无法获取锁".to_string())
    }
}

// 删除任务
#[tauri::command]
fn delete_task(state: tauri::State<AppState>, task_id: String) -> Result<(), String> {
    if let Ok(mut tasks) = state.tasks.lock() {
        tasks.remove(&task_id);
        drop(tasks);
        state.save_tasks();
        Ok(())
    } else {
        Err("无法获取锁".to_string())
    }
}

// 播放音频（简化版，不播放实际音频，只返回成功）
#[tauri::command]
fn play_audio(filename: String) -> Result<(), String> {
    println!("播放音频: {}", filename);
    Ok(())
}

// 停止播放
#[tauri::command]
fn stop_audio() -> Result<(), String> {
    println!("停止播放");
    Ok(())
}

fn main() {
    let app_state = AppState::new();
    app_state.load_tasks();

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
        .expect("运行音频定时播放器失败");
}
