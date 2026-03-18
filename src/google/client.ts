import { google, androidpublisher_v3 } from 'googleapis';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { readFileSync } from 'fs';

export interface GoogleClientOptions {
  serviceAccountPath?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export class GoogleClient {
  private publisher: androidpublisher_v3.Androidpublisher;

  constructor(opts: GoogleClientOptions) {
    let auth: GoogleAuth | OAuth2Client;

    if (opts.serviceAccountPath) {
      auth = new GoogleAuth({
        keyFile: opts.serviceAccountPath,
        scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      });
    } else if (opts.clientId && opts.clientSecret && opts.refreshToken) {
      const oauth2 = new OAuth2Client(opts.clientId, opts.clientSecret);
      oauth2.setCredentials({ refresh_token: opts.refreshToken });
      auth = oauth2;
    } else {
      throw new Error('Google client requires either serviceAccountPath or clientId+clientSecret+refreshToken');
    }

    this.publisher = google.androidpublisher({
      version: 'v3',
      auth: auth as any,
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

  async validateEdit(packageName: string, editId: string): Promise<void> {
    await this.publisher.edits.validate({ packageName, editId });
  }

  async deleteEdit(packageName: string, editId: string): Promise<void> {
    await this.publisher.edits.delete({ packageName, editId });
  }

  // ─── App Details ───
  async getDetails(packageName: string, editId: string) {
    const res = await this.publisher.edits.details.get({
      packageName, editId,
    });
    return res.data;
  }

  async updateDetails(
    packageName: string,
    editId: string,
    details: { defaultLanguage?: string; contactWebsite?: string; contactEmail?: string; contactPhone?: string },
  ) {
    const res = await this.publisher.edits.details.patch({
      packageName, editId,
      requestBody: details,
    });
    return res.data;
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

  async deleteListing(packageName: string, editId: string, language: string) {
    await this.publisher.edits.listings.delete({
      packageName, editId, language,
    });
  }

  // ─── Country Availability ───
  async getCountryAvailability(packageName: string, editId: string, track: string) {
    const res = await this.publisher.edits.countryavailability.get({
      packageName, editId, track,
    });
    return res.data;
  }

  // ─── Testers ───
  async getTesters(packageName: string, editId: string, track: string) {
    const res = await this.publisher.edits.testers.get({
      packageName, editId, track,
    });
    return res.data;
  }

  async updateTesters(
    packageName: string,
    editId: string,
    track: string,
    testers: { googleGroups?: string[] },
  ) {
    const res = await this.publisher.edits.testers.patch({
      packageName, editId, track,
      requestBody: testers,
    });
    return res.data;
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

  // ─── In-App Products ───
  async listInAppProducts(packageName: string) {
    const res = await this.publisher.inappproducts.list({ packageName });
    return res.data.inappproduct ?? [];
  }

  async getInAppProduct(packageName: string, sku: string) {
    const res = await this.publisher.inappproducts.get({ packageName, sku });
    return res.data;
  }

  async createInAppProduct(packageName: string, product: androidpublisher_v3.Schema$InAppProduct) {
    const res = await this.publisher.inappproducts.insert({
      packageName,
      requestBody: product,
    });
    return res.data;
  }

  async updateInAppProduct(packageName: string, sku: string, product: androidpublisher_v3.Schema$InAppProduct) {
    const res = await this.publisher.inappproducts.patch({
      packageName, sku,
      requestBody: product,
    });
    return res.data;
  }

  async deleteInAppProduct(packageName: string, sku: string) {
    await this.publisher.inappproducts.delete({ packageName, sku });
  }

  // ─── Subscriptions (monetization) ───
  async listSubscriptions(packageName: string) {
    const res = await this.publisher.monetization.subscriptions.list({ packageName });
    return res.data.subscriptions ?? [];
  }

  async getSubscription(packageName: string, productId: string) {
    const res = await this.publisher.monetization.subscriptions.get({ packageName, productId });
    return res.data;
  }

  async createSubscription(packageName: string, productId: string, subscription: androidpublisher_v3.Schema$Subscription) {
    const res = await this.publisher.monetization.subscriptions.create({
      packageName,
      productId,
      requestBody: subscription,
    });
    return res.data;
  }

  async archiveSubscription(packageName: string, productId: string) {
    const res = await this.publisher.monetization.subscriptions.archive({
      packageName, productId,
      requestBody: {},
    });
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
