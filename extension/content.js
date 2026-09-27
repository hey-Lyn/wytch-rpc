const SERVER = 'http://127.0.0.1:4444/update';

let lastSend = 0;
let lastKey = '';
let lastData = null;

function getVideo() {
  return document.querySelector('video.video-stream, video.html5-main-video, video');
}

function getVideoId() {
  const url = new URL(location.href);
  return url.pathname === '/watch' ? url.searchParams.get('v') : null;
}

function getTitle() {
  const el = document.querySelector(
    'h1.ytd-watch-metadata, #title h1 yt-formatted-string, #title h1'
  );
  return el ? el.textContent.trim() : null;
}

function getChannel() {
  const el = document.querySelector(
    'ytd-video-owner-renderer #channel-name yt-formatted-string a, #owner #channel-name a, ytd-channel-name a'
  );
  return el ? el.textContent.trim() : null;
}

function send(data) {
  try {
    fetch(SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(data),
    }).catch(() => {});
  } catch (e) {
    // ignora
  }
}

function isAdPlaying() {
  return !!document.querySelector('.ad-showing, .ytp-ad-player-overlay');
}

function squareThumbnail(videoId) {
  const raw = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  return `https://images.weserv.nl/?url=${encodeURIComponent(raw)}&w=640&h=640&fit=contain&bg=000000`;
}

function collect() {
  const videoId = getVideoId();
  if (!videoId) return null;

  const video = getVideo();
  if (!video) return null;

  const title = getTitle();
  const channel = getChannel();
  if (!title || !channel) return null;

  const positionMs = Math.floor((video.currentTime || 0) * 1000);
  const durationMs = Number.isFinite(video.duration)
    ? Math.floor(video.duration * 1000)
    : 0;

  return {
    active: true,
    videoId,
    title,
    channel,
    positionMs,
    durationMs,
    paused: video.paused || document.hidden || isAdPlaying(),
    thumbnailUrl: squareThumbnail(videoId),
    videoUrl: location.href,
  };
}

function loop() {
  const videoId = getVideoId();
  const data = videoId ? collect() : null;
  const now = Date.now();

  if (data) {
    const key = `${data.videoId}|${data.title}|${data.channel}|${data.paused}`;
    const interval = data.paused ? 5000 : 1000;
    if (now - lastSend >= interval || key !== lastKey) {
      lastData = data;
      send(data);
      lastSend = now;
      lastKey = key;
    }
  } else if (!videoId && lastKey !== '') {
    lastData = null;
    send({ active: false });
    lastSend = now;
    lastKey = '';
  }

  setTimeout(loop, 1000);
}

window.addEventListener('pagehide', () => {
  if (lastData) send({ active: false });
});

loop();