import { logger } from '@/lib/logger';
import { OpenRouterError } from '@/services/openrouter';
import { fetchVideoContent, readVideoJob } from '@/services/openrouter-video';

/**
 * Streams a finished clip to the browser.
 *
 * The upstream content URL needs the OpenRouter bearer token, which is
 * server-only. Without this proxy the browser could never fetch its own
 * finished video.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  try {
    const job = await readVideoJob(jobId);
    if (job.status !== 'completed' || job.contentUrl === undefined) {
      return Response.json(
        { error: `That clip is not ready yet. Status: ${job.status}.` },
        { status: 409 },
      );
    }

    const { bytes, contentType } = await fetchVideoContent(job.contentUrl);
    logger.info('clip proxied to the browser', { jobId, sizeBytes: bytes.byteLength });

    return new Response(bytes as unknown as BodyInit, {
      headers: {
        'content-type': contentType,
        'content-length': String(bytes.byteLength),
        'content-disposition': `attachment; filename="${jobId}.mp4"`,
        'cache-control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    if (error instanceof OpenRouterError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    logger.error('clip download failed', { jobId, error });
    return Response.json({ error: 'Could not download that clip.' }, { status: 500 });
  }
}
