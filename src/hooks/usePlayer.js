import { useState, useEffect, useRef, useCallback } from 'react';
import { YOUTUBE_PLAYLIST_ID } from '../utils/config';

/**
 * Core YouTube IFrame API player hook.
 * Manages: playback, track info, progress, volume, shuffle, playlist data.
 */
export function usePlayer() {
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffled, setIsShuffled] = useState(true);
  const isShuffledRef = useRef(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(30);
  const [duration, setDuration] = useState(0);
  const [trackTitle, setTrackTitle] = useState('Loading…');
  const [trackArtist, setTrackArtist] = useState('नेपाली Banger');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [playlist, setPlaylist] = useState([]);
  const playlistRef = useRef([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const [isReady, setIsReady] = useState(false);

  const setPlaylistSync = useCallback((newVal) => {
    if (typeof newVal === 'function') {
      setPlaylist(prev => {
        const next = newVal(prev);
        playlistRef.current = next;
        return next;
      });
    } else {
      playlistRef.current = newVal;
      setPlaylist(newVal);
    }
  }, []);

  const setCurrentIndexSync = useCallback((newVal) => {
    if (typeof newVal === 'function') {
      setCurrentIndex(prev => {
        const next = newVal(prev);
        currentIndexRef.current = next;
        return next;
      });
    } else {
      currentIndexRef.current = newVal;
      setCurrentIndex(newVal);
    }
  }, []);

  // ── Load YouTube IFrame API ──
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      initPlayer();
      return;
    }

    if (!document.getElementById('yt-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'yt-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    // Always assign the callback so whichever mount is active gets called
    window.onYouTubeIframeAPIReady = () => {
      // In case of StrictMode, only init if the ref is still valid (component not unmounted)
      initPlayer();
    };

    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
    };
  }, []);

  function initPlayer() {
    playerRef.current = new window.YT.Player('yt-player-el', {
      height: '200',
      width: '200',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
      },
    });
  }

  function onPlayerReady() {
    console.log('[usePlayer] onPlayerReady fired');
    const p = playerRef.current;
    window.testPlayer = p;
    p.setVolume(volume);

    // Cue the playlist so getPlaylist() becomes populated.
    // YouTube will fire a CUED state event when this is done.
    p.cuePlaylist({ list: YOUTUBE_PLAYLIST_ID, listType: 'playlist', index: 0 });
  }

  function onPlayerStateChange(event) {
    const p = playerRef.current;
    const state = event.data;
    console.log('[usePlayer] onPlayerStateChange fired with state:', state);

    if (state === window.YT.PlayerState.PLAYING) {
      setIsPlaying(true);
      updateTrackInfo(event.target);
      setDuration(event.target.getDuration() || 0);
    } else if (state === window.YT.PlayerState.PAUSED) {
      setIsPlaying(false);
    } else if (state === window.YT.PlayerState.ENDED) {
      // Auto-next
      playNextInternal();
    } else if (state === window.YT.PlayerState.CUED) {
      setIsPlaying(false);
      setTrackTitle('Press ▶ to start');
      // Playlist data is now available
      const ytPlaylist = p.getPlaylist();
      if (ytPlaylist && ytPlaylist.length > 0 && playlistRef.current.length === 0) {
        const items = ytPlaylist.map((id, idx) => ({
          id,
          title: `Track ${idx + 1}`,
          channel: 'नेपाली Banger',
        }));
        setPlaylistSync(items);
        setIsReady(true);

        // Jump to random track manually using loadVideoById (destroys YT native queue)
        const randIdx = Math.floor(Math.random() * ytPlaylist.length);
        setCurrentIndexSync(randIdx);
        p.loadVideoById(items[randIdx].id);

        // Fetch metadata in the background for all tracks
        fetchPlaylistMetadata(ytPlaylist);
      }
    } else if (state === -1) { // UNSTARTED
      setIsPlaying(false);
      updateTrackInfo(p);
      if (!p.getVideoData()?.title) {
        setTrackTitle('Press ▶ to start');
      }
    }
  }

  function onPlayerError(event) {
    console.warn('YouTube player error:', event.data);
    setTimeout(() => playNextInternal(), 1500);
  }

  // ── Background Metadata Fetch ──
  async function fetchPlaylistMetadata(ytPlaylist) {
    const BATCH_SIZE = 5;
    for (let i = 0; i < ytPlaylist.length; i += BATCH_SIZE) {
      const batch = ytPlaylist.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (videoId, batchIdx) => {
        try {
          const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
          const data = await res.json();
          if (data && data.title) {
            const globalIdx = i + batchIdx;
            setPlaylistSync((prev) => {
              const newPlaylist = [...prev];
              // Only update if it still has the placeholder title
              if (newPlaylist[globalIdx] && newPlaylist[globalIdx].title.startsWith('Track ')) {
                newPlaylist[globalIdx] = {
                  ...newPlaylist[globalIdx],
                  title: data.title,
                  channel: data.author_name || 'नेपाली Banger'
                };
              }
              return newPlaylist;
            });
          }
        } catch (err) {
          // ignore network errors
        }
      });
      // Wait for the batch to finish, then a small delay to avoid rate limiting
      await Promise.all(promises);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // ── Track info ──
  function updateTrackInfo(p) {
    if (!p || typeof p.getVideoData !== 'function') return;
    const data = p.getVideoData();
    if (data.title) setTrackTitle(data.title);
    if (data.author) setTrackArtist(data.author);
    if (data.video_id) {
      setThumbnailUrl(`https://i.ytimg.com/vi/${data.video_id}/hqdefault.jpg`);
    }
    // Update playlist item titles lazily
    if (data.title && data.video_id) {
      setPlaylistSync(prev => {
        const idx = prev.findIndex(t => t.id === data.video_id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], title: data.title, channel: data.author || 'नेपाली Banger' };
          return next;
        }
        return prev;
      });
    }
    setDuration(p.getDuration() || 0);
  }

  // ── Internal next with shuffle support ──
  function playNextInternal() {
    const p = playerRef.current;
    if (!p) return;
    const pl = playlistRef.current;
    if (pl && pl.length > 0) {
      let nextIdx;
      if (isShuffledRef.current) {
        nextIdx = Math.floor(Math.random() * pl.length);
      } else {
        nextIdx = (currentIndexRef.current + 1) % pl.length;
      }
      setCurrentIndexSync(nextIdx);
      p.loadVideoById(pl[nextIdx].id);
    }
  }

  // ── Public controls ──
  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (isPlaying) {
      p.pauseVideo();
    } else {
      p.playVideo();
    }
  }, [isPlaying]);

  const playNext = useCallback(() => {
    playNextInternal();
  }, []);

  const playPrev = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.getCurrentTime() > 3) {
      p.seekTo(0);
    } else {
      const pl = playlistRef.current;
      if (pl && pl.length > 0) {
        let prevIdx = currentIndexRef.current - 1;
        if (prevIdx < 0) prevIdx = pl.length - 1;
        setCurrentIndexSync(prevIdx);
        p.loadVideoById(pl[prevIdx].id);
      }
    }
  }, [setCurrentIndexSync]);

  const getCurrentTime = useCallback(() => {
    const p = playerRef.current;
    if (p && typeof p.getCurrentTime === 'function') {
      return p.getCurrentTime() || 0;
    }
    return 0;
  }, []);

  const seekTo = useCallback((fraction) => {
    const p = playerRef.current;
    if (!p || duration === 0) return;
    const target = fraction * duration;
    p.seekTo(target, true);
  }, [duration]);

  const changeVolume = useCallback((v) => {
    const p = playerRef.current;
    setVolume(v);
    if (p) p.setVolume(v);
    if (v === 0) {
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (isMuted) {
      p.unMute();
      p.setVolume(volume || 50);
      setIsMuted(false);
    } else {
      p.mute();
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const toggleShuffle = useCallback(() => {
    setIsShuffled(prev => {
      const next = !prev;
      isShuffledRef.current = next;
      return next;
    });
  }, []);

  const playTrackAt = useCallback((idx) => {
    const p = playerRef.current;
    if (!p) return;
    const pl = playlistRef.current;
    if (pl && pl[idx]) {
      setCurrentIndexSync(idx);
      p.loadVideoById(pl[idx].id);
    }
  }, [setCurrentIndexSync]);

  const reorderPlaylist = useCallback((newOrder) => {
    const currentTrackId = playlistRef.current[currentIndexRef.current]?.id;
    setPlaylistSync(newOrder);

    if (currentTrackId) {
      const newActiveIdx = newOrder.findIndex(t => t.id === currentTrackId);
      if (newActiveIdx !== -1) {
        setCurrentIndexSync(newActiveIdx);
      }
    }
  }, [setPlaylistSync, setCurrentIndexSync]);

  return {
    isPlaying,
    isShuffled,
    isMuted,
    volume,
    duration,
    trackTitle,
    trackArtist,
    thumbnailUrl,
    playlist,
    currentIndex,
    isReady,
    getCurrentTime,
    togglePlay,
    playNext,
    playPrev,
    seekTo,
    changeVolume,
    toggleMute,
    toggleShuffle,
    playTrackAt,
    reorderPlaylist,
  };
}
