import express from 'express';
import cors from 'cors';
import { scheduleJob } from 'node-schedule';
import player from 'play-sound';
import fs from 'fs';
import path from 'path';
import os from 'os';

const app = express();
const PORT = 8765;

app.use(cors());
app.use(express.json());

// 配置文件路径
const CONFIG_FILE = path.join(os.homedir(), '.audio-scheduler-config.json');
const DATA_DIR = path.join(os.homedir(), '.audio-scheduler-data');

// 确保数据目录存在
fs.mkdirSync(DATA_DIR, { recursive: true });

// 内存状态
let tasks = [];
let config = {
  audioFolder: '', // 用户选择的音频文件夹路径
};
const runningJobs = new Map();
const activePlaybacks = new Map();
const audioPlayer = player({});

// 间隔时间选项
const INTERVAL_OPTIONS = {
  'none': 0,
  '1m': 60 * 1000,
  '3m': 3 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '20m': 20 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
};

// 加载配置
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      config = { ...config, ...saved };
      console.log('✅ 配置已加载');
    } catch (e) {
      console.log('⚠️  配置文件加载失败，使用默认配置');
    }
  }
}

// 保存配置
function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log('💾 配置已保存');
}

// 加载任务
function loadTasks() {
  const tasksFile = path.join(DATA_DIR, 'tasks.json');
  if (fs.existsSync(tasksFile)) {
    try {
      tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
    } catch (e) {
      tasks = [];
    }
  }
  return tasks;
}

// 保存任务
function saveTasks() {
  const tasksFile = path.join(DATA_DIR, 'tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
}

// 播放单个音频
function playSingleAudio(filepath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filepath)) {
      console.error('音频文件不存在:', filepath);
      resolve(false);
      return;
    }

    console.log('🎵 播放:', path.basename(filepath));
    const playback = audioPlayer.play(filepath, (err) => {
      if (err) {
        console.error('播放错误:', err);
        resolve(false);
      } else {
        resolve(true);
      }
    });

    playback.on('close', () => {
      resolve(true);
    });
  });
}

// 循环播放音频列表
async function playAudioList(taskId, audioFiles, folder, intervalKey, endTime) {
  console.log('🎶 开始播放列表，任务ID:', taskId, '共', audioFiles.length, '个音频');

  const [endHour, endMin] = endTime.split(':').map(Number);
  const intervalMs = INTERVAL_OPTIONS[intervalKey] || 0;

  let audioIndex = 0;

  while (true) {
    // 检查是否应该停止
    const now = new Date();
    const currentTotal = now.getHours() * 60 + now.getMinutes();
    let endTotal = endHour * 60 + endMin;

    if (endHour < now.getHours() || (endHour === now.getHours() && endMin < now.getMinutes())) {
      endTotal += 24 * 60;
    }

    if (!activePlaybacks.has(taskId)) {
      console.log('⏹️ 任务已停止');
      break;
    }

    if (currentTotal >= endTotal) {
      console.log('⏰ 到达结束时间，停止播放');
      break;
    }

    // 播放当前音频
    const audioPath = path.join(folder, audioFiles[audioIndex]);
    await playSingleAudio(audioPath);

    if (!activePlaybacks.has(taskId)) break;

    // 下一个音频
    audioIndex = (audioIndex + 1) % audioFiles.length;

    // 间隔等待
    if (intervalMs > 0 && audioFiles.length > 0) {
      console.log('⏱️ 等待间隔:', intervalMs / 1000, '秒');
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  activePlaybacks.delete(taskId);
  console.log('✅ 播放任务结束:', taskId);
}

// 启动播放任务
function startPlayTask(task) {
  if (activePlaybacks.has(task.id)) {
    activePlaybacks.delete(task.id);
  }

  activePlaybacks.set(task.id, true);

  playAudioList(task.id, task.audio_files, config.audioFolder, task.play_interval, task.end_time);
}

// 调度任务
function scheduleTask(task) {
  if (runningJobs.has(task.id)) {
    runningJobs.get(task.id).cancel();
  }

  if (!task.enabled || !config.audioFolder) {
    return;
  }

  const [hour, minute] = task.start_time.split(':').map(Number);
  const weekdays = task.weekdays.map(d => d === 0 ? 0 : d);

  console.log('📅 调度任务:', task.name, task.start_time, '-', task.end_time);

  const job = scheduleJob(
    { hour, minute, dayOfWeek: weekdays },
    () => {
      console.log('⏰ 触发定时任务:', task.name, new Date().toLocaleString());
      startPlayTask(task);
    }
  );

  runningJobs.set(task.id, job);
}

// 初始化
function initScheduler() {
  loadConfig();
  loadTasks();
  tasks.forEach(task => scheduleTask(task));
  console.log('✅ 调度器初始化完成，共', tasks.length, '个任务');
}

// ========== API 接口 ==========

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

// 获取配置
app.get('/api/config', (req, res) => {
  res.json({
    audioFolder: config.audioFolder,
  });
});

// 设置音频文件夹
app.post('/api/folder', (req, res) => {
  const { folderPath } = req.body;

  if (!folderPath || !fs.existsSync(folderPath)) {
    return res.status(400).json({ error: '文件夹不存在' });
  }

  config.audioFolder = folderPath;
  saveConfig();

  // 重新调度所有任务
  tasks.forEach(task => scheduleTask(task));

  res.json({ success: true, audioFolder: folderPath });
});

// 扫描音频文件
app.get('/api/audio', (req, res) => {
  if (!config.audioFolder || !fs.existsSync(config.audioFolder)) {
    return res.json([]);
  }

  try {
    const files = fs.readdirSync(config.audioFolder).filter(file =>
      /\.(mp3|wav|m4a|ogg|flac|aac|wma)$/i.test(file)
    );
    res.json(files);
  } catch (e) {
    res.json([]);
  }
});

// 获取任务
app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

// 添加任务
app.post('/api/tasks', (req, res) => {
  const task = {
    id: Date.now().toString(),
    ...req.body,
    enabled: req.body.enabled ?? true,
  };
  tasks.push(task);
  saveTasks();
  scheduleTask(task);
  res.json(task);
});

// 更新任务
app.put('/api/tasks/:id', (req, res) => {
  const index = tasks.findIndex(t => t.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: '任务不存在' });
  }

  if (activePlaybacks.has(req.params.id)) {
    activePlaybacks.delete(req.params.id);
  }

  tasks[index] = { ...tasks[index], ...req.body };
  saveTasks();
  scheduleTask(tasks[index]);
  res.json(tasks[index]);
});

// 删除任务
app.delete('/api/tasks/:id', (req, res) => {
  const id = req.params.id;

  if (activePlaybacks.has(id)) {
    activePlaybacks.delete(id);
  }

  if (runningJobs.has(id)) {
    runningJobs.get(id).cancel();
    runningJobs.delete(id);
  }

  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  res.json({ success: true });
});

// 立即播放测试
app.post('/api/play/:filename', async (req, res) => {
  if (!config.audioFolder) {
    return res.status(400).json({ error: '请先选择音频文件夹' });
  }

  const filename = decodeURIComponent(req.params.filename);
  const filepath = path.join(config.audioFolder, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const playback = audioPlayer.play(filepath);
  setTimeout(() => {
    playback.kill();
  }, 10000);

  res.json({ success: true, message: '测试播放 10 秒' });
});

// 获取本机 IP
app.get('/api/ip', (req, res) => {
  res.json({ ip: getLocalIp() });
});

// 提供前端静态文件
app.use(express.static(path.join(path.dirname(new URL(import.meta.url).pathname), 'dist')));

app.get('/', (req, res) => {
  res.sendFile(path.join(path.dirname(new URL(import.meta.url).pathname), 'dist', 'index.html'));
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n' + '='.repeat(50));
  console.log('🎵 音频定时播放器 - 后端服务已启动');
  console.log('='.repeat(50));
  console.log('📱 手机访问地址:');
  console.log(`   http://${getLocalIp()}:${PORT}`);
  console.log('💻 本地访问:');
  console.log(`   http://localhost:${PORT}`);
  console.log('📁 配置文件:');
  console.log(`   ${CONFIG_FILE}`);
  if (config.audioFolder) {
    console.log('📁 当前音频文件夹:');
    console.log(`   ${config.audioFolder}`);
  }
  console.log('='.repeat(50) + '\n');

  initScheduler();
});
