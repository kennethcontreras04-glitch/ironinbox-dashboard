import { BlobServiceClient } from '@azure/storage-blob';

// Sessions point to persistent encrypted users. ETags prevent sync from
// undoing a concurrent mailbox disconnect or overwriting a review.
export function createStorage(connectionString, containerName = 'ironinbox') {
  const container = BlobServiceClient.fromConnectionString(connectionString, {
    retryOptions: { maxTries: 2, tryTimeoutInMs: 5000 },
  }).getContainerClient(containerName);
  return {
    async read(key) {
      try {
        const response = await container.getBlockBlobClient(key).download();
        const chunks = [];
        for await (const chunk of response.readableStreamBody) chunks.push(Buffer.from(chunk));
        return { value: JSON.parse(Buffer.concat(chunks).toString()), etag: response.etag };
      } catch (error) {
        if (error.statusCode === 404) return null;
        throw error;
      }
    },
    async write(key, value, etag) {
      const body = JSON.stringify(value);
      await container.getBlockBlobClient(key).upload(body, Buffer.byteLength(body), {
        conditions: etag ? { ifMatch: etag } : { ifNoneMatch: '*' },
        blobHTTPHeaders: { blobContentType: 'application/json' },
      });
    },
    async remove(key, etag) {
      await container.getBlockBlobClient(key).delete({ conditions: { ifMatch: etag } });
    },
  };
}
