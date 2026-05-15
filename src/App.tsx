import { useState, useEffect } from 'react';
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

function App() {
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // 调用 Tauri 本地命令
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
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.audio_file) {
      alert('请填写任务名称并选择音频文件');
      return;
    }

    try {
      const taskData: Partial<ScheduleTask> = {
        ...formData,
        end_time: formData.end_time || null,
      };

      await invoke('add_task', { task: taskData });
      setShowModal(false);
      setFormData({
        name: '',
        audio_file: '',
        start_time: '08:00',
        end_time: '',
        duration: 60,
        weekdays: [1, 2, 3, 4, 5],
        volume: 80,
        enabled: true,
      });
      loadData();
      alert('✅ 任务添加成功！');
    } catch (e) {
      alert('❌ 添加失败: ' + e);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定删除？')) {
      try {
        await invoke('delete_task', { taskId: id });
        loadData();
      } catch (e) {
        alert('删除失败');
      }
    }
  };

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

  const handlePlay = async (filename: string) => {
    try {
      await invoke('play_audio', { filename });
      alert('🎵 开始播放');
    } catch (e) {
      alert('播放失败');
    }
  };

  const handleStop = async () => {
    try {
      await invoke('stop_audio');
      alert('⏹️ 已停止');
    } catch (e) {
      alert('停止失败');
    }
  };

  const toggleWeekday = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort(),
    }));
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        🔄 加载中...
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">🎵 音频定时播放器</h1>
              <p className="text-gray-500">本地单机版，无需网络</p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg"
            >
              ➕ 添加任务
            </button>
          </div>
          <div className="mt-4 p-3 bg-green-50 rounded-lg">
            <p className="text-green-800">
              ✅ 本地运行 · 纯单机版 · 无需网络 · 无需后端
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-bold mb-4">📋 任务列表</h2>
              {tasks.length === 0 ? (
                <p className="text-center text-gray-400 py-8">暂无任务</p>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-4 border rounded-lg ${
                        task.enabled ? 'bg-blue-50' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between">
                        <div>
                          <h3 className="font-semibold">
                            {task.name}
                            {!task.enabled && (
                              <span className="ml-2 text-xs text-gray-500">
                                (已禁用)
                              </span>
                            )}
                          </h3>
                          <div className="text-sm text-gray-600 mt-2">
                            <p>🎵 {task.audio_file}</p>
                            <p>
                              🕐 {task.start_time}
                              {task.end_time && ` - ${task.end_time}`}
                              {task.duration && ` (${task.duration}秒)`}
                            </p>
                            <p>
                              📅{' '}
                              {task.weekdays
                                .map((d) => WEEKDAYS[d])
                                .join('、') || '不重复'}
                            </p>
                            <p>🔊 音量: {task.volume}%</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleToggleEnabled(task)}
                            className={`px-3 py-1 rounded text-sm ${
                              task.enabled
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {task.enabled ? '禁用' : '启用'}
                          </button>
                          <button
                            onClick={() => handleDelete(task.id)}
                            className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="col-span-1 space-y-6">
            {/* 音频列表 */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-bold mb-4">🎶 音频文件</h2>
              {audioFiles.length === 0 ? (
                <p className="text-center text-gray-400 py-4 text-sm">
                  audio 文件夹为空
                  <br />
                  请将音频文件放入应用目录的 audio 文件夹
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {audioFiles.map((file) => (
                    <div
                      key={file}
                      className="p-2 bg-gray-50 rounded flex justify-between items-center"
                    >
                      <span className="text-sm truncate flex-1 mr-2">
                        {file}
                      </span>
                      <button
                        onClick={() => handlePlay(file)}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs"
                      >
                        播放
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <button
                  onClick={handleStop}
                  className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm"
                >
                  ⏹️ 停止播放
                </button>
              </div>
            </div>

            {/* 说明 */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-bold mb-4">📖 使用说明</h2>
              <div className="text-sm text-gray-600 space-y-2">
                <p>1. 将音频文件放入 audio 文件夹</p>
                <p>2. 支持格式：mp3, wav, m4a, ogg, flac</p>
                <p>3. 添加定时任务设置播放时间</p>
                <p>4. 任务数据保存在 data/tasks.json</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 添加任务弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-6">➕ 添加定时任务</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  任务名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="例如：早上闹钟"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  选择音频文件
                </label>
                <select
                  value={formData.audio_file}
                  onChange={(e) =>
                    setFormData({ ...formData, audio_file: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">请选择音频</option>
                  {audioFiles.map((file) => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    开始时间
                  </label>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={(e) =>
                      setFormData({ ...formData, start_time: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    结束时间（可选）
                  </label>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={(e) =>
                      setFormData({ ...formData, end_time: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  播放时长（秒）
                </label>
                <input
                  type="number"
                  value={formData.duration}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      duration: parseInt(e.target.value) || 60,
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  音量 (0-100)
                </label>
                <input
                  type="range"
                  value={formData.volume}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      volume: parseInt(e.target.value),
                    })
                  }
                  min="0"
                  max="100"
                  className="w-full"
                />
                <p className="text-sm text-gray-500 text-center">
                  {formData.volume}%
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  重复星期
                </label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleWeekday(i)}
                      className={`px-3 py-1 rounded text-sm ${
                        formData.weekdays.includes(i)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 rounded-lg"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
