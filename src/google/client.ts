import { google, androidpublisher_v3 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'fs';

export class GoogleClient {
  private publisher: androidpublisher_v3.Androidpublisher;

  constructor(serviceAccountPath: string) {
    const auth = new GoogleAuth({
      keyFile: serviceAccountPath,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    this.publisher = google.androidpublisher({
      version: 'v3',
      auth,
    });
  }

  get api() {
    return this.publisher;
  }

  // ─── Edit lifecycle ───
  async createEdit(packageName: string): Promise<string> {
    const res = await this.publisher.edits.insert({ packageName });
    return res.data.id!;
  }

  async commitEdit(packageName: string, editId: string): Promise<void> {
    await this.publisher.edits.commit({ packageName, editId });
  }

  async deleteEdit(packageName: string, editId: string): Promise<void> {
    await this.publisher.edits.delete({ packageName, editId });
  }

  // ─── Store listing ───
  async getListing(packageName: string, editId: string, language: string) {
    const res = await this.publisher.edits.listings.get({
      packageName, editId, language,
    });
    return res.data;
  }

  async updateListing(
    packageName: string,
    editId: string,
    language: string,
    listing: { title?: string; shortDescription?: string; fullDescription?: string },
  ) {
    const res = await this.publisher.edits.listings.update({
      packageName, editId, language,
      requestBody: listing,
    });
    return res.data;
  }

  async listListings(packageName: string, editId: string) {
    const res = await this.publisher.edits.listings.list({
      packageName, editId,
    });
    return res.data.listings ?? [];
  }

  // ─── Images ───
  async uploadImage(
    packageName: string,
    editId: string,
    language: string,
    imageType: string,
    imagePath: string,
  ) {
    const media = { mimeType: 'image/png', body: readFileSync(imagePath) };
    const res = await this.publisher.edits.images.upload({
      packageName, editId, language, imageType,
      media,
    } as any);
    return res.data;
  }

  async listImages(
    packageName: string,
    editId: string,
    language: string,
    imageType: string,
  ) {
    const res = await this.publisher.edits.images.list({
      packageName, editId, language, imageType,
    });
    return res.data.images ?? [];
  }

  async deleteImage(
    packageName: string,
    editId: string,
    language: string,
    imageType: string,
    imageId: string,
  ) {
    await this.publisher.edits.images.delete({
      packageName, editId, language, imageType, imageId,
    });
  }

  async deleteAllImages(
    packageName: string,
    editId: string,
    language: string,
    imageType: string,
  ) {
    await this.publisher.edits.images.deleteall({
      packageName, editId, language, imageType,
    });
  }

  // ─── Tracks & Releases ───
  async listTracks(packageName: string, editId: string) {
    const res = await this.publisher.edits.tracks.list({
      packageName, editId,
    });
    return res.data.tracks ?? [];
  }

  async getTrack(packageName: string, editId: string, track: string) {
    const res = await this.publisher.edits.tracks.get({
      packageName, editId, track,
    });
    return res.data;
  }

  async updateTrack(
    packageName: string,
    editId: string,
    track: string,
    releases: androidpublisher_v3.Schema$TrackRelease[],
  ) {
    const res = await this.publisher.edits.tracks.update({
      packageName, editId, track,
      requestBody: { track, releases },
    });
    return res.data;
  }

  // ─── Bundles ───
  async uploadBundle(packageName: string, editId: string, bundlePath: string) {
    const media = {
      mimeType: 'application/octet-stream',
      body: readFileSync(bundlePath),
    };
    const res = await this.publisher.edits.bundles.upload({
      packageName, editId,
      media,
    } as any);
    return res.data;
  }

  async uploadApk(packageName: string, editId: string, apkPath: string) {
    const media = {
      mimeType: 'application/vnd.android.package-archive',
      body: readFileSync(apkPath),
    };
    const res = await this.publisher.edits.apks.upload({
      packageName, editId,
      media,
    } as any);
    return res.data;
  }

  // ─── Reviews ───
  async listReviews(packageName: string) {
    const res = await this.publisher.reviews.list({ packageName });
    return res.data.reviews ?? [];
  }

  async getReview(packageName: string, reviewId: string) {
    const res = await this.publisher.reviews.get({ packageName, reviewId });
    return res.data;
  }

  async replyToReview(packageName: string, reviewId: string, replyText: string) {
    const res = await this.publisher.reviews.reply({
      packageName, reviewId,
      requestBody: { replyText },
    });
    return res.data;
  }
}
