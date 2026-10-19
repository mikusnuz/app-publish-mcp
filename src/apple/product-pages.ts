import { z } from 'zod';
import { AppleClient } from './client.js';
import { allPages } from './asset-library.js';

// Custom Product Pages and Product Page Optimization (A/B tests).
// Screenshots, previews and the header/search visuals for both go through the
// Asset Library tools: apple_create_placement with targetType
// appCustomProductPageLocalizations or appStoreVersionExperimentTreatmentLocalizations.

const id = z.string().trim().min(1);
const locale = z.string().trim().min(2).describe('Locale code, e.g. en-US');

function rel(type: string, value: string) {
  return { data: { type, id: value } };
}

async function remove(client: AppleClient, path: string, resourceId: string) {
  await client.request(`${path}/${resourceId}`, { method: 'DELETE' });
  return { success: true, id: resourceId };
}

export const productPageTools = [
  // ── Custom Product Pages ──
  {
    name: 'apple_list_custom_product_pages',
    description: 'List custom product pages for an app, with their versions (state, deep link) and the page URL to use in ad campaigns',
    schema: z.object({ appId: id, visible: z.boolean().optional() }),
    handler: async (client: AppleClient, args: any) => allPages(client, `/apps/${args.appId}/appCustomProductPages`, {
      limit: '200', include: 'appCustomProductPageVersions',
      ...(args.visible !== undefined ? { 'filter[visible]': String(args.visible) } : {}),
    }),
  },
  {
    name: 'apple_get_custom_product_page',
    description: 'Get a custom product page with its versions',
    schema: z.object({ pageId: id }),
    handler: async (client: AppleClient, args: any) => client.request(`/appCustomProductPages/${args.pageId}`, {
      params: { include: 'appCustomProductPageVersions' },
    }),
  },
  {
    name: 'apple_create_custom_product_page',
    description: 'Create a custom product page with its first version and localizations in one request. Optionally copy screenshots and text from an App Store version or another custom page. Add visuals afterwards with the Asset Library placement tools.',
    schema: z.object({
      appId: id,
      name: z.string().trim().min(1),
      localizations: z.array(z.object({ locale, promotionalText: z.string().max(170).optional() })).min(1),
      deepLink: z.string().url().optional().describe('Universal link opened when the app is already installed'),
      templateAppStoreVersionId: id.optional().describe('Copy content from this App Store version'),
      templateCustomProductPageId: id.optional().describe('Copy content from this custom product page'),
    }),
    handler: async (client: AppleClient, args: any) => {
      if (args.templateAppStoreVersionId && args.templateCustomProductPageId) {
        throw new Error('Use either templateAppStoreVersionId or templateCustomProductPageId, not both');
      }
      const versionId = '${version-0}';
      const localizationIds = args.localizations.map((_: any, index: number) => '${localization-' + index + '}');
      return client.request('/appCustomProductPages', { method: 'POST', body: {
        data: {
          type: 'appCustomProductPages',
          attributes: { name: args.name },
          relationships: {
            app: rel('apps', args.appId),
            appCustomProductPageVersions: { data: [{ type: 'appCustomProductPageVersions', id: versionId }] },
            ...(args.templateAppStoreVersionId ? { appStoreVersionTemplate: rel('appStoreVersions', args.templateAppStoreVersionId) } : {}),
            ...(args.templateCustomProductPageId ? { customProductPageTemplate: rel('appCustomProductPages', args.templateCustomProductPageId) } : {}),
          },
        },
        included: [
          {
            type: 'appCustomProductPageVersions',
            id: versionId,
            ...(args.deepLink ? { attributes: { deepLink: args.deepLink } } : {}),
            relationships: {
              appCustomProductPageLocalizations: {
                data: localizationIds.map((value: string) => ({ type: 'appCustomProductPageLocalizations', id: value })),
              },
            },
          },
          ...args.localizations.map((entry: any, index: number) => ({
            type: 'appCustomProductPageLocalizations',
            id: localizationIds[index],
            attributes: {
              locale: entry.locale,
              ...(entry.promotionalText !== undefined ? { promotionalText: entry.promotionalText } : {}),
            },
          })),
        ],
      } });
    },
  },
  {
    name: 'apple_update_custom_product_page',
    description: 'Rename a custom product page or switch its visibility (a hidden page stops serving its URL)',
    schema: z.object({ pageId: id, name: z.string().trim().min(1).optional(), visible: z.boolean().optional() }),
    handler: async (client: AppleClient, args: any) => {
      const attributes: any = {};
      if (args.name !== undefined) attributes.name = args.name;
      if (args.visible !== undefined) attributes.visible = args.visible;
      if (!Object.keys(attributes).length) throw new Error('Nothing to update: pass name or visible');
      return client.request(`/appCustomProductPages/${args.pageId}`, { method: 'PATCH', body: {
        data: { type: 'appCustomProductPages', id: args.pageId, attributes },
      } });
    },
  },
  {
    name: 'apple_delete_custom_product_page',
    description: 'Delete a custom product page; its URL stops working in campaigns',
    schema: z.object({ pageId: id }),
    handler: async (client: AppleClient, args: any) => remove(client, '/appCustomProductPages', args.pageId),
  },
  {
    name: 'apple_list_custom_product_page_versions',
    description: 'List versions of a custom product page',
    schema: z.object({ pageId: id }),
    handler: async (client: AppleClient, args: any) => allPages(client, `/appCustomProductPages/${args.pageId}/appCustomProductPageVersions`, { limit: '200' }),
  },
  {
    name: 'apple_create_custom_product_page_version',
    description: 'Start a new editable version of an approved custom product page',
    schema: z.object({ pageId: id, deepLink: z.string().url().optional() }),
    handler: async (client: AppleClient, args: any) => client.request('/appCustomProductPageVersions', { method: 'POST', body: { data: {
      type: 'appCustomProductPageVersions',
      ...(args.deepLink ? { attributes: { deepLink: args.deepLink } } : {}),
      relationships: { appCustomProductPage: rel('appCustomProductPages', args.pageId) },
    } } }),
  },
  {
    name: 'apple_update_custom_product_page_version',
    description: 'Change the deep link of an editable custom product page version',
    schema: z.object({ versionId: id, deepLink: z.string().url() }),
    handler: async (client: AppleClient, args: any) => client.request(`/appCustomProductPageVersions/${args.versionId}`, { method: 'PATCH', body: {
      data: { type: 'appCustomProductPageVersions', id: args.versionId, attributes: { deepLink: args.deepLink } },
    } }),
  },
  {
    name: 'apple_list_custom_product_page_localizations',
    description: 'List localizations of a custom product page version; their IDs are the targets for apple_create_placement',
    schema: z.object({ versionId: id }),
    handler: async (client: AppleClient, args: any) => allPages(client, `/appCustomProductPageVersions/${args.versionId}/appCustomProductPageLocalizations`, { limit: '200' }),
  },
  {
    name: 'apple_create_custom_product_page_localization',
    description: 'Add a locale to an editable custom product page version',
    schema: z.object({ versionId: id, locale, promotionalText: z.string().max(170).optional() }),
    handler: async (client: AppleClient, args: any) => client.request('/appCustomProductPageLocalizations', { method: 'POST', body: { data: {
      type: 'appCustomProductPageLocalizations',
      attributes: { locale: args.locale, ...(args.promotionalText !== undefined ? { promotionalText: args.promotionalText } : {}) },
      relationships: { appCustomProductPageVersion: rel('appCustomProductPageVersions', args.versionId) },
    } } }),
  },
  {
    name: 'apple_update_custom_product_page_localization',
    description: 'Change the promotional text of a custom product page localization',
    schema: z.object({ localizationId: id, promotionalText: z.string().max(170) }),
    handler: async (client: AppleClient, args: any) => client.request(`/appCustomProductPageLocalizations/${args.localizationId}`, { method: 'PATCH', body: {
      data: { type: 'appCustomProductPageLocalizations', id: args.localizationId, attributes: { promotionalText: args.promotionalText } },
    } }),
  },
  {
    name: 'apple_delete_custom_product_page_localization',
    description: 'Remove a locale from an editable custom product page version',
    schema: z.object({ localizationId: id }),
    handler: async (client: AppleClient, args: any) => remove(client, '/appCustomProductPageLocalizations', args.localizationId),
  },

  // ── Product Page Optimization ──
  {
    name: 'apple_list_experiments',
    description: 'List product page optimization tests (A/B tests of icon, screenshots and visuals) for an app, with state and dates',
    schema: z.object({ appId: id }),
    handler: async (client: AppleClient, args: any) => allPages(client, `/apps/${args.appId}/appStoreVersionExperimentsV2`, { limit: '200' }),
  },
  {
    name: 'apple_get_experiment',
    description: 'Get a product page optimization test with its treatments',
    schema: z.object({ experimentId: id }),
    handler: async (client: AppleClient, args: any) => client.request(`/v2/appStoreVersionExperiments/${args.experimentId}`, {
      params: { include: 'appStoreVersionExperimentTreatments' },
    }),
  },
  {
    name: 'apple_create_experiment',
    description: 'Create a product page optimization test. trafficProportion is the percentage of visitors sent to the treatments (split evenly); the rest see the original page.',
    schema: z.object({
      appId: id,
      name: z.string().trim().min(1),
      trafficProportion: z.number().int().min(1).max(100),
      platform: z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).default('IOS'),
    }),
    handler: async (client: AppleClient, args: any) => client.request('/v2/appStoreVersionExperiments', { method: 'POST', body: { data: {
      type: 'appStoreVersionExperiments',
      attributes: { name: args.name, trafficProportion: args.trafficProportion, platform: args.platform },
      relationships: { app: rel('apps', args.appId) },
    } } }),
  },
  {
    name: 'apple_update_experiment',
    description: 'Rename a test, change its traffic share, or start it (started=true). New visuals in a test go through App Review before it runs.',
    schema: z.object({
      experimentId: id,
      name: z.string().trim().min(1).optional(),
      trafficProportion: z.number().int().min(1).max(100).optional(),
      started: z.literal(true).optional().describe('Start the test; a running test cannot be un-started'),
    }),
    handler: async (client: AppleClient, args: any) => {
      const attributes: any = {};
      for (const key of ['name', 'trafficProportion', 'started']) if (args[key] !== undefined) attributes[key] = args[key];
      if (!Object.keys(attributes).length) throw new Error('Nothing to update: pass name, trafficProportion or started');
      return client.request(`/v2/appStoreVersionExperiments/${args.experimentId}`, { method: 'PATCH', body: {
        data: { type: 'appStoreVersionExperiments', id: args.experimentId, attributes },
      } });
    },
  },
  {
    name: 'apple_delete_experiment',
    description: 'Delete a product page optimization test that has not run',
    schema: z.object({ experimentId: id }),
    handler: async (client: AppleClient, args: any) => remove(client, '/v2/appStoreVersionExperiments', args.experimentId),
  },
  {
    name: 'apple_list_experiment_treatments',
    description: 'List the treatments (variants) of a product page optimization test',
    schema: z.object({ experimentId: id }),
    handler: async (client: AppleClient, args: any) => allPages(client, `/v2/appStoreVersionExperiments/${args.experimentId}/appStoreVersionExperimentTreatments`, { limit: '200' }),
  },
  {
    name: 'apple_create_experiment_treatment',
    description: 'Add a treatment (variant) to a test. appIconName selects an alternate icon shipped in the binary.',
    schema: z.object({ experimentId: id, name: z.string().trim().min(1), appIconName: z.string().trim().min(1).optional() }),
    handler: async (client: AppleClient, args: any) => client.request('/appStoreVersionExperimentTreatments', { method: 'POST', body: { data: {
      type: 'appStoreVersionExperimentTreatments',
      attributes: { name: args.name, ...(args.appIconName ? { appIconName: args.appIconName } : {}) },
      relationships: { appStoreVersionExperimentV2: rel('appStoreVersionExperiments', args.experimentId) },
    } } }),
  },
  {
    name: 'apple_update_experiment_treatment',
    description: 'Rename a treatment or change its alternate icon',
    schema: z.object({ treatmentId: id, name: z.string().trim().min(1).optional(), appIconName: z.string().trim().min(1).optional() }),
    handler: async (client: AppleClient, args: any) => {
      const attributes: any = {};
      for (const key of ['name', 'appIconName']) if (args[key] !== undefined) attributes[key] = args[key];
      if (!Object.keys(attributes).length) throw new Error('Nothing to update: pass name or appIconName');
      return client.request(`/appStoreVersionExperimentTreatments/${args.treatmentId}`, { method: 'PATCH', body: {
        data: { type: 'appStoreVersionExperimentTreatments', id: args.treatmentId, attributes },
      } });
    },
  },
  {
    name: 'apple_delete_experiment_treatment',
    description: 'Delete a treatment from a test that has not started',
    schema: z.object({ treatmentId: id }),
    handler: async (client: AppleClient, args: any) => remove(client, '/appStoreVersionExperimentTreatments', args.treatmentId),
  },
  {
    name: 'apple_list_treatment_localizations',
    description: 'List localizations of a treatment; their IDs are the targets for apple_create_placement',
    schema: z.object({ treatmentId: id }),
    handler: async (client: AppleClient, args: any) => allPages(client, `/appStoreVersionExperimentTreatments/${args.treatmentId}/appStoreVersionExperimentTreatmentLocalizations`, { limit: '200' }),
  },
  {
    name: 'apple_create_treatment_localization',
    description: 'Add a locale to a treatment so it can get its own screenshots and visuals',
    schema: z.object({ treatmentId: id, locale }),
    handler: async (client: AppleClient, args: any) => client.request('/appStoreVersionExperimentTreatmentLocalizations', { method: 'POST', body: { data: {
      type: 'appStoreVersionExperimentTreatmentLocalizations',
      attributes: { locale: args.locale },
      relationships: { appStoreVersionExperimentTreatment: rel('appStoreVersionExperimentTreatments', args.treatmentId) },
    } } }),
  },
  {
    name: 'apple_delete_treatment_localization',
    description: 'Remove a locale from a treatment',
    schema: z.object({ localizationId: id }),
    handler: async (client: AppleClient, args: any) => remove(client, '/appStoreVersionExperimentTreatmentLocalizations', args.localizationId),
  },
];
