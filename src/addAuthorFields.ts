import { Field, FieldAccess, PayloadRequest } from 'payload';
import type { Config } from 'payload';

import { PluginConfig } from './PluginConfig';
import { authorHook } from './authorHook';

const fieldReadAccess: FieldAccess = (args: { req: PayloadRequest }) =>
  Boolean(args.req.user);

const defaultConfig: Required<PluginConfig> = {
  excludedCollections: [],
  excludedGlobals: [],
  createdByFieldName: 'createdBy',
  updatedByFieldName: 'updatedBy',
  createdByLabel: 'Created By',
  updatedByLabel: 'Updated By',
  createdByFieldEditable: false,
  updatedByFieldEditable: false,
  showInSidebar: true,
  fieldAccess: fieldReadAccess,
  showUndefinedValues: false,
};

export const addAuthorFields =
  (pluginConfig: PluginConfig = {}) =>
  (config: Config): Config => {
    const mergedConfig: Required<PluginConfig> = Object.assign(
      defaultConfig,
      pluginConfig
    );

    const usersSlug = config.admin?.user;
    if (usersSlug === undefined) {
      throw new Error('[addAuthorFields] admin.user field is undefined');
    }

    if (config.collections !== undefined) {
      config.collections
        .filter((x) => !mergedConfig.excludedCollections.includes(x.slug))
        .filter(
          (x) =>
            !x.fields.find(
              (x) => 'name' in x && x.name === mergedConfig.createdByFieldName
            )
        )
        .forEach((x) => {
          x.hooks = {
            ...x.hooks,
            beforeChange: [
              ...((x.hooks && x.hooks.beforeChange) || []),
              authorHook(mergedConfig.updatedByFieldName, usersSlug),
            ],
          };

          x.fields = [
            ...x.fields,
            ...createField({
              slug: x.slug,
              name: mergedConfig.createdByFieldName,
              label: mergedConfig.createdByLabel,
              editable: mergedConfig.createdByFieldEditable,
              usersSlug,
              pluginConfig: mergedConfig,
            }),
            ...createField({
              slug: x.slug,
              name: mergedConfig.updatedByFieldName,
              label: mergedConfig.updatedByLabel,
              editable: mergedConfig.updatedByFieldEditable,
              usersSlug,
              pluginConfig: mergedConfig,
            }),
          ];
        });
    }

    if (config.globals !== undefined) {
      config.globals
        .filter((x) => !mergedConfig.excludedGlobals.includes(x.slug))
        .filter(
          (x) =>
            !x.fields.find(
              (x) => 'name' in x && x.name === mergedConfig.createdByFieldName
            )
        )
        .forEach((x) => {
          x.hooks = {
            ...x.hooks,
            beforeChange: [
              ...((x.hooks && x.hooks.beforeChange) || []),
              authorHook(mergedConfig.updatedByFieldName, usersSlug),
            ],
          };

          x.fields = [
            ...x.fields,
            ...createField({
              slug: x.slug,
              name: mergedConfig.createdByFieldName,
              label: mergedConfig.createdByLabel,
              editable: mergedConfig.createdByFieldEditable,
              usersSlug,
              pluginConfig: mergedConfig,
            }),
            ...createField({
              slug: x.slug,
              name: mergedConfig.updatedByFieldName,
              label: mergedConfig.updatedByLabel,
              editable: mergedConfig.updatedByFieldEditable,
              usersSlug,
              pluginConfig: mergedConfig,
            }),
          ];
        });
    }

    return config;
  };

const createField = ({
  slug,
  name,
  label,
  editable,
  usersSlug,
  pluginConfig,
}: {
  slug: string;
  name: string;
  label: PluginConfig['createdByLabel'] | PluginConfig['updatedByLabel'];
  editable:
    | PluginConfig['createdByFieldEditable']
    | PluginConfig['updatedByFieldEditable'];
  usersSlug: string;
  pluginConfig: PluginConfig;
}): Field[] => {
  let fieldLabel: string | Record<string, string>;
  if ((label as Function).call) {
    fieldLabel = (label as Function).call({}, slug);
  } else {
    fieldLabel = label as string | Record<string, string>;
  }

  let isEditable: boolean;
  if ((editable as Function).call) {
    isEditable = (editable as Function).call({}, slug) as boolean;
  } else {
    isEditable = editable as boolean;
  }

  const relationshipField: Field = {
    name: name,
    type: 'relationship',
    relationTo: [usersSlug],
    defaultValue: (args: any) =>
      args.user
        ? {
            relationTo: usersSlug,
            value: args.user.id,
          }
        : undefined,
    admin: {
      hidden: true,
      readOnly: !isEditable,
      condition: () =>
        typeof window !== 'undefined' &&
        !window.location.pathname.includes('create-first-user'),
    },
    access: {
      read: pluginConfig.fieldAccess,
    },
  };

  const virtualField: Field = {
    name: `${name}Name`,
    label: fieldLabel,
    type: 'text',
    admin: {
      hidden: !pluginConfig.showInSidebar,
      readOnly: true,
      position: 'sidebar',
      condition: () =>
        typeof window !== 'undefined' &&
        !window.location.pathname.includes('create-first-user'),
    },
    access: {
      create: () => false,
      update: () => false,
      read: pluginConfig.fieldAccess,
    },
    hooks: {
      afterRead: [
        async ({ data, req }: any) => {
          if (!data || !data[name]) return '-';
          
          const relationshipData = data[name];
          let userId: string;
          
          if (typeof relationshipData === 'string') {
            userId = relationshipData;
          } else if (relationshipData?.value) {
            userId = relationshipData.value;
          } else {
            return pluginConfig.showUndefinedValues ? '-' : undefined;
          }
          
          try {
            const userDoc = await req.payload.findByID({
              collection: usersSlug,
              id: userId,
              req,
            });
            
            if (userDoc) {
              const userCollection = req.payload.collections[usersSlug];
              const titleField = userCollection.config.admin?.useAsTitle || 'id';
              return userDoc[titleField] || userDoc.id;
            }
          } catch (error) {
            console.error(`[payload-plugin-author-fields] Error fetching user with ID ${userId}:`, error);
          }
          
          return pluginConfig.showUndefinedValues ? '-' : undefined;
        },
      ],
    },
  };

  return [relationshipField, virtualField];
};
