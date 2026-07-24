import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

// Modal quét barcode dùng camera sau. Nhấn 1 lần đọc được → gọi onDetect(text) → tự đóng.
export default function BarcodeScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);
  const [err, setErr] = useState(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        setDevices(list);
        // Ưu tiên camera sau
        const rear = list.find((d) => /back|rear|environment/i.test(d.label)) || list[list.length - 1] || list[0];
        setDeviceId(rear?.deviceId || null);
      } catch (e) {
        setErr('Không truy cập được danh sách camera: ' + e.message);
      }
    })();
    return () => {
      try { controlsRef.current?.stop(); } catch {}
    };
  }, []);

  useEffect(() => {
    if (!deviceId || !videoRef.current) return;
    setErr(null);
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    reader.decodeFromVideoDevice(deviceId, videoRef.current, (result, e, controls) => {
      controlsRef.current = controls;
      if (result) {
        try { controls.stop(); } catch {}
        onDetect(result.getText());
      }
    }).catch((e) => setErr('Không mở được camera: ' + e.message));

    return () => { try { controlsRef.current?.stop(); } catch {} };
  }, [deviceId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="card-title">📷 Quét barcode</div>
          <button className="btn btn-ghost" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {err && <div className="alert alert-danger">{err}</div>}
          <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
            <video ref={videoRef} style={{ width: '100%', display: 'block', maxHeight: '55vh', objectFit: 'cover' }} muted playsInline />
            <div style={{
              position: 'absolute', inset: '15% 10%', border: '2px solid #27AE60',
              borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)'
            }} />
          </div>
          {devices.length > 1 && (
            <div className="field mt-3">
              <label>Camera</label>
              <select className="select" value={deviceId || ''} onChange={(e) => setDeviceId(e.target.value)}>
                {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 6)}`}</option>)}
              </select>
            </div>
          )}
          <div className="text-sub text-sm mt-3">Đưa barcode vào khung xanh. Ánh sáng tốt giúp đọc nhanh hơn.</div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
