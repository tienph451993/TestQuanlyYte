import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

// Modal quét barcode dùng camera sau. Compatible iOS Safari.
export default function BarcodeScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [err, setErr] = useState(null);
  const [status, setStatus] = useState('Đang khởi động camera…');
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');

  // 1) Xin quyền + start stream
  const start = async (targetDeviceId) => {
    setErr(null);
    setStatus('Đang mở camera…');
    try {
      const constraints = targetDeviceId
        ? { video: { deviceId: { exact: targetDeviceId } } }
        : { video: { facingMode: { ideal: 'environment' } } };

      // Bước 1: xin quyền + preview
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Bước 2: sau khi có quyền → lấy danh sách device thật (có label)
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === 'videoinput');
      setDevices(cams);
      if (!targetDeviceId) {
        const track = stream.getVideoTracks()[0];
        const activeId = track.getSettings().deviceId;
        if (activeId) setDeviceId(activeId);
      } else {
        setDeviceId(targetDeviceId);
      }

      // Bước 3: bắt đầu decode. Tắt stream tạm và để ZXing quản.
      stream.getTracks().forEach((t) => t.stop());

      const reader = new BrowserMultiFormatReader();
      const useId = targetDeviceId || (cams.find((c) => /back|rear|environment/i.test(c.label))?.deviceId) || cams[cams.length - 1]?.deviceId;
      controlsRef.current = await reader.decodeFromVideoDevice(useId, videoRef.current, (result, e, controls) => {
        if (result) {
          try { controls.stop(); } catch {}
          onDetect(result.getText());
        }
      });
      setStatus('Đưa barcode vào khung xanh');
    } catch (e) {
      console.error(e);
      if (e?.name === 'NotAllowedError' || /denied/i.test(e?.message || '')) {
        setErr('Trình duyệt chưa cho phép camera. Bấm khoá 🔒 trên thanh địa chỉ → Cho phép Camera → tải lại trang.');
      } else if (e?.name === 'NotFoundError') {
        setErr('Không tìm thấy camera.');
      } else if (!window.isSecureContext) {
        setErr('Trang cần HTTPS để dùng camera. Truy cập bằng https://…');
      } else {
        setErr('Lỗi camera: ' + (e?.message || e));
      }
      setStatus(null);
    }
  };

  useEffect(() => {
    start();
    return () => { try { controlsRef.current?.stop(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchCamera = async (id) => {
    try { controlsRef.current?.stop(); } catch {}
    await start(id);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="card-title">📷 Quét barcode</div>
          <button className="btn btn-ghost" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {err && <div className="alert alert-danger">{err}</div>}
          <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3' }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute', inset: '15% 8%', border: '2px solid #27AE60',
              borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)', pointerEvents: 'none'
            }} />
          </div>
          {devices.length > 1 && (
            <div className="field mt-3">
              <label>Camera</label>
              <select className="select" value={deviceId} onChange={(e) => switchCamera(e.target.value)}>
                {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
              </select>
            </div>
          )}
          {status && !err && <div className="text-sub text-sm mt-2">{status}</div>}
          {!err && (
            <div className="text-sub text-xs mt-1">
              iOS Safari: nếu không hiện video, bấm <b>AA</b> ở thanh địa chỉ → <b>Website Settings</b> → cho phép Camera.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
