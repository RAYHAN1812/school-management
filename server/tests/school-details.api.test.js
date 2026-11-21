import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../src/config/prisma.js';
import { api, bearer, tokenFor } from './helpers.js';

const ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'];
let tokens;
let schoolId;
let originalDetails;
let publishedImage;
let unpublishedImage;
let publishedAlbum;
let unpublishedAlbum;
let albumImages = [];

beforeAll(async () => {
  tokens = {};
  for (const role of ROLES) tokens[role] = bearer(await tokenFor(role));
  const { data: schools } = (await api().get('/api/schools').set(tokens.SUPER_ADMIN)).body;
  schoolId = schools[0].id;
  tokens.SUPER_ADMIN['X-School-Id'] = schoolId;

  originalDetails = await prisma.schoolDetails.findUnique({ where: { schoolId } });
  await prisma.schoolDetails.upsert({
    where: { schoolId },
    update: { published: true, mission: 'school-details-permission-test' },
    create: { schoolId, published: true, mission: 'school-details-permission-test' },
  });
  publishedImage = await prisma.schoolGalleryImage.create({
    data: {
      schoolId,
      title: 'Published permission test',
      category: 'test',
      imageUrl: `schools/${schoolId}/test/${crypto.randomUUID()}.png`,
      published: true,
    },
  });
  unpublishedImage = await prisma.schoolGalleryImage.create({
    data: {
      schoolId,
      title: 'Unpublished permission test',
      category: 'test',
      imageUrl: `schools/${schoolId}/test/${crypto.randomUUID()}.png`,
      published: false,
    },
  });
  publishedAlbum = await prisma.schoolGalleryAlbum.create({
    data: { schoolId, title: 'Published permission album', published: true },
  });
  unpublishedAlbum = await prisma.schoolGalleryAlbum.create({
    data: { schoolId, title: 'Unpublished permission album', published: false },
  });
  albumImages = await Promise.all([
    prisma.schoolGalleryImage.create({
      data: {
        schoolId,
        albumId: publishedAlbum.id,
        title: 'Published album image',
        category: 'test',
        imageUrl: `schools/${schoolId}/test/${crypto.randomUUID()}.png`,
        published: true,
      },
    }),
    prisma.schoolGalleryImage.create({
      data: {
        schoolId,
        albumId: unpublishedAlbum.id,
        title: 'Hidden album image',
        category: 'test',
        imageUrl: `schools/${schoolId}/test/${crypto.randomUUID()}.png`,
        published: true,
      },
    }),
  ]);
});

afterAll(async () => {
  const imageIds = [publishedImage?.id, unpublishedImage?.id, ...albumImages.map((image) => image.id)].filter(Boolean);
  if (imageIds.length) await prisma.schoolGalleryImage.deleteMany({ where: { id: { in: imageIds } } });
  const albumIds = [publishedAlbum?.id, unpublishedAlbum?.id].filter(Boolean);
  if (albumIds.length) await prisma.schoolGalleryAlbum.deleteMany({ where: { id: { in: albumIds } } });
  if (originalDetails) {
    const originalData = { ...originalDetails };
    delete originalData.id;
    delete originalData.createdAt;
    delete originalData.updatedAt;
    await prisma.schoolDetails.update({ where: { schoolId }, data: originalData });
  } else {
    await prisma.schoolDetails.deleteMany({ where: { schoolId } });
  }
  await prisma.$disconnect();
});

describe('School Details role access', () => {
  it.each(ROLES)('%s can read published details and published gallery entries', async (role) => {
    const response = await api().get('/api/school-details').set(tokens[role]);
    expect(response.status).toBe(200);
    expect(response.body.data.mission).toBe('school-details-permission-test');
    expect(response.body.data.galleryImages.map((image) => image.id)).toContain(publishedImage.id);
    if (role === 'SUPER_ADMIN') {
      expect(response.body.data.galleryImages.map((image) => image.id)).toContain(unpublishedImage.id);
      expect(response.body.data.albums.map((album) => album.id)).toContain(unpublishedAlbum.id);
    } else {
      expect(response.body.data.galleryImages.map((image) => image.id)).not.toContain(unpublishedImage.id);
      expect(response.body.data.albums.map((album) => album.id)).toContain(publishedAlbum.id);
      expect(response.body.data.albums.map((album) => album.id)).not.toContain(unpublishedAlbum.id);
      const visibleAlbum = response.body.data.albums.find((album) => album.id === publishedAlbum.id);
      expect(visibleAlbum.images.map((image) => image.id)).toContain(albumImages[0].id);
      expect(visibleAlbum.images.map((image) => image.id)).not.toContain(albumImages[1].id);
    }
  });

  it('hides unpublished details and unpublished images from every non-super-admin role', async () => {
    await prisma.schoolDetails.update({ where: { schoolId }, data: { published: false } });
    for (const role of ROLES.slice(1)) {
      const response = await api().get('/api/school-details').set(tokens[role]);
      expect(response.status).toBe(200);
      expect(response.body.data.published).toBe(false);
      expect(response.body.data.mission).toBeUndefined();
      expect(response.body.data.galleryImages.map((image) => image.id)).toContain(publishedImage.id);
      expect(response.body.data.galleryImages.map((image) => image.id)).not.toContain(unpublishedImage.id);
      expect(response.body.data.albums.map((album) => album.id)).toContain(publishedAlbum.id);
      expect(response.body.data.albums.map((album) => album.id)).not.toContain(unpublishedAlbum.id);
    }

    const superResponse = await api().get('/api/school-details').set(tokens.SUPER_ADMIN);
    expect(superResponse.body.data.mission).toBe('school-details-permission-test');
    expect(superResponse.body.data.galleryImages.map((image) => image.id)).toContain(unpublishedImage.id);
  });

  it('does not serve an unpublished gallery image by guessing its private path', async () => {
    await prisma.schoolDetails.update({ where: { schoolId }, data: { published: true } });
    for (const role of ROLES.slice(1)) {
      for (const image of [unpublishedImage, albumImages[1]]) {
        const path = encodeURIComponent(image.imageUrl);
        const response = await api().get(`/api/school-details/image/${path}`).set(tokens[role]);
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('SCHOOL_IMAGE_NOT_FOUND');
      }
    }
  });

  it.each(ROLES.slice(1))('%s cannot mutate School Details through direct API requests', async (role) => {
    const token = tokens[role];
    const image = Buffer.from('not-an-image');
    const mutationResponses = await Promise.all([
      api().patch('/api/school-details').set(token).send({ mission: 'unauthorized' }),
      api().delete('/api/school-details').set(token),
      api().post('/api/school-details/upload').set(token).attach('image', image, { filename: 'test.png', contentType: 'image/png' }),
      api().post('/api/school-details/albums').set(token).send({ title: 'Unauthorized' }),
      api().patch('/api/school-details/albums/not-an-id').set(token).send({ title: 'Unauthorized' }),
      api().delete('/api/school-details/albums/not-an-id').set(token),
      api().post('/api/school-details/gallery').set(token).send({ title: 'Unauthorized' }),
      api().patch('/api/school-details/gallery/not-an-id').set(token).send({ title: 'Unauthorized' }),
      api().delete('/api/school-details/gallery/not-an-id').set(token),
    ]);
    expect(mutationResponses.map((response) => response.status)).toEqual(Array(9).fill(403));
  });

  it('allows the Super Admin to update School Details', async () => {
    const response = await api()
      .patch('/api/school-details')
      .set(tokens.SUPER_ADMIN)
      .send({ mission: 'super-admin-permission-test' });
    expect(response.status).toBe(200);
    expect(response.body.data.mission).toBe('super-admin-permission-test');
  });

  it('allows the Super Admin to delete School Details', async () => {
    const response = await api().delete('/api/school-details').set(tokens.SUPER_ADMIN);
    expect(response.status).toBe(200);
    expect(response.body.data.deleted).toBe(true);
  });
});
