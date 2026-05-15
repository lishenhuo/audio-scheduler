import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ScheduleTask {
  id: string;
  name: string;
  audio_file: string;
  start_time: string;
  end_time: string | null;
  duration: number | null;
  weekdays: number[];
  volume: number;
  enabled: boolean;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

function App() {
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<ScheduleTask | null>(null);
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [formData, setFormData] = useState({
    name: '',
    audio_file: '',
    start_time: '08:00',
    end_time: '',
    duration: 60,
    weekdays: [1, 2, 3, 4, 5],
    volume: 80,
    enabled: true,
  });

  // 更新当前时间
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 加载数据
  const loadData = useCallback(async () => {
    try {
      const [files, taskList] = await Promise.all([
        invoke<string[]>('get_audio_files'),
        invoke<ScheduleTask[]>('get_tasks'),
      ]);
      setAudioFiles(files);
      setTasks(taskList);
      setLoading(false);
    } catch (e) {
      console.error('加载数据失败:', e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 打开添加/编辑弹窗
  const openModal = (task?: ScheduleTask) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        name: task.name,
        audio_file: task.audio_file,
        start_time: task.start_time,
        end_time: task.end_time || '',
        duration: task.duration || 60,
        weekdays: task.weekdays,
        volume: task.volume,
        enabled: task.enabled,
      });
    } else {
      setEditingTask(null);
      setFormData({
        name: '',
        audio_file: audioFiles[0] || '',
        start_time: '08:00',
        end_time: '',
        duration: 60,
        weekdays: [1, 2, 3, 4, 5],
        volume: 80,
        enabled: true,
      });
    }
    setShowModal(true);
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      alert('请输入任务名称');
      return;
    }
    if (!formData.audio_file) {
      alert('请选择音频文件');
      return;
    }

    try {
      const taskData: Partial<ScheduleTask> = {
        ...formData,
        name: formData.name.trim(),
        end_time: formData.end_time || null,
      };

      if (editingTask) {
        await invoke('update_task', { task: { ...taskData, id: editingTask.id } });
        alert('✅ 任务更新成功！');
      } else {
        await invoke('add_task', { task: taskData });
        alert('✅ 任务添加成功！');
      }

      setShowModal(false);
      loadData();
    } catch (e) {
      alert('❌ 操作失败: ' + e);
    }
  };

  // 删除任务
  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个任务吗？')) {
      try {
        await invoke('delete_task', { taskId: id });
        loadData();
      } catch (e) {
        alert('删除失败');
      }
    }
  };

  // 切换任务启用状态
  const handleToggleEnabled = async (task: ScheduleTask) => {
    try {
      await invoke('update_task', {
        task: { ...task, enabled: !task.enabled },
      });
      loadData();
    } catch (e) {
      alert('更新失败');
    }
  };

  // 播放音频
  const handlePlay = async (filename: string) => {
    try {
      await invoke('play_audio', { filename });
      setPlayingFile(filename);
    } catch (e) {
      alert('播放失败');
    }
  };

  // 停止播放
  const handleStop = async () => {
    try {
      await invoke('stop_audio');
      setPlayingFile(null);
    } catch (e) {
      alert('停止失败');
    }
  };

  // 切换星期选择
  const toggleWeekday = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort(),
    }));
  };

  // 检查任务是否即将执行
  const isTaskSoon = (task: ScheduleTask) => {
    if (!task.enabled) return false;
    const now = new Date();
    const [h, m] = task.start_time.split(':').map(Number);
    const taskTime = new Date(now);
    taskTime.setHours(h, m, 0, 0);
    const diff = taskTime.getTime() - now.getTime();
    return diff > 0 && diff <= 5 * 60 * 1000;
  };

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">🎵 正在加载...</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800">
      {/* 顶部导航 */}
      <header className="bg-white/10 backdrop-blur-xl border-b border-white/20 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30">
                <span className="text-2xl">🎵</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">音频定时播放器</h1>
                <p className="text-white/60 text-sm">本地运行 · 无需网络</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-white">
                <p className="text-2xl font-mono font-bold">
                  {currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-sm text-white/60">
                  {currentTime.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
                </p>
              </div>
              <button
                onClick={() => openModal()}
                className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white px-5 py-3 rounded-xl font-medium shadow-lg shadow-purple-500/30 transition-all hover:scale-105 active:scale-95"
              >
                <span className="text-xl">+</span>
                <span>添加任务</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm">总任务数</p>
                <p className="text-3xl font-bold text-white mt-1">{tasks.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <span className="text-2xl">📋</span>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm">运行中</p>
                <p className="text-3xl font-bold text-green-400 mt-1">
                  {tasks.filter((t) => t.enabled).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm">音频文件</p>
                <p className="text-3xl font-bold text-pink-400 mt-1">{audioFiles.length}</p>
              </div>
              <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🎶</span>
              </div>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm">即将执行</p>
                <p className="text-3xl font-bold text-yellow-400 mt-1">
                  {tasks.filter((t) => isTaskSoon(t)).length}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center">
                <span className="text-2xl">⏰</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* 任务列表 */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span>📋</span> 定时任务
              </h2>
            </div>

            {tasks.length === 0 ? (
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-16 border border-white/20 text-center">
                <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl">⏰</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">还没有定时任务</h3>
                <p className="text-white/60 mb-6">点击右上角按钮创建你的第一个定时播放任务</p>
                <button
                  onClick={() => openModal()}
                  className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:from-pink-600 hover:to-purple-700 transition-all"
                >
                  创建第一个任务
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`bg-white/10 backdrop-blur-xl rounded-2xl p-6 border transition-all hover:scale-[1.01] ${
                      isTaskSoon(task)
                        ? 'border-yellow-400/50 shadow-lg shadow-yellow-500/20'
                        : 'border-white/20 hover:border-white/30'
                    } ${!task.enabled ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="text-lg font-bold text-white">{task.name}</h3>
                          {isTaskSoon(task) && (
                            <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full animate-pulse">
                              即将执行
                            </span>
                          )}
                          {!task.enabled && (
                            <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs rounded-full">
                              已暂停
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-2 text-white/80">
                            <span className="text-lg">🎵</span>
                            <span className="max-w-48 truncate">{task.audio_file}</span>
                          </div>
                          <div className="flex items-center gap-2 text-white/80">
                            <span className="text-lg">🕐</span>
                            <span className="font-mono">{task.start_time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-white/80">
                            <span className="text-lg">🔊</span>
                            <span>{task.volume}%</span>
                          </div>
                        </div>

                        <div className="mt-3 flex gap-1">
                          {WEEKDAYS.map((day, i) => (
                            <span
                              key={day}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium transition-all ${
                                task.weekdays.includes(i)
                                  ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white'
                                  : 'bg-white/10 text-white/40'
                              }`}
                            >
                              {day.slice(1)}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        <button
                          onClick={() => openModal(task)}
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition-all flex items-center gap-2"
                        >
                          ✏️ 编辑
                        </button>
                        <button
                          onClick={() => handleToggleEnabled(task)}
                          className={`px-4 py-2 rounded-xl text-sm transition-all flex items-center gap-2 ${
                            task.enabled
                              ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400'
                              : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                          }`}
                        >
                          {task.enabled ? '⏸️ 暂停' : '▶️ 启用'}
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-sm transition-all flex items-center gap-2"
                        >
                          🗑️ 删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右侧面板 */}
          <div className="space-y-6">
            {/* 音频文件 */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span>🎶</span> 音频文件
              </h2>

              {audioFiles.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">📁</span>
                  </div>
                  <p className="text-white/60 text-sm">audio 文件夹为空</p>
                  <p className="text-white/40 text-xs mt-1">
                    将音频文件放入应用目录下的 audio 文件夹
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                  {audioFiles.map((file) => (
                    <div
                      key={file}
                      className="group flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            playingFile === file
                              ? 'bg-gradient-to-br from-pink-500 to-purple-600'
                              : 'bg-white/10'
                          }`}
                        >
                          {playingFile === file ? (
                            <span className="text-white animate-pulse">▶️</span>
                          ) : (
                            <span className="text-white/60">🎵</span>
                          )}
                        </div>
                        <span className="text-white/80 text-sm truncate flex-1">{file}</span>
                      </div>
                      <button
                        onClick={() => (playingFile === file ? handleStop() : handlePlay(file))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all opacity-0 group-hover:opacity-100 ${
                          playingFile === file
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                        }`}
                      >
                        {playingFile === file ? '停止' : '播放'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {playingFile && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="w-1 bg-gradient-to-t from-pink-500 to-purple-500 rounded-full animate-pulse"
                            style={{
                              height: `${Math.random() * 16 + 8}px`,
                              animationDelay: `${i * 0.1}s`,
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-white/80 text-sm">正在播放</span>
                    </div>
                    <button
                      onClick={handleStop}
                      className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-all"
                    >
                      ⏹️ 停止
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 使用提示 */}
            <div className="bg-gradient-to-br from-pink-500/20 to-purple-600/20 backdrop-blur-xl rounded-2xl p-6 border border-pink-500/30">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span>💡</span> 使用提示
              </h2>
              <div className="space-y-3 text-sm text-white/70">
                <div className="flex items-start gap-3">
                  <span className="text-pink-400">1.</span>
                  <span>将 mp3、wav、m4a 等音频文件放入 audio 文件夹</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-pink-400">2.</span>
                  <span>创建定时任务，设置播放时间和星期</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-pink-400">3.</span>
                  <span>任务数据保存在 data/tasks.json</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 添加/编辑任务弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden border border-white/10">
            {/* 弹窗头部 */}
            <div className="px-8 py-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">
                  {editingTask ? '✏️ 编辑任务' : '➕ 新建定时任务'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white/60 hover:text-white flex items-center justify-center transition-all"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 弹窗内容 */}
            <div className="p-8 overflow-y-auto">
              <div className="space-y-6">
                {/* 任务名称 */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    任务名称
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例如：早上上班提醒"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-pink-500/50 focus:ring-2 focus:ring-pink-500/20 transition-all"
                  />
                </div>

                {/* 音频选择 */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    选择音频文件
                  </label>
                  <select
                    value={formData.audio_file}
                    onChange={(e) => setFormData({ ...formData, audio_file: e.target.value })}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-pink-500/50 focus:ring-2 focus:ring-pink-500/20 transition-all"
                  >
                    <option value="" className="bg-slate-800">
                      请选择音频文件
                    </option>
                    {audioFiles.map((file) => (
                      <option key={file} value={file} className="bg-slate-800">
                        {file}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 时间设置 */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    开始时间
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.start_time.split(':')[0]}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          start_time: `${e.target.value}:${formData.start_time.split(':')[1]}`,
                        })
                      }
                      className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-pink-500/50 transition-all"
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h} className="bg-slate-800">
                          {h} 时
                        </option>
                      ))}
                    </select>
                    <select
                      value={formData.start_time.split(':')[1]}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          start_time: `${formData.start_time.split(':')[0]}:${e.target.value}`,
                        })
                      }
                      className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-pink-500/50 transition-all"
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m} className="bg-slate-800">
                          {m} 分
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* 快速选择 */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {['07:30', '08:00', '09:00', '12:00', '14:00', '18:00'].map((time) => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setFormData({ ...formData, start_time: time })}
                        className={`px-2 py-1 rounded-lg text-xs transition-all ${
                          formData.start_time === time
                            ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                            : 'bg-white/10 text-white/60 hover:bg-white/20'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 播放时长 */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    播放时长: {formData.duration}秒
                  </label>
                  <input
                    type="range"
                    value={formData.duration}
                    onChange={(e) =>
                      setFormData({ ...formData, duration: parseInt(e.target.value) })
                    }
                    min="1"
                    max="600"
                    step="1"
                    className="w-full accent-pink-500"
                  />
                  <div className="flex gap-2 mt-2">
                    {[10, 30, 60, 120, 300].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setFormData({ ...formData, duration: sec })}
                        className={`px-3 py-1 rounded-lg text-xs transition-all ${
                          formData.duration === sec
                            ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                            : 'bg-white/10 text-white/60 hover:bg-white/20'
                        }`}
                      >
                        {sec >= 60 ? `${sec / 60}分` : `${sec}秒`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 音量 */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-2">
                    音量: {formData.volume}%
                  </label>
                  <input
                    type="range"
                    value={formData.volume}
                    onChange={(e) => setFormData({ ...formData, volume: parseInt(e.target.value) })}
                    min="0"
                    max="100"
                    step="1"
                    className="w-full accent-pink-500"
                  />
                </div>

                {/* 重复星期 */}
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-3">
                    重复星期
                  </label>
                  <div className="flex gap-2">
                    {WEEKDAYS.map((day, i) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleWeekday(i)}
                        className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                          formData.weekdays.includes(i)
                            ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-500/30 scale-105'
                            : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                        }`}
                      >
                        {day.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 按钮 */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="flex-1 py-3 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-xl font-medium shadow-lg shadow-purple-500/30 transition-all hover:scale-105 active:scale-95"
                  >
                    {editingTask ? '保存修改' : '创建任务'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
