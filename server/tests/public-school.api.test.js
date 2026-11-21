import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { api, tokenFor } from './helpers.js';

let schoolId;
let createdById;
let originalDetails;
let publicNotice;
let internalNotice;
let futureNotice;
let apiCreatedNoticeId;
let publicImage;
let hiddenImage;
let unpublishedImage;
let hiddenCoverAlbum;
let previousStorage = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };

beforeAll(async () => {
  const school = await prisma.school.findUnique({ where: { code: 'GIS' }, select: { id: true } });
  if (!school) throw new Error('Public school test seed is missing');
  schoolId = school.id;
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@edumanage.test' },
    select: { id: true },
  });
  createdById = admin.id;
  originalDetails = await prisma.schoolDetails.findUnique({ where: { schoolId } });
  await prisma.schoolDetails.upsert({
    where: { schoolId },
    update: { published: true, introduction: 'Public school introduction.' },
    create: { schoolId, published: true, introduction: 'Public school introduction.' },
  });
  const previousDate = new Date(Date.now() - 60_000);
  publicNotice = await prisma.notice.create({
    data: {
      schoolId,
      createdById,
      title: 'Public notice',
      description: 'Intended for public visitors.',
      audience: 'ALL',
      status: 'PUBLISHED',
      isPublic: true,
      publishDate: previousDate,
    },
  });
  internalNotice = await prisma.notice.create({
    data: {
      schoolId,
      createdById,
      title: 'Internal notice',
      description: 'Not for public visitors.',
      audience: 'ALL',
      status: 'PUBLISHED',
      isPublic: false,
      publishDate: previousDate,
      attachmentUrl: '/api/files/private.pdf',
    },
  });
  futureNotice = await prisma.notice.create({
    data: {
      schoolId,
      createdById,
      title: 'Future public notice',
      description: 'Not yet public.',
      audience: 'ALL',
      status: 'PUBLISHED',
      isPublic: true,
      publishDate: new Date(Date.now() + 60_000),
    },
  });
  publicImage = await prisma.schoolGalleryImage.create({
    data: {
      schoolId,
      title: 'Published image',
      category: 'Campus',
      imageUrl: `schools/${schoolId}/gallery/${crypto.randomUUID()}.png`,
      published: true,
    },
  });
  hiddenImage = await prisma.schoolGalleryImage.create({
    data: {
      schoolId,
      title: 'Unpublished image',
      category: 'School activities',
      imageUrl: `schools/${schoolId}/gallery/${crypto.randomUUID()}.png`,
      published: true,
    },
  });
  hiddenCoverAlbum = await prisma.schoolGalleryAlbum.create({
    data: { schoolId, title: 'Private results image cover', coverUrl: hiddenImage.imageUrl, published: true },
  });
  unpublishedImage = await prisma.schoolGalleryImage.create({
    data: {
      schoolId,
      title: 'Unpublished image',
      category: 'Campus',
      imageUrl: `schools/${schoolId}/gallery/${crypto.randomUUID()}.png`,
      published: false,
    },
  });
  env.SUPABASE_URL = 'https://storage.example.test';
  env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-storage-key';
});

afterAll(async () => {
  await prisma.notice.deleteMany({ where: { id: { in: [publicNotice?.id, internalNotice?.id, futureNotice?.id, apiCreatedNoticeId].filter(Boolean) } } });
  await prisma.schoolGalleryImage.deleteMany({ where: { id: { in: [publicImage?.id, hiddenImage?.id, unpublishedImage?.id].filter(Boolean) } } });
  await prisma.schoolGalleryAlbum.deleteMany({ where: { id: hiddenCoverAlbum?.id } });
  if (originalDetails) {
    const originalData = { ...originalDetails };
    delete originalData.id;
    delete originalData.createdAt;
    delete originalData.updatedAt;
    await prisma.schoolDetails.update({ where: { schoolId }, data: originalData });
  } else {
    await prisma.schoolDetails.deleteMany({ where: { schoolId } });
  }
  env.SUPABASE_URL = previousStorage.url;
  env.SUPABASE_SERVICE_ROLE_KEY = previousStorage.key;
  await prisma.$disconnect();
});

describe('public school website API', () => {
  it('serves only published school details and explicitly public notices without authentication', async () => {
    const response = await api().get('/api/public/school');
    expect(response.status).toBe(200);
    expect(response.body.data.school.name).toBe('Ratonpur Central School');
    expect(response.body.data.school.id).toBeUndefined();
    expect(response.body.data.details.introduction).toBe('Public school introduction.');
    expect(response.body.data.details.id).toBeUndefined();
    expect(response.body.data.details.published).toBeUndefined();
    expect(response.body.data.notices.map((notice) => notice.id)).toContain(publicNotice.id);
    expect(response.body.data.notices.map((notice) => notice.id)).not.toContain(internalNotice.id);
    expect(response.body.data.notices.map((notice) => notice.id)).not.toContain(futureNotice.id);
    expect(response.body.data.notices[0].attachmentUrl).toBeUndefined();
    expect(response.body.data.galleryImages.map((image) => image.id)).toContain(publicImage.id);
    expect(response.body.data.galleryImages.map((image) => image.id)).not.toContain(hiddenImage.id);
    expect(response.body.data.galleryImages.map((image) => image.id)).not.toContain(unpublishedImage.id);
    expect(response.body.data.albums.find((album) => album.id === hiddenCoverAlbum.id).coverUrl).toBeNull();
  });

  it('withholds school-detail text and contact data when School Details are unpublished', async () => {
    await prisma.schoolDetails.update({ where: { schoolId }, data: { published: false } });
    try {
      const response = await api().get('/api/public/school');
      expect(response.status).toBe(200);
      expect(response.body.data.details).toBeNull();
      expect(response.body.data.school.address).toBeUndefined();
      expect(response.body.data.school.phone).toBeUndefined();
      expect(response.body.data.school.email).toBeUndefined();
    } finally {
      await prisma.schoolDetails.update({ where: { schoolId }, data: { published: true } });
    }
  });

  it('serves a published image through the server proxy but not an unpublished image path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => Buffer.from('test-image'),
    }));
    try {
      const visible = await api().get(`/api/public/school/image/${encodeURIComponent(publicImage.imageUrl)}`);
      expect(visible.status).toBe(200);
      expect(visible.headers['content-type']).toContain('image/png');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockClear();
      const hidden = await api().get(`/api/public/school/image/${encodeURIComponent(hiddenImage.imageUrl)}`);
      expect(hidden.status).toBe(404);
      expect(hidden.body.error.code).toBe('SCHOOL_IMAGE_NOT_FOUND');
      expect(fetchMock).not.toHaveBeenCalled();

      const unpublished = await api().get(`/api/public/school/image/${encodeURIComponent(unpublishedImage.imageUrl)}`);
      expect(unpublished.status).toBe(404);
      expect(unpublished.body.error.code).toBe('SCHOOL_IMAGE_NOT_FOUND');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does not allow a teacher to create a notice for the public website', async () => {
    const token = await tokenFor('TEACHER');
    const response = await api().post('/api/notices').set({ Authorization: `Bearer ${token}` }).send({
      title: 'Unauthorized public notice',
      description: 'A teacher cannot publish this publicly.',
      audience: 'ALL',
      isPublic: true,
    });
    expect(response.status).toBe(403);
  });

  it('lets an administrator explicitly publish an all-school notice to the website', async () => {
    const token = await tokenFor('SCHOOL_ADMIN');
    const response = await api().post('/api/notices').set({ Authorization: `Bearer ${token}` }).send({
      title: 'Administrator public notice',
      description: 'This is approved for public visitors.',
      audience: 'ALL',
      isPublic: true,
    });
    expect(response.status).toBe(201);
    expect(response.body.data.isPublic).toBe(true);
    apiCreatedNoticeId = response.body.data.id;
    const page = await api().get('/api/public/school');
    expect(page.body.data.notices.map((notice) => notice.id)).toContain(apiCreatedNoticeId);
  });
});
