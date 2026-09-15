import { dataUrlToBlob, deleteAsset, getAsset, imageSize, putAsset } from '@/lib/asset-store';
import type { Asset, Project } from '@/types/pipeline';
import type { AssetBucket, RunStore } from '@/types/run-store';

/**
 * The run in the browser: localStorage for the plan, IndexedDB for the bytes.
 *
 * This is the default because it needs no credentials and no database, so a
 * fresh checkout works. The cost is that a run is confined to one browser on
 * one machine, which `components/layout/TransportNotice.tsx` states on screen
 * rather than leaving to be discovered.
 */

const KEY = 'reel-director:project';

export class LocalRunStore implements RunStore {
  readonly kind = 'local' as const;

  async load(): Promise<Project | null> {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Project) : null;
    } catch {
      return null;
    }
  }

  async save(project: Project): Promise<void> {
    // Throws when storage is full or blocked, which the caller surfaces rather
    // than swallowing: a run that cannot be saved should say so.
    window.localStorage.setItem(KEY, JSON.stringify(project));
  }

  async reset(project: Project): Promise<void> {
    await this.save(project);
  }

  async putAsset(
    _runId: string,
    bucket: AssetBucket,
    key: string,
    blob: Blob,
    origin: Asset['origin'],
    costUsd?: number,
  ): Promise<Asset> {
    const blobKey = `${bucket}:${key}:${Date.now()}`;
    await putAsset(blobKey, blob);
    const size = blob.type.startsWith('image/') ? await imageSize(blob) : null;
    return {
      key,
      origin,
      mimeType: blob.type,
      sizeBytes: blob.size,
      blobKey,
      createdAt: new Date().toISOString(),
      ...(size === null ? {} : { width: size.width, height: size.height }),
      ...(costUsd === undefined ? {} : { costUsd }),
    };
  }

  async getAssetDataUrl(_runId: string, asset: Asset): Promise<string | null> {
    const blob = await getAsset(asset.blobKey);
    if (blob === null) return null;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(reader.error ?? new Error('Could not read that asset.'));
      reader.readAsDataURL(blob);
    });
  }

  async getAssetObjectUrl(_runId: string, asset: Asset): Promise<string | null> {
    const blob = await getAsset(asset.blobKey);
    return blob === null ? null : URL.createObjectURL(blob);
  }

  async deleteAsset(_runId: string, asset: Asset): Promise<void> {
    await deleteAsset(asset.blobKey);
  }
}

export { dataUrlToBlob };
