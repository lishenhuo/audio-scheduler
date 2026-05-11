import { useState, useEffect } from 'react';

interface ScheduleTask {
  id: string;
  name: string;
  audio_files: string[];
  start_time: string;
  end_time: string;
  play_interval: string;
  weekdays: number[];
  enabled: boolean;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const INTERVAL_OPTIONS = [
  { value: 'none', label: '无间隔' }, { value: '1m', label: '1 分钟' },
  { value: '3m', label: '3 分钟' }, { value: '5m', label: '5 分钟' },
  { value: '10m', label: '10 分钟' }, { value: '20m', label: '20 分钟' },
  { value: '30m', label: '30 分钟' }, { value: '1h', label: '1 小时' },
  { value: '2h', label: '2 小时' }, { value: '4h', label: '4 小时' },
];

const API_BASE = 'http://localhost:8765/api';

function App() {
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [audioFiles, setAudioFiles] = useState<string[]>([]);
  const [localIp, setLocalIp] = useState('127.0.0.1');
  const [showModal, setShowModal] = useState(false);
  const [serverStatus, setServerStatus] = useState<any>('checking');
  const [audioFolder, setAudioFolder] = useState('');
  const [folderInput, setFolderInput] = useState('');

  const [formData, setFormData] = useState({
    name: '', audio_files: [] as string[], start_time: '08:00', end_time: '09:00',
    play_interval: 'none', weekdays: [1,2,3,4,5], enabled: true,
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const ipRes = await fetch(`${API_BASE}/ip`).catch(() => null);
      if (!ipRes) { setServerStatus('offline'); return; }
      setServerStatus('online');
      const ipData = await ipRes.json();
      setLocalIp(ipData.ip);

      const [configRes, tasksRes, filesRes] = await Promise.all([
        fetch(`${API_BASE}/config`), fetch(`${API_BASE}/tasks`), fetch(`${API_BASE}/audio`),
      ]);
      const config = await configRes.json();
      setAudioFolder(config.audioFolder || '');
      setTasks(await tasksRes.json());
      setAudioFiles(await filesRes.json());
    } catch (e) { setServerStatus('offline'); }
  };

  const handleSetFolder = async () => {
    if (!folderInput.trim()) { alert('请输入文件夹路径'); return; }
    try {
      const res = await fetch(`${API_BASE}/folder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderInput.trim() }),
      });
      if (!res.ok) throw new Error('文件夹不存在或无法访问');
      alert('✅ 设置成功！');
      setFolderInput('');
      loadData();
    } catch (e: any) { alert('❌ 设置失败: ' + e.message); }
  };

  const handleSubmit = async () => {
    if (!formData.name || formData.audio_files.length === 0) {
      alert('请填写任务名称并选择至少一个音频文件'); return;
    }
    await fetch(`${API_BASE}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    setShowModal(false);
    setFormData({ name: '', audio_files: [], start_time: '08:00', end_time: '09:00', play_interval: 'none', weekdays: [1,2,3,4,5], enabled: true });
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定删除？')) {
      await fetch(`${API_BASE}/tasks/${id}`, { method: 'DELETE' });
      loadData();
    }
  };

  const handleToggleEnabled = async (task: ScheduleTask) => {
    await fetch(`${API_BASE}/tasks/${task.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, enabled: !task.enabled }),
    });
    loadData();
  };

  const handlePlay = async (filename: string) => {
    const res = await fetch(`${API_BASE}/play/${encodeURIComponent(filename)}`, { method: 'POST' });
    if (res.ok) alert('🎵 开始测试播放 10 秒');
    else alert('播放失败');
  };

  const toggleWeekday = (day: number) => {
    setFormData(prev => ({
      ...prev, weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter(d => d !== day) : [...prev.weekdays, day].sort(),
    }));
  };

  const toggleAudioFile = (filename: string) => {
    setFormData(prev => ({
      ...prev, audio_files: prev.audio_files.includes(filename)
        ? prev.audio_files.filter(f => f !== filename) : [...prev.audio_files, filename],
    }));
  };

  const getIntervalLabel = (value: string) => {
    return INTERVAL_OPTIONS.find(opt => opt.value === value)?.label || value;
  };

  const quickPaths = [
    { name: '桌面', path: '/Users/alanmac/Desktop' },
    { name: '下载', path: '/Users/alanmac/Downloads' },
    { name: '音乐', path: '/Users/alanmac/Music' },
  ];

  if (serverStatus === 'checking') return <div className="min-h-screen flex items-center justify-center">🔄 连接中...</div>;
  if (serverStatus === 'offline') return <div className="min-h-screen flex items-center justify-center">⚠️ 后端未启动</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">🎵 音频定时播放器</h1>
              <p className="text-gray-500">可选择任意文件夹的音频</p>
            </div>
            <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg">➕ 添加任务</button>
          </div>
          <div className="mt-4 p-3 bg-green-50 rounded-lg">
            <p className="text-green-800">📱 手机访问: <code>http://{localIp}:8765</code></p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-bold mb-4">📋 任务列表</h2>
              {tasks.length === 0 ? <p className="text-center text-gray-400 py-8">暂无任务</p> : (
                <div className="space-y-3">
                  {tasks.map(task => (
                    <div key={task.id} className="p-4 border rounded-lg bg-blue-50">
                      <div className="flex justify-between">
                        <div>
                          <h3 className="font-semibold">{task.name}</h3>
                          <div className="text-sm text-gray-600 mt-2">
                            <span>🕐 {task.start_time} - {task.end_time}</span>
                            <span className="ml-3">⏱️ 间隔: {getIntervalLabel(task.play_interval)}</span>
                            <p>📅 {task.weekdays.map(d => WEEKDAYS[d]).join('、')}</p>
                            <p>🎵 {task.audio_files.length} 个音频</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button onClick={() => handleToggleEnabled(task)} className="px-3 py-1 bg-orange-100 text-orange-700 rounded text-sm">
                            {task.enabled ? '禁用' : '启用'}
                          </button>
                          <button onClick={() => handleDelete(task.id)} className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm">删除</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="col-span-1 space-y-6">
            {/* 文件夹设置 */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-bold mb-4">📁 设置音频文件夹</h2>
              {audioFolder ? (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">✅ 当前文件夹：</p>
                  <code className="text-xs break-all text-blue-600">{audioFolder}</code>
                </div>
              ) : (
                <div className="mb-4 p-3 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-yellow-800">⚠️ 请先设置音频文件夹</p>
                </div>
              )}
              <div className="space-y-3">
                <input type="text" value={folderInput} onChange={e => setFolderInput(e.target.value)}
                  placeholder="文件夹路径，如 /Users/alanmac/Desktop/音乐"
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
                <div className="flex flex-wrap gap-2">
                  {quickPaths.map(p => (
                    <button key={p.path} onClick={() => setFolderInput(p.path)}
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">{p.name}</button>
                  ))}
                </div>
                <button onClick={handleSetFolder}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">💾 设置文件夹</button>
              </div>
            </div>

            {/* 音频列表 */}
            <div className="bg-white rounded-xl shadow p-6">
              <h2 className="text-lg font-bold mb-4">🎶 音频文件</h2>
              {!audioFolder ? <p className="text-center text-gray-400 py-4 text-sm">请先设置文件夹</p> :
                audioFiles.length === 0 ? <p className="text-center text-gray-400 py-4 text-sm">暂无音频</p> : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {audioFiles.map(file => (
                    <div key={file} className="p-2 bg-gray-50 rounded flex justify-between items-center">
                      <span className="text-sm truncate flex-1 mr-2">{file}</span>
                      <button onClick={() => handlePlay(file)}
                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs">播放</button>
                    </div>
                  ))}
                </div>
              )}
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
                <label className="block text-sm font-medium mb-1">任务名称</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="例如：早上闹钟" className="w-full px-3 py-2 border rounded-lg" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">选择音频（可多选，按顺序循环）</label>
                <div className="border rounded-lg p-3 max-h-40 overflow-y-auto">
                  {audioFiles.length === 0 ? <p className="text-gray-400 text-sm">请先设置音频文件夹</p> :
                    audioFiles.map(file => (
                    <label key={file} className="flex items-center gap-2 p-1 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={formData.audio_files.includes(file)}
                        onChange={() => toggleAudioFile(file)} />
                      <span className="text-sm">{file}</span>
                    </label>
                  ))}
                </div>
                <p className="text-sm text-blue-600 mt-1">已选择 {formData.audio_files.length} 个</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">开始时间</label>
                  <input type="time" value={formData.start_time} onChange={e => setFormData({...formData, start_time: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">结束时间</label>
                  <input type="time" value={formData.end_time} onChange={e => setFormData({...formData, end_time: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">播放间隔</label>
                <select value={formData.play_interval} onChange={e => setFormData({...formData, play_interval: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg">
                  {INTERVAL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">重复星期</label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day, i) => (
                    <button key={day} type="button" onClick={() => toggleWeekday(i)}
                      className={`px-3 py-1 rounded text-sm ${formData.weekdays.includes(i) ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">取消</button>
                <button onClick={handleSubmit} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
