/**
 * LocalFiles — Scans a directory using the File System Access API
 * and imports audio files as track list items.
 */

import type { TrackItem, Playlist } from '../store/AppStore';

// Helper to check if file name is an audio format
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);

export async function scanLocalDirectory(): Promise<Playlist | null> {
  const win = window as any;
  if (!('showDirectoryPicker' in win)) {
    alert('Your browser does not support folder access. Please use Chrome, Edge, or Opera.');
    return null;
  }

  try {
    const handle = await win.showDirectoryPicker();
    const tracks: TrackItem[] = [];

    // Simple recursive directory scanner
    async function scan(dirHandle: any) {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'directory') {
          await scan(entry);
        } else if (entry.kind === 'file') {
          const ext = entry.name.split('.').pop()?.toLowerCase();
          if (ext && AUDIO_EXTS.has(ext)) {
            const file = await entry.getFile();
            const url = URL.createObjectURL(file);

            // Parse metadata from filename: "Artist - Title.ext"
            let title = entry.name.replace(/\.[^/.]+$/, '');
            let artist = 'Local Artist';
            const split = title.split(' - ');
            if (split.length > 1) {
              artist = split[0].trim();
              title = split.slice(1).join(' - ').trim();
            }

            tracks.push({
              id: `local-${entry.name}-${file.size}`,
              title,
              artist,
              album: 'Local Folder',
              duration: 240, // Default duration placeholder, will update on play
              albumArtUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=300&auto=format&fit=crop',
              audioUrl: url,
              source: 'local',
              resolved: true,
            });
          }
        }
      }
    }

    await scan(handle);

    if (tracks.length === 0) {
      alert('No audio files (.mp3, .wav, .ogg, .flac, .m4a, .aac) found in the selected folder.');
      return null;
    }

    return {
      id: 'local-files',
      name: 'Local Files',
      description: 'Audio tracks imported from your device',
      coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=300&auto=format&fit=crop',
      tracks,
      source: 'local',
      trackCount: tracks.length,
    };
  } catch (err) {
    console.error('Folder scan cancelled/failed:', err);
    return null;
  }
}
