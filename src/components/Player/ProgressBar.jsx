import { useRef, useCallback, useState, useEffect } from 'react';
import { formatTime } from '../../utils/formatTime';

export default function ProgressBar({ getCurrentTime, duration, onSeek }) {
  const wrapRef = useRef(null);
  const [localTime, setLocalTime] = useState(0);

  useEffect(() => {
    let animationFrameId;
    const updateTime = () => {
      setLocalTime(getCurrentTime());
      animationFrameId = requestAnimationFrame(updateTime);
    };
    animationFrameId = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animationFrameId);
  }, [getCurrentTime]);

  const handleInteraction = useCallback((clientX) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(pct);
  }, [onSeek]);

  const handleMouseDown = (e) => {
    handleInteraction(e.clientX);
    const onMove = (ev) => handleInteraction(ev.clientX);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const pct = duration > 0 ? (localTime / duration) * 100 : 0;

  return (
    <>
      <div className="progress-area">
        <div className="progress-bar-wrap" ref={wrapRef} onMouseDown={handleMouseDown}>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            <div className="progress-bar-thumb" style={{ left: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div className="time-display">
        <span>{formatTime(localTime)}</span>
        <span className="time-sep">/</span>
        <span>{formatTime(duration)}</span>
      </div>
    </>
  );
}
