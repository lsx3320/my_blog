// 全局类型声明：MusicPlayer 在 window 上挂载的跨页面持久状态。
// 脚本通过单例模式确保只在首个页面初始化一次。
interface Window {
  __bgm_ctx: AudioContext;
  __bgm_gain: GainNode;
  __bgm_source: AudioBufferSourceNode | null;
  __bgm_buffer: AudioBuffer | null;
  __bgm_startedAt: number;
  __bgm_pausedAt: number;
  __bgm_isPlaying: boolean;
  __bgm_userPaused: boolean;
  __bgm_initialized: boolean;
  __bgm_autoplay_done: boolean;
  __bgm_autoplay_setup: boolean;
  __bgm_buffer_loading: boolean;
  __bgm_saveInterval: ReturnType<typeof setInterval>;
}
