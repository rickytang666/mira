import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { setStudyLogo } from 'wasp/client/operations';

const LOGO_SIZE = 256;

// Shrinks the upload to at most 256 px so it can be stored inline on the study.
async function toSmallDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/png');
}

export function LogoUploader({ studyId, logo }: { studyId: string; logo: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(next: string | null) {
    setBusy(true);
    setError('');
    try {
      await setStudyLogo({ studyId, logo: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the logo.');
    } finally {
      setBusy(false);
    }
  }

  async function pick(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Choose an image file.');
    try {
      await save(await toSmallDataUrl(file));
    } catch {
      setError('Could not read that image.');
    }
  }

  return (
    <div className="logo-uploader">
      <button type="button" className="logo-slot" disabled={busy} onClick={() => input.current?.click()} aria-label={logo ? 'Replace your logo' : 'Upload your logo'}>
        {busy ? <Loader2 size={20} className="spin" /> : logo ? <img src={logo} alt="Your logo" /> : <ImagePlus size={22} />}
      </button>
      <div>
        <strong>{logo ? 'Your logo' : 'Add your logo'}</strong>
        <small>{error || 'Mira wears it on her shirt during interviews.'}</small>
        {logo && !busy && (
          <button type="button" className="text-link logo-remove" onClick={() => save(null)}><Trash2 size={13} />Remove</button>
        )}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
