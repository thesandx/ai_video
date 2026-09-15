import { imageSize } from '@/lib/asset-store';
import type { Asset, Project } from '@/types/pipeline';
import type { AssetBucket, RunStore } from '@/types/run-store';

/**
 * The run in Neon Postgres, reached through this app's own routes.
 *
 * The browser never holds the connection string, so every operation goes
 * through `/api/runs`. Bytes are sent and fetched raw rather than as base64
 * JSON: a 40 MB clip inflates by a third as base64 and then has to be parsed
 * as a string.
 *
 * `blobKey` here is an address rather than a local handle, `bucket:key`, which
 * is what the asset route resolves.
 */

async function expectOk(response: Response, what: string): Promise<void> {
  if (response.ok) return;
  const payload: unknown = await response.json().catch(() => null);
  const detail =
    typeof payload === 'object' && payload !== null
      ? String((payload as { error?: unknown }).error ?? '')
      : '';
  throw new Error(detail === '' ? `Could not ${what}.` : detail);
}

export class NeonRunStore implements RunStore {
  readonly kind = 'neon' as const;

  async load(): Promise<Project | null> {
    const response = await fetch('/api/runs', { cache: 'no-store' });
    await expectOk(response, 'load the run');
    const payload = (await response.json()) as { project: Project | null };
    return payload.project;
  }

  async save(project: Project): Promise<void> {
    const response = await fetch('/api/runs', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(project),
    });
    await expectOk(response, 'save the run');
  }

  async reset(project: Project): Promise<void> {
    const response = await fetch('/api/runs', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(project),
    });
    await expectOk(response, 'start a new run');
  }

  private url(runId: string, bucket: AssetBucket, key: string): string {
    return `/api/runs/${encodeURIComponent(runId)}/assets/${bucket}/${encodeURIComponent(key)}`;
  }

  async putAsset(
    runId: string,
    bucket: AssetBucket,
    key: string,
    blob: Blob,
    origin: Asset['origin'],
    costUsd?: number,
  ): Promise<Asset> {
    // Dimensions are measured here, in the browser, because the server would
    // need an image decoder to do it and this is the only place one exists.
    const size = blob.type.startsWith('image/') ? await imageSize(blob) : null;

    const headers: Record<string, string> = {
      'content-type': blob.type === '' ? 'application/octet-stream' : blob.type,
      'x-asset-origin': origin,
    };
    if (size !== null) {
      headers['x-asset-width'] = String(size.width);
      headers['x-asset-height'] = String(size.height);
    }
    if (costUsd !== undefined) headers['x-asset-cost'] = String(costUsd);

    const response = await fetch(this.url(runId, bucket, key), {
      method: 'PUT',
      headers,
      body: blob,
    });
    await expectOk(response, 'store that asset');

    return {
      key,
      origin,
      mimeType: blob.type,
      sizeBytes: blob.size,
      blobKey: `${bucket}:${key}`,
      createdAt: new Date().toISOString(),
      ...(size === null ? {} : { width: size.width, height: size.height }),
      ...(costUsd === undefined ? {} : { costUsd }),
    };
  }

  private async fetchBlob(runId: string, asset: Asset): Promise<Blob | null> {
    const [bucket = '', key = ''] = asset.blobKey.split(':', 2);
    if (bucket === '' || key === '') return null;
    const response = await fetch(this.url(runId, bucket as AssetBucket, key));
    if (response.status === 404) return null;
    await expectOk(response, 'read that asset');
    return response.blob();
  }

  async getAssetDataUrl(runId: string, asset: Asset): Promise<string | null> {
    const blob = await this.fetchBlob(runId, asset);
    if (blob === null) return null;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(reader.error ?? new Error('Could not read that asset.'));
      reader.readAsDataURL(blob);
    });
  }

  async getAssetObjectUrl(runId: string, asset: Asset): Promise<string | null> {
    const blob = await this.fetchBlob(runId, asset);
    return blob === null ? null : URL.createObjectURL(blob);
  }

  async deleteAsset(runId: string, asset: Asset): Promise<void> {
    const [bucket = '', key = ''] = asset.blobKey.split(':', 2);
    if (bucket === '' || key === '') return;
    const response = await fetch(this.url(runId, bucket as AssetBucket, key), { method: 'DELETE' });
    await expectOk(response, 'delete that asset');
  }
}
