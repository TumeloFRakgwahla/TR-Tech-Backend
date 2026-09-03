const path = require('path');
const fs = require('fs');

const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

// Smallest valid PNG (1x1 transparent)
const TINY_PNG = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489' +
  '0000000D49444154789C636001000000050001A5F645400000000049454E44AE426082',
  'hex'
);

// We need a different setup per test file because app.js must only be required
// once with the @vercel/blob mock in effect (jest.doMock only applies when the
// module is later required from scratch). We therefore pre-build two completely
// separate app instances — one for local-disk mode and one for blob mode —
// by mocking @vercel/blob BEFORE the app is loaded, then requiring it.

jest.mock('@vercel/blob', () => {
  const put = jest.fn(async (name, _buffer, opts) => ({
    url: `https://abc.public.blob.vercel-storage.com/${name}`,
    pathname: `/${name}`,
    contentType: opts && opts.contentType,
  }));
  const del = jest.fn(async () => ({}));
  return { put, del, __putMock: put, __delMock: del };
});

const blobModule = require('@vercel/blob');
const putMock = blobModule.__putMock;
const delMock = blobModule.__delMock;

// Make sure the local-disk path is active in this test file by unsetting the
// blob token, and let individual tests opt-in to blob mode by setting it.
delete process.env.BLOB_READ_WRITE_TOKEN;

const request = require('supertest');
const User = require('../models/User');
const { createToken } = require('./helpers/createToken');
const app = require('../app');

let adminAuthToken;

beforeEach(async () => {
  const admin = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    email: `admin-${Date.now()}-${Math.random()}@test.com`,
    password: 'password123',
    phone: '1234567890',
    role: 'admin',
  });
  adminAuthToken = await createToken(admin._id);
});

afterEach(() => {
  // Restore env so we always start each test from the default (local-disk) mode.
  if (originalBlobToken === undefined) {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  } else {
    process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
  }
  putMock.mockClear();
  delMock.mockClear();
});

describe('Upload Routes — Local-disk fallback', () => {
  it('rejects unauthenticated uploads', async () => {
    const res = await request(app)
      .post('/api/v1/upload/image')
      .attach('image', TINY_PNG, 'test.png');
    expect(res.statusCode).toEqual(401);
  });

  it('rejects non-image files', async () => {
    const res = await request(app)
      .post('/api/v1/upload/image')
      .set('Cookie', `adminAuthToken=${adminAuthToken}`)
      .attach('image', Buffer.from('not an image'), 'test.txt');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('uploads a single image and returns a /uploads/ URL', async () => {
    const res = await request(app)
      .post('/api/v1/upload/image')
      .set('Cookie', `adminAuthToken=${adminAuthToken}`)
      .attach('image', TINY_PNG, 'test.png');

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toMatch(/^\/uploads\/.+\.png$/);

    const localPath = path.join(__dirname, '..', 'uploads', res.body.filename);
    expect(fs.existsSync(localPath)).toBe(true);
    fs.unlinkSync(localPath);
  });

  it('uploads multiple images and returns an array of URLs', async () => {
    const res = await request(app)
      .post('/api/v1/upload/images')
      .set('Cookie', `adminAuthToken=${adminAuthToken}`)
      .attach('images', TINY_PNG, 'a.png')
      .attach('images', TINY_PNG, 'b.png');

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(2);

    for (const item of res.body.data) {
      const localPath = path.join(__dirname, '..', 'uploads', item.filename);
      expect(fs.existsSync(localPath)).toBe(true);
      fs.unlinkSync(localPath);
    }
  });

  it('rejects delete with a URL when local storage is active', async () => {
    const res = await request(app)
      .delete('/api/v1/upload/image/https%3A%2F%2Fexample.com%2Fblob.jpg')
      .set('Cookie', `adminAuthToken=${adminAuthToken}`);
    expect(res.statusCode).toEqual(400);
  });

  it('deletes a local image by filename', async () => {
    const filename = `test-delete-${Date.now()}.png`;
    const localPath = path.join(__dirname, '..', 'uploads', filename);
    fs.writeFileSync(localPath, TINY_PNG);
    expect(fs.existsSync(localPath)).toBe(true);

    const res = await request(app)
      .delete(`/api/v1/upload/image/${filename}`)
      .set('Cookie', `adminAuthToken=${adminAuthToken}`);

    expect(res.statusCode).toEqual(200);
    expect(fs.existsSync(localPath)).toBe(false);
  });

  it('rejects path traversal in delete', async () => {
    const res = await request(app)
      .delete('/api/v1/upload/image/..%2Fapp.js')
      .set('Cookie', `adminAuthToken=${adminAuthToken}`);
    expect(res.statusCode).toEqual(400);
  });
});

describe('Upload Routes — Vercel Blob mode', () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test_token';
  });

  it('uploads to blob and returns the absolute URL', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test_token';
    putMock.mockImplementationOnce(async (name, _buffer, opts) => ({
      url: `https://abc.public.blob.vercel-storage.com/${name}`,
      pathname: `/${name}`,
      contentType: opts && opts.contentType,
    }));
    const res = await request(app)
      .post('/api/v1/upload/image')
      .set('Cookie', `adminAuthToken=${adminAuthToken}`)
      .attach('image', TINY_PNG, 'test.png');

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toMatch(/^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0][0]).toMatch(/\.png$/);
    expect(putMock.mock.calls[0][2].access).toBe('public');
  });

  it('uploads multiple images to blob', async () => {
    putMock.mockImplementation(async (name, _buffer, opts) => ({
      url: `https://abc.public.blob.vercel-storage.com/${name}`,
      pathname: `/${name}`,
      contentType: opts && opts.contentType,
    }));
    const res = await request(app)
      .post('/api/v1/upload/images')
      .set('Cookie', `adminAuthToken=${adminAuthToken}`)
      .attach('images', TINY_PNG, 'a.png')
      .attach('images', TINY_PNG, 'b.png');

    expect(res.statusCode).toEqual(201);
    expect(res.body.data).toHaveLength(2);
    expect(putMock).toHaveBeenCalledTimes(2);
  });

  it('deletes by full blob URL', async () => {
    const url = 'https://abc.public.blob.vercel-storage.com/foo.png';
    const res = await request(app)
      .delete(`/api/v1/upload/image/${encodeURIComponent(url)}`)
      .set('Cookie', `adminAuthToken=${adminAuthToken}`);

    expect(res.statusCode).toEqual(200);
    expect(delMock).toHaveBeenCalledWith(url);
  });

  it('rejects delete by bare filename when blob mode is active', async () => {
    const res = await request(app)
      .delete('/api/v1/upload/image/somefile.png')
      .set('Cookie', `adminAuthToken=${adminAuthToken}`);
    expect(res.statusCode).toEqual(400);
  });
});