// Metro doit voir le dossier partagé `shared/`, situé au-dessus de `mobile/`.
// Sans ceci, les imports `../shared/ai` ne sont pas résolus par Expo.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedRoot];
// Les dépendances restent cherchées dans mobile/node_modules uniquement.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
